import { Resend } from 'resend'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import {resolveDevBypassUser, isDevBypassAllowed} from './lib/devBypassUsers.js'
import {
  generateReportToken,
  REPORT_INVITE_EXPIRY_DAYS,
  getAllReportInvites,
  saveAllReportInvites,
} from './lib/reportInvites.js'
import { getPhotoReportById, updatePhotoReportAtIndex } from './lib/reportStore.js'
import { getLeadWithAccess } from './lib/leadAccess.js'
import {
  resolveSenderBranding,
  buildBrandedEmailHtml,
  buildFromAddress,
  escapeHtml,
} from './lib/senderBranding.js'

const resend = new Resend(process.env.RESEND_API_KEY)
const DEFAULT_FROM = 'KnockScout <onboarding@resend.dev>'
const FROM_ADDRESS = process.env.FORMS_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || DEFAULT_FROM

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

function isValidEmail(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())
}

async function verifyFirebaseToken(idToken) {
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY
  if (!apiKey || !idToken) return null
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    )
    if (!r.ok) return null
    const data = await r.json()
    const user = data.users && data.users[0]
    if (!user) return null
    return { uid: user.localId, email: (user.email || '').toLowerCase() }
  } catch (e) {
    console.error('Token verify error', e.message)
    return null
  }
}

function resolveOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host || ''
  if (host) return `${proto}://${host}`
  return req.headers.origin || 'https://localhost'
}

export const config = {
  api: { bodyParser: { sizeLimit: '2mb' } },
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const authHeader = req.headers.authorization
  const idToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  const allowDevBypass = isDevBypassAllowed(req)
  let user = allowDevBypass ? resolveDevBypassUser(idToken) : null
  if (!user) user = await verifyFirebaseToken(idToken)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const { reportId, recipientEmail, subject, message, generateOnly } = body
    if (!reportId) return res.status(400).json({ error: 'reportId is required' })

    const { report, index, all } = await getPhotoReportById(reportId)
    if (!report || report.ownerId !== user.uid) {
      return res.status(404).json({ error: 'Report not found' })
    }
    if (!report.pdfKey) {
      return res.status(400).json({ error: 'Generate PDF before sending' })
    }

    const token = generateReportToken()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + REPORT_INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const publicUrl = `${resolveOrigin(req)}/?report=${token}`

    const invites = await getAllReportInvites()
    invites.push({
      token,
      reportId: report.id,
      ownerId: user.uid,
      status: 'pending',
      createdAt: now.toISOString(),
      expiresAt,
    })
    await saveAllReportInvites(invites)

    const updated = {
      ...report,
      publicToken: token,
      status: 'sent',
      sentAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }
    await updatePhotoReportAtIndex(all, index, updated)

    if (generateOnly) {
      return res.status(200).json({ report: updated, publicUrl, token })
    }

    if (!isValidEmail(recipientEmail)) {
      return res.status(400).json({ error: 'Valid recipientEmail is required' })
    }
    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({ error: 'Email service not configured' })
    }

    const branding = await resolveSenderBranding(user)
    const safeSubject = String(subject || `Photo report: ${report.title}`).slice(0, 200)
    const safeMessage = String(message || '').slice(0, 4000)
    const innerHtml = `<p>${escapeHtml(safeMessage).replace(/\n/g, '<br/>')}</p>
        <p><a href="${publicUrl}">View photo report</a></p>`
    const htmlBody = buildBrandedEmailHtml({ branding, bodyHtml: innerHtml })

    let pdfAttachment = null
    try {
      const r = await s3().send(new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: report.pdfKey,
      }))
      const chunks = []
      for await (const c of r.Body) chunks.push(c)
      const pdfBuf = Buffer.concat(chunks)
      pdfAttachment = {
        filename: `${(report.title || 'report').replace(/[^a-z0-9-_ ]/gi, '_')}.pdf`,
        content: pdfBuf.toString('base64'),
      }
    } catch (e) {
      console.warn('pdf attach failed', e.message)
    }

    const emailPayload = {
      from: buildFromAddress(FROM_ADDRESS, branding.businessName),
      to: recipientEmail.trim(),
      subject: safeSubject,
      html: htmlBody,
    }
    if (pdfAttachment) {
      emailPayload.attachments = [pdfAttachment]
    }

    await resend.emails.send(emailPayload)

    return res.status(200).json({
      report: updated,
      publicUrl,
      token,
      sentTo: recipientEmail.trim(),
    })
  } catch (err) {
    console.error('photo-reports-send error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
