import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { Resend } from 'resend'
import {
  findInviteByToken,
  markInviteSubmitted,
  getAllTemplates,
  appendSubmission,
  isValidEmail,
  escapeHtml,
  sanitizeFilename,
  mergeInviteValues,
} from './lib/formInvites.js'

/**
 * Vercel Serverless Function - token-gated public form access (no auth).
 *
 * GET  ?token=           → safe form metadata for fill UI
 * GET  ?token=&pdf=1     → stream original PDF
 * POST { token, pdfBase64, values } → submit completed form, email owner + recipient
 */

const resend = new Resend(process.env.RESEND_API_KEY)
const DEFAULT_FROM = 'KnockScout <onboarding@resend.dev>'
const FROM_ADDRESS = process.env.FORMS_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || DEFAULT_FROM
const MAX_PDF_BYTES = 8 * 1024 * 1024

const recentSubmitAttempts = new Map()
const SUBMIT_COOLDOWN_MS = 5000

let _s3
function s3() {
  if (_s3) return _s3
  _s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  })
  return _s3
}

async function loadTemplate(templateId) {
  const templates = await getAllTemplates()
  return templates.find((t) => t.id === templateId) || null
}

function inviteErrorStatus(error) {
  if (error === 'not_found') return 404
  if (error === 'submitted' || error === 'expired' || error === 'revoked') return 410
  return 400
}

function inviteErrorMessage(error) {
  if (error === 'not_found') return 'Form link not found'
  if (error === 'submitted') return 'This form has already been submitted'
  if (error === 'revoked') return 'This form link is no longer valid. Ask the sender for a new link.'
  if (error === 'expired') return 'This form link has expired'
  return 'Invalid form link'
}

async function streamPdfFromR2(key) {
  const r = await s3().send(new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
  }))
  const chunks = []
  for await (const c of r.Body) chunks.push(c)
  return Buffer.concat(chunks)
}

function stripSignatureValues(values, fields) {
  const stripped = {}
  const fieldsById = new Map((fields || []).map((f) => [f.id, f]))
  for (const [fieldId, value] of Object.entries(values || {})) {
    const field = fieldsById.get(fieldId)
    if (field && field.type === 'signature') {
      stripped[fieldId] = value ? '[signature]' : ''
    } else if (typeof value === 'boolean') {
      stripped[fieldId] = value
    } else {
      stripped[fieldId] = value == null ? '' : String(value)
    }
  }
  return stripped
}

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    if (req.method === 'GET') {
      const token = String(req.query.token || '').trim()
      if (!token) return res.status(400).json({ error: 'token is required' })

      const { invite, error } = await findInviteByToken(token)
      if (error) {
        return res.status(inviteErrorStatus(error)).json({ error: inviteErrorMessage(error) })
      }

      const template = await loadTemplate(invite.templateId)
      if (!template || !template.originalPdfKey) {
        return res.status(404).json({ error: 'Form template not found' })
      }

      if (req.query.pdf === '1' || req.query.pdf === 'true') {
        try {
          const body = await streamPdfFromR2(template.originalPdfKey)
          res.setHeader('Content-Type', 'application/pdf')
          res.setHeader('Cache-Control', 'private, no-store')
          return res.status(200).send(body)
        } catch (e) {
          if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) {
            return res.status(404).json({ error: 'PDF not found' })
          }
          throw e
        }
      }

      return res.status(200).json({
        templateName: template.name || 'Form',
        fields: template.fields || [],
        recipientEmail: invite.recipientEmail,
        message: invite.message || '',
        prefillValues: invite.prefillValues || {},
        lockedFieldIds: Object.keys(invite.prefillValues || {}),
        status: invite.status,
        expiresAt: invite.expiresAt
      })
    }

    if (req.method === 'POST') {
      const { token, pdfBase64, values } = req.body || {}
      const normalizedToken = String(token || '').trim()
      if (!normalizedToken) return res.status(400).json({ error: 'token is required' })

      const lastAttempt = recentSubmitAttempts.get(normalizedToken)
      if (lastAttempt && Date.now() - lastAttempt < SUBMIT_COOLDOWN_MS) {
        return res.status(429).json({ error: 'Please wait before submitting again' })
      }
      recentSubmitAttempts.set(normalizedToken, Date.now())

      if (!pdfBase64 || typeof pdfBase64 !== 'string') {
        return res.status(400).json({ error: 'pdfBase64 is required' })
      }

      const cleaned = pdfBase64.replace(/^data:application\/pdf;base64,/, '')
      let buf
      try {
        buf = Buffer.from(cleaned, 'base64')
      } catch {
        return res.status(400).json({ error: 'Invalid base64 PDF' })
      }
      if (!buf.length || buf.length > MAX_PDF_BYTES) {
        return res.status(413).json({ error: `PDF must be between 1 byte and ${MAX_PDF_BYTES} bytes` })
      }

      const markResult = await markInviteSubmitted(normalizedToken)
      if (!markResult.ok) {
        return res.status(inviteErrorStatus(markResult.reason)).json({
          error: inviteErrorMessage(markResult.reason)
        })
      }
      const invite = markResult.invite

      const template = await loadTemplate(invite.templateId)
      const templateName = template?.name || 'Form'
      const filename = `${sanitizeFilename(templateName)}_${Date.now()}.pdf`

      const ownerEmail = (invite.ownerEmail || '').trim().toLowerCase()
      const recipientEmail = (invite.recipientEmail || '').trim().toLowerCase()
      const recipients = [...new Set([ownerEmail, recipientEmail].filter(isValidEmail))]

      if (process.env.RESEND_API_KEY && recipients.length > 0) {
        const htmlBody = `
          <p>The form <strong>${escapeHtml(templateName)}</strong> has been completed and submitted.</p>
          <p>The completed PDF is attached.</p>
        `
        const { error } = await resend.emails.send({
          from: FROM_ADDRESS,
          to: recipients,
          subject: `Completed form: ${templateName}`,
          html: htmlBody,
          attachments: [{ filename, content: buf }]
        })
        if (error) {
          console.error('Resend submit error:', error)
          return res.status(500).json({ error: 'Form submitted but email delivery failed', message: error.message })
        }
      }

      const mergedValues = mergeInviteValues(invite, values)

      const submission = {
        id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        templateId: invite.templateId,
        ownerId: invite.ownerId,
        submittedAt: invite.submittedAt,
        recipientEmail,
        sentCopyToSender: false,
        source: 'public_link',
        inviteId: invite.id,
        submitterEmail: recipientEmail,
        values: stripSignatureValues(mergedValues, template?.fields)
      }
      appendSubmission(submission).catch(() => {})

      try {
        const { notifyFormSubmitted } = await import('./push-utils.js')
        await notifyFormSubmitted(ownerEmail, {
          formName: templateName,
          submitterEmail: recipientEmail,
          templateId: invite.templateId,
          inviteId: invite.id
        })
      } catch (e) {
        console.warn('form submit push notify', e.message)
      }

      return res.status(200).json({ success: true, submissionId: submission.id })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('public-form error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
