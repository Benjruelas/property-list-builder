import { Resend } from 'resend'
import { resolveDevBypassUser } from './lib/devBypassUsers.js'
import { getAllTeams, fullTeamsIndex, resolveAccess } from './lib/teams.js'
import {
  getAllInvites,
  saveAllInvites,
  getAllTemplates,
  generateToken,
  INVITE_EXPIRY_DAYS,
  isValidEmail,
  escapeHtml,
  supersedePendingInvites,
  hasPriorInviteForRecipient,
  sanitizePrefillValues,
} from './lib/formInvites.js'
import {
  resolveSenderBranding,
  buildBrandedEmailHtml,
  buildFromAddress,
} from './lib/senderBranding.js'

/**
 * Vercel Serverless Function - create a single-use public form invite link
 * and email it to a recipient via Resend.
 *
 * POST (auth'd): { templateId, recipientEmail, subject?, message? }
 */

const resend = new Resend(process.env.RESEND_API_KEY)
const DEFAULT_FROM = 'KnockScout <onboarding@resend.dev>'
const FROM_ADDRESS = process.env.FORMS_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || DEFAULT_FROM

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

function resolveOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host || ''
  if (host) return `${proto}://${host}`
  const origin = req.headers.origin
  if (origin) return origin
  return 'https://localhost'
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

    const { templateId, recipientEmail, subject, message, prefillValues } = req.body || {}
    if (!templateId) return res.status(400).json({ error: 'templateId is required' })
    if (!isValidEmail(recipientEmail)) {
      return res.status(400).json({ error: 'Valid recipientEmail is required' })
    }

    const [templates, allTeams] = await Promise.all([getAllTemplates(), getAllTeams()])
    const template = templates.find((t) => t.id === String(templateId))
    if (!template) return res.status(404).json({ error: 'Template not found' })
    if (!template.originalPdfKey) {
      return res.status(400).json({ error: 'Template has no PDF source' })
    }

    const teamsIndex = fullTeamsIndex(allTeams)
    const access = resolveAccess(template, user, teamsIndex)
    if (!access) {
      return res.status(403).json({ error: 'You do not have access to this template' })
    }

    const token = generateToken()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const trimmedRecipient = recipientEmail.trim().toLowerCase()
    const safeMessage = String(message || '').slice(0, 4000)
    const templateName = String(template.name || 'Form').slice(0, 200)

    const allInvites = await getAllInvites()
    const isResend = hasPriorInviteForRecipient(allInvites, {
      templateId: template.id,
      recipientEmail: trimmedRecipient,
    })
    const safeSubject = String(
      subject || `Please complete: ${templateName}${isResend ? ' (new link)' : ''}`
    ).slice(0, 200)

    const safePrefillValues = sanitizePrefillValues(prefillValues, template.fields || [])
    const prefillCount = Object.keys(safePrefillValues).length

    const invite = {
      id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      token,
      templateId: template.id,
      ownerId: template.ownerId,
      ownerEmail: (template.ownerEmail || user.email || '').toLowerCase(),
      recipientEmail: trimmedRecipient,
      message: safeMessage,
      prefillValues: safePrefillValues,
      status: 'pending',
      createdAt: now.toISOString(),
      expiresAt,
      submittedAt: null
    }

    const { invites: nextInvites } = supersedePendingInvites(allInvites, {
      templateId: template.id,
      recipientEmail: trimmedRecipient,
      keepToken: token,
    })
    nextInvites.push(invite)
    await saveAllInvites(nextInvites)

    const appOrigin = resolveOrigin(req)
    const formLink = `${appOrigin}/?form=${encodeURIComponent(token)}`

    const branding = await resolveSenderBranding(user)
    const senderLabel = branding.senderName
    const innerHtml = `
      <p>${escapeHtml(senderLabel)} has asked you to complete a form: <strong>${escapeHtml(templateName)}</strong>.</p>
      ${isResend ? '<p><strong>This is a new link.</strong> Any previous link sent to this address for this form is no longer valid.</p>' : ''}
      ${prefillCount > 0 ? `<p>Some fields have already been filled in. Please complete the remaining fields.</p>` : ''}
      ${safeMessage ? `<p>${escapeHtml(safeMessage).replace(/\n/g, '<br/>')}</p>` : ''}
      <p><a href="${escapeHtml(formLink)}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Open form</a></p>
      <p style="color:#666;font-size:13px;">This link is for ${escapeHtml(trimmedRecipient)} and expires in ${INVITE_EXPIRY_DAYS} days. It can only be used once.</p>
    `
    const htmlBody = buildBrandedEmailHtml({ branding, bodyHtml: innerHtml })

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const userEmail = typeof user.email === 'string' && EMAIL_RE.test(user.email.trim())
      ? user.email.trim()
      : null
    const replyTo = (branding.companyEmail && EMAIL_RE.test(branding.companyEmail.trim()))
      ? branding.companyEmail.trim()
      : userEmail

    const { error } = await resend.emails.send({
      from: buildFromAddress(FROM_ADDRESS, branding.businessName),
      to: [trimmedRecipient],
      ...(replyTo ? { replyTo } : {}),
      subject: safeSubject,
      html: htmlBody,
      headers: {
        'X-Entity-Ref-ID': invite.id,
      },
    })

    if (error) {
      console.error('Resend invite error:', error)
      return res.status(500).json({ error: 'Failed to send invite email', message: error.message })
    }

    return res.status(200).json({
      inviteId: invite.id,
      expiresAt: invite.expiresAt,
      recipientEmail: trimmedRecipient,
      formLink,
      isResend,
    })
  } catch (err) {
    console.error('forms-invite error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
