/**
 * Vercel Serverless Function
 * Exports a property list as CSV and emails it to the user.
 *
 * POST body: { listName, csvContent, userEmail }
 * Requires: RESEND_API_KEY environment variable
 */

import { Resend } from 'resend'
import { requireAuth } from './lib/apiAuth.js'
import { rateLimit } from './lib/rateLimit.js'
import { escapeHtml, sanitizeHeader, isValidEmail } from './lib/emailSafety.js'
import { applyCors } from './lib/cors.js'

const resend = new Resend(process.env.RESEND_API_KEY)

// Shared `onboarding@resend.dev` can only deliver to the Resend account
// owner's own email; set RESEND_FROM_EMAIL (or EXPORT_FROM_EMAIL) to a
// verified-domain address to send to anyone.
const DEFAULT_FROM = 'KnockScout <onboarding@resend.dev>'
const FROM_ADDRESS = process.env.EXPORT_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || DEFAULT_FROM

export default async function handler(req, res) {
  applyCors(req, res, { methods: 'POST, OPTIONS' })

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const user = await requireAuth(req, res)
  if (!user) return

  // Deliver only to the verified account email — never a client-supplied
  // address — so this endpoint cannot be used as an open email relay.
  const recipient = user.email
  if (!recipient || !isValidEmail(recipient)) {
    return res.status(400).json({ error: 'Your account has no valid email address to send to.' })
  }

  const rl = await rateLimit({ key: `export-list:${user.uid}`, limit: 30, windowSec: 3600 })
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter))
    return res.status(429).json({ error: 'Too many exports. Please try again later.', retryAfter: rl.retryAfter })
  }

  try {
    const { listName, csvContent } = req.body || {}

    if (!listName || !csvContent) {
      return res.status(400).json({
        error: 'Missing required fields: listName and csvContent are required'
      })
    }

    if (typeof csvContent !== 'string' || csvContent.length > 5_000_000) {
      return res.status(413).json({ error: 'Export is too large.' })
    }

    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({
        error: 'Email service not configured. Please set RESEND_API_KEY.'
      })
    }

    const safeName = sanitizeHeader(listName, 120)
    const sanitizedFilename = safeName.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 50) || 'list'
    const filename = `${sanitizedFilename}_export_${Date.now()}.csv`

    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [recipient],
      subject: sanitizeHeader(`Your exported list: ${safeName}`, 180),
      html: `<p>Please find your exported property list attached.</p><p>List: ${escapeHtml(safeName)}</p><p>Exported on ${new Date().toLocaleDateString()}.</p>`,
      attachments: [
        {
          filename,
          content: Buffer.from(csvContent, 'utf-8')
        }
      ]
    })

    if (error) {
      console.error('Resend error:', error)
      return res.status(500).json({
        error: 'Failed to send email',
        message: error.message
      })
    }

    return res.status(200).json({
      success: true,
      message: `Export sent to ${recipient}`,
      id: data?.id
    })
  } catch (err) {
    console.error('Export list error:', err)
    return res.status(500).json({
      error: 'Internal server error',
      message: err.message
    })
  }
}
