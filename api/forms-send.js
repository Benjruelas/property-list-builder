import { Resend } from 'resend'
import { resolveDevBypassUser } from './lib/devBypassUsers.js'

/**
 * Vercel Serverless Function - emails a flattened form PDF and records the submission.
 *
 * POST (auth'd): { pdfBase64, recipientEmail, subject, message, templateId, values? }
 * - Uses Resend (existing convention from api/export-list.js).
 * - Appends a FormSubmission record to KV key `user_form_submissions`.
 */

const resend = new Resend(process.env.RESEND_API_KEY)
const MAX_PDF_BYTES = 8 * 1024 * 1024

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

async function verifyFirebaseToken(idToken) {
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY
  if (!apiKey || !idToken) return null
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
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

function sanitizeFilename(s) {
  return String(s || 'form').replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 60) || 'form'
}

function isValidEmail(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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

  const authHeader = req.headers.authorization
  const idToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  const host = req.headers.host || req.headers['x-forwarded-host'] || ''
  const origin = req.headers.origin || ''
  const isLocalhost = /localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0/.test(host) || /localhost|127\.0\.0\.1|\[::1\]/.test(origin)
  const allowDevBypass = isLocalhost || process.env.ENABLE_DEV_BYPASS === 'true'
  let user = allowDevBypass ? resolveDevBypassUser(idToken) : null
  if (!user) user = await verifyFirebaseToken(idToken)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  try {
    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({ error: 'Email service not configured. Please set RESEND_API_KEY.' })
    }

    const {
      pdfBase64,
      recipientEmail,
      subject,
      message,
      templateId,
      templateName,
      values
    } = req.body || {}

    if (!pdfBase64 || typeof pdfBase64 !== 'string') {
      return res.status(400).json({ error: 'pdfBase64 is required' })
    }
    if (!isValidEmail(recipientEmail)) {
      return res.status(400).json({ error: 'Valid recipientEmail is required' })
    }
    if (!templateId) return res.status(400).json({ error: 'templateId is required' })

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

    const safeSubject = String(subject || `Completed form: ${templateName || 'Form'}`).slice(0, 200)
    const safeMessage = String(message || '').slice(0, 4000)
    const filename = `${sanitizeFilename(templateName || templateId)}_${Date.now()}.pdf`

    const htmlBody = `
      <p>${escapeHtml(user.email)} has sent you a completed form.</p>
      ${safeMessage ? `<p>${escapeHtml(safeMessage).replace(/\n/g, '<br/>')}</p>` : ''}
      <p>The completed PDF is attached.</p>
    `

    // Only include `replyTo` when we actually have a well-formed email
    // address — Resend rejects empty strings / missing local-parts / domains.
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const replyToEmail = typeof user.email === 'string' && EMAIL_RE.test(user.email.trim())
      ? user.email.trim()
      : null

    const { data, error } = await resend.emails.send({
      from: 'Property List Builder <onboarding@resend.dev>',
      to: [recipientEmail.trim()],
      ...(replyToEmail ? { replyTo: replyToEmail } : {}),
      subject: safeSubject,
      html: htmlBody,
      attachments: [{ filename, content: buf }]
    })

    if (error) {
      console.error('Resend error:', error)
      return res.status(500).json({ error: 'Failed to send email', message: error.message })
    }

    const submission = {
      id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      templateId: String(templateId),
      ownerId: user.uid,
      submittedAt: new Date().toISOString(),
      recipientEmail: recipientEmail.trim().toLowerCase(),
      values: values && typeof values === 'object' ? values : {}
    }
    appendSubmission(submission).catch(() => {})

    return res.status(200).json({ success: true, id: data?.id, submissionId: submission.id })
  } catch (err) {
    console.error('forms-send error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
