import { Resend } from 'resend'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { requireAuth } from './_lib/apiAuth.js'
import {
  resolveSendAsSender,
  buildBrandedEmailHtml,
  buildFromAddress,
  escapeHtml,
} from './_lib/senderBranding.js'
import { getAllTeams } from './_lib/teams.js'
import { getAllFormTemplates } from './_lib/formTemplateStore.js'
import { buildAccessContext, getResourceAccess, canView } from './_lib/resourceContext.js'
import { canonicalFormSubmissionPdfKey } from './_lib/formPdfKey.js'
import { rateLimit } from './_lib/rateLimit.js'
import { sanitizeHeader } from './_lib/emailSafety.js'

/**
 * Vercel Serverless Function - emails a flattened form PDF and records the submission.
 *
 * POST (auth'd): { pdfBase64, recipientEmail, subject, message, templateId, values? }
 * - Uses Resend (existing convention from api/export-list.js).
 * - Appends a FormSubmission record to KV key `user_form_submissions`.
 */

const resend = new Resend(process.env.RESEND_API_KEY)
const MAX_PDF_BYTES = 8 * 1024 * 1024

// Resend's shared `onboarding@resend.dev` sender only allows delivery to the
// Resend account owner's own email. To actually send forms to arbitrary
// recipients the deployer must verify a domain in Resend and set
// FORMS_FROM_EMAIL (e.g. "KnockScout <forms@msg.knockscout.com>").
const DEFAULT_FROM = 'KnockScout <onboarding@resend.dev>'
const FROM_ADDRESS = process.env.FORMS_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || DEFAULT_FROM

let kv = null
let kvAvailable = false

if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  try {
    const kvModule = await import('@vercel/kv')
    kv = kvModule.kv
    kvAvailable = true
  } catch (e) {
    kvAvailable = false
  }
} else if (process.env.REDIS_URL) {
  try {
    const { createClient } = await import('redis')
    kv = createClient({ url: process.env.REDIS_URL })
    await kv.connect()
    kvAvailable = true
  } catch (e) {
    kvAvailable = false
  }
}

const KV_KEY = 'user_form_submissions'
let fallbackStore = []

async function appendSubmission(record) {
  if (!kvAvailable || !kv) {
    fallbackStore.push(record)
    return
  }
  try {
    const data = await kv.get(KV_KEY)
    const parsed = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    const all = Array.isArray(parsed) ? parsed : []
    all.push(record)
    await kv.set(KV_KEY, all).catch(() => kv.set(KV_KEY, JSON.stringify(all)))
  } catch (e) {
    console.warn('submission save failed', e.message)
  }
}

function sanitizeFilename(s) {
  return String(s || 'form').replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 60) || 'form'
}

