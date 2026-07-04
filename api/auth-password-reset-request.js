/**
 * POST { email } — sends a branded password reset email from @knockscout.com via Resend.
 * Generates a short https://knockscout.app/reset-password?oobCode=… link with Firebase Admin.
 */

import { Resend } from 'resend'
import { applyCors } from './lib/cors.js'
import { rateLimit } from './lib/rateLimit.js'
import { isValidEmail, sanitizeHeader } from './lib/emailSafety.js'
import { createPasswordResetLink } from './lib/firebaseAdmin.js'
import {
  buildPasswordResetEmailHtml,
  buildPasswordResetSubject,
  getAuthFromAddress,
} from './lib/authEmail.js'
import { createHash } from 'crypto'

const resend = new Resend(process.env.RESEND_API_KEY)

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim()
  }
  return req.socket?.remoteAddress || 'unknown'
}

function emailHash(email) {
  return createHash('sha256').update(String(email).toLowerCase()).digest('hex').slice(0, 16)
}

export default async function handler(req, res) {
  applyCors(req, res, { methods: 'POST, OPTIONS' })

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { email: rawEmail } = req.body || {}
  const email = String(rawEmail || '').trim().toLowerCase()

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' })
  }

  const ip = clientIp(req)
  const ipRl = await rateLimit({ key: `pwd-reset:ip:${ip}`, limit: 20, windowSec: 3600 })
  if (!ipRl.allowed) {
    res.setHeader('Retry-After', String(ipRl.retryAfter))
    return res.status(429).json({ error: 'Too many requests. Please try again later.', retryAfter: ipRl.retryAfter })
  }

  const emailRl = await rateLimit({ key: `pwd-reset:email:${emailHash(email)}`, limit: 5, windowSec: 3600 })
  if (!emailRl.allowed) {
    res.setHeader('Retry-After', String(emailRl.retryAfter))
    return res.status(429).json({ error: 'Too many reset attempts for this email. Please try again later.', retryAfter: emailRl.retryAfter })
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(503).json({ error: 'Email service not configured.' })
  }

  try {
    const resetLink = await createPasswordResetLink(email)

    const { error } = await resend.emails.send({
      from: getAuthFromAddress(),
      to: [email],
      subject: buildPasswordResetSubject(),
      html: buildPasswordResetEmailHtml({ resetLink, recipientEmail: email }),
    })

    if (error) {
      console.error('Password reset email error:', error)
      return res.status(500).json({ error: 'Failed to send password reset email.' })
    }

    return res.status(200).json({
      success: true,
      message: 'If an account exists for this email, a reset link has been sent.',
    })
  } catch (err) {
    const code = err?.code || err?.errorInfo?.code || ''

    if (code === 'auth/user-not-found') {
      return res.status(200).json({
        success: true,
        message: 'If an account exists for this email, a reset link has been sent.',
      })
    }

    if (code === 'auth/invalid-email') {
      return res.status(400).json({ error: 'Invalid email address.' })
    }

    console.error('Password reset request error:', err)
    return res.status(500).json({ error: 'Failed to send password reset email.' })
  }
}
