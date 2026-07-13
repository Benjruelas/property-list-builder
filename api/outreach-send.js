import { Resend } from 'resend'
import { requireAuth } from './_lib/apiAuth.js'
import {
  resolveSenderBranding,
  buildBrandedEmailHtml,
  buildFromAddress,
  escapeHtml,
} from './_lib/senderBranding.js'
import { rateLimit } from './_lib/rateLimit.js'
import { sanitizeHeader } from './_lib/emailSafety.js'

const resend = new Resend(process.env.RESEND_API_KEY)
const DEFAULT_FROM = 'KnockScout <onboarding@resend.dev>'
const FROM_ADDRESS = process.env.FORMS_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || DEFAULT_FROM
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const config = {
  api: { bodyParser: { sizeLimit: '14mb' } },
}

function isValidEmail(e) {
  return typeof e === 'string' && EMAIL_RE.test(e.trim())
}

function normalizeEmailList(raw) {
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  const out = []
  for (const item of raw) {
    const email = typeof item === 'string' ? item.trim().toLowerCase() : ''
    if (!isValidEmail(email) || seen.has(email)) continue
    seen.add(email)
    out.push(email)
  }
  return out
}

function sanitizeFilename(name) {
  const base = String(name || 'attachment').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
  return base || 'attachment'
}

function decodeAttachments(raw) {
  if (!Array.isArray(raw)) return { attachments: [], totalBytes: 0 }
  const attachments = []
  let totalBytes = 0
  for (const item of raw) {
    if (!item || typeof item.contentBase64 !== 'string') continue
    const cleaned = item.contentBase64.replace(/^data:[^;]+;base64,/, '')
    let buf
    try {
      buf = Buffer.from(cleaned, 'base64')
    } catch {
      throw new Error(`Invalid attachment data for ${item.filename || 'file'}`)
    }
    if (!buf.length) continue
    totalBytes += buf.length
    if (totalBytes > MAX_ATTACHMENT_BYTES) {
      throw new Error(`Attachments must be ${MAX_ATTACHMENT_BYTES} bytes or less`)
    }
    attachments.push({
      filename: sanitizeFilename(item.filename),
      content: buf,
      contentType: typeof item.contentType === 'string' ? item.contentType : undefined,
    })
  }
  return { attachments, totalBytes }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const user = await requireAuth(req, res)
  if (!user) return

  const rl = await rateLimit({ key: `outreach-send:${user.uid}`, limit: 100, windowSec: 3600 })
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter))
    return res.status(429).json({ error: 'Too many sends. Please try again later.', retryAfter: rl.retryAfter })
  }

  try {
    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({ error: 'Email service not configured. Please set RESEND_API_KEY.' })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const {
      recipientEmail,
      cc: ccRaw,
      subject,
      message,
      sendMeCopy,
      attachments: attachmentsRaw,
    } = body

    if (!isValidEmail(recipientEmail)) {
      return res.status(400).json({ error: 'Valid recipientEmail is required' })
    }

    const to = recipientEmail.trim().toLowerCase()
    const cc = normalizeEmailList(ccRaw).filter((email) => email !== to)

    let decodedAttachments
    try {
      decodedAttachments = decodeAttachments(attachmentsRaw)
    } catch (err) {
      const status = err.message.includes('bytes or less') ? 413 : 400
      return res.status(status).json({ error: err.message })
    }

    const safeSubject = sanitizeHeader(subject || 'Message from KnockScout', 200)
    const safeMessage = String(message || '').slice(0, 8000)
    const branding = await resolveSenderBranding(user)
    const innerHtml = safeMessage
      ? `<p>${escapeHtml(safeMessage).replace(/\n/g, '<br/>')}</p>`
      : '<p></p>'
    const htmlBody = buildBrandedEmailHtml({ branding, bodyHtml: innerHtml })

    const userEmail = typeof user.email === 'string' && isValidEmail(user.email)
      ? user.email.trim()
      : null
    const replyTo = (branding.companyEmail && isValidEmail(branding.companyEmail))
      ? branding.companyEmail.trim()
      : userEmail

    const alreadyRecipient = new Set([to, ...cc])
    const bccList = (sendMeCopy && userEmail && !alreadyRecipient.has(userEmail.toLowerCase()))
      ? [userEmail]
      : null

    const resendAttachments = decodedAttachments.attachments.map(({ filename, content }) => ({
      filename,
      content,
    }))

    const { data, error } = await resend.emails.send({
      from: buildFromAddress(FROM_ADDRESS, branding.businessName),
      to: [to],
      ...(cc.length ? { cc } : {}),
      ...(replyTo ? { replyTo } : {}),
      ...(bccList ? { bcc: bccList } : {}),
      subject: safeSubject,
      html: htmlBody,
      ...(resendAttachments.length ? { attachments: resendAttachments } : {}),
    })

    if (error) {
      console.error('Resend outreach error:', error)
      return res.status(500).json({ error: 'Failed to send email', message: error.message })
    }

    return res.status(200).json({
      success: true,
      id: data?.id,
      sentCopyToSender: !!bccList,
    })
  } catch (err) {
    console.error('outreach-send error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