function isValidEmail(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())
}

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const user = await requireAuth(req, res)
  if (!user) return

  const rl = await rateLimit({ key: `forms-send:${user.uid}`, limit: 100, windowSec: 3600 })
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter))
    return res.status(429).json({ error: 'Too many sends. Please try again later.', retryAfter: rl.retryAfter })
  }

  try {
    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({ error: 'Email service not configured. Please set RESEND_API_KEY.' })
    }

    const {
      pdfBase64,
      recipientEmail,
      recipientPhone,
      subject,
      message,
      templateId,
      templateName,
      values,
      sendMeCopy,
      leadId,
      leadName,
      senderUid,
    } = req.body || {}

    if (!pdfBase64 || typeof pdfBase64 !== 'string') {
      return res.status(400).json({ error: 'pdfBase64 is required' })
    }
    if (!isValidEmail(recipientEmail)) {
      return res.status(400).json({ error: 'Valid recipientEmail is required' })
    }
    if (!templateId) return res.status(400).json({ error: 'templateId is required' })

    const senderResult = await resolveSendAsSender({ actingUser: user, senderUid })
    if (senderResult.error) {
      return res.status(senderResult.status || 400).json({ error: senderResult.error })
    }
    const branding = senderResult.branding

    // Verify the caller actually has access to this template so submissions
    // can't be attributed to someone else's template.
    const [templates, allTeams] = await Promise.all([getAllFormTemplates(), getAllTeams()])
    const template = templates.find((t) => t.id === String(templateId))
    if (!template) return res.status(404).json({ error: 'Template not found' })
    const ctx = buildAccessContext(allTeams, user)
    if (!canView(getResourceAccess(template, user, ctx))) {
      return res.status(403).json({ error: 'You do not have access to this template' })
    }

    const cleaned = pdfBase64.replace(/^data:application\/pdf;base64,/, '')
    let buf
    try {
      buf = Buffer.from(cleaned, 'base64')
    } catch (e) {
      return res.status(400).json({ error: 'Invalid base64 PDF' })
    }
    if (!buf.length || buf.length > MAX_PDF_BYTES) {
      return res.status(413).json({ error: `PDF must be between 1 byte and ${MAX_PDF_BYTES} bytes` })
    }

    const displayName = templateName || template.name || 'Form'
    const safeSubject = sanitizeHeader(subject || `Form: ${displayName}`, 200)
    const safeMessage = String(message || '').slice(0, 4000)
    const filename = `${sanitizeFilename(displayName)}_${Date.now()}.pdf`

    const innerHtml = `
      <p>${escapeHtml(branding.senderName)} has sent you a form: <strong>${escapeHtml(displayName)}</strong>.</p>
      ${safeMessage ? `<p>${escapeHtml(safeMessage).replace(/\n/g, '<br/>')}</p>` : ''}
      <p>The PDF is attached.</p>
    `
    const htmlBody = buildBrandedEmailHtml({ branding, bodyHtml: innerHtml })

    // Only include `replyTo` / `bcc` when we actually have a well-formed
    // email address — Resend rejects empty strings / missing local-parts.
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const senderEmail = typeof senderResult.email === 'string' && EMAIL_RE.test(senderResult.email.trim())
      ? senderResult.email.trim()
      : null
    const userEmail = typeof user.email === 'string' && EMAIL_RE.test(user.email.trim())
      ? user.email.trim()
      : null
    const replyTo = (branding.companyEmail && EMAIL_RE.test(branding.companyEmail.trim()))
      ? branding.companyEmail.trim()
      : (senderEmail || userEmail)

    // "Send me a copy" — BCC the signed-in user on the same message. Skip it
    // when the user is also the recipient (avoids a duplicate in their inbox).
    // Always include template creator (+ acting sender) so they retain a PDF copy.
    const creatorEmail = typeof template.ownerEmail === 'string' && EMAIL_RE.test(template.ownerEmail.trim())
      ? template.ownerEmail.trim().toLowerCase()
      : null
    const bccTarget = userEmail || senderEmail
    const recipientLower = recipientEmail.trim().toLowerCase()
    const bccSet = new Set()
    if (sendMeCopy && bccTarget && bccTarget.toLowerCase() !== recipientLower) {
      bccSet.add(bccTarget.toLowerCase())
    }
    if (creatorEmail && creatorEmail !== recipientLower) bccSet.add(creatorEmail)
    if (senderEmail && senderEmail.toLowerCase() !== recipientLower) {
      bccSet.add(senderEmail.toLowerCase())
    }
    const bccList = bccSet.size > 0 ? [...bccSet] : null

    const { data, error } = await resend.emails.send({
      from: buildFromAddress(FROM_ADDRESS, branding.businessName),
      to: [recipientEmail.trim()],
      ...(replyTo ? { replyTo } : {}),
      ...(bccList ? { bcc: bccList } : {}),
      subject: safeSubject,
      html: htmlBody,
      attachments: [{ filename, content: buf }]
    })

    if (error) {
      console.error('Resend error:', error)
      return res.status(500).json({ error: 'Failed to send email', message: error.message })
    }

    const submissionId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    const pdfKey = canonicalFormSubmissionPdfKey(template.ownerId || user.uid, String(templateId), submissionId)
    let storedPdfKey = null
    if (pdfKey && process.env.R2_BUCKET_NAME && process.env.R2_ACCOUNT_ID) {
      try {
        const client = new S3Client({
          region: 'auto',
          endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
          credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
          },
        })
        await client.send(new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: pdfKey,
          Body: buf,
          ContentType: 'application/pdf',
        }))
        storedPdfKey = pdfKey
      } catch (e) {
        console.warn('forms-send PDF upload failed', e.message)
      }
    }

    const submission = {
      id: submissionId,
      templateId: String(templateId),
      ownerId: template.ownerId || user.uid,
      submittedAt: new Date().toISOString(),
      recipientEmail: recipientEmail.trim().toLowerCase(),
      recipientPhone: recipientPhone ? String(recipientPhone).replace(/\D/g, '').slice(-10) : null,
      leadId: leadId ? String(leadId).trim().slice(0, 80) : null,
      leadName: leadName ? String(leadName).trim().slice(0, 200) : null,
      sentCopyToSender: !!bccList,
      source: 'pdf_attachment',
      pdfKey: storedPdfKey,
      values: values && typeof values === 'object' ? values : {}
    }
    appendSubmission(submission).catch(() => {})

    return res.status(200).json({ success: true, id: data?.id, submissionId: submission.id })
  } catch (err) {
    console.error('forms-send error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
