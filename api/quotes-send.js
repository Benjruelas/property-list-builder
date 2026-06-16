import { Resend } from 'resend'
import {resolveDevBypassUser, isDevBypassAllowed} from './lib/devBypassUsers.js'
import {
  generateToken,
  INVITE_EXPIRY_DAYS,
  isValidEmail,
  escapeHtml,
  getAllQuoteInvites,
  saveAllQuoteInvites,
  supersedePendingQuoteInvites,
  hasPriorQuoteInvite,
} from './lib/quoteInvites.js'
import { getQuoteById, updateQuoteAtIndex } from './lib/quoteStore.js'
import { logTeamActivity, actorLabel } from './lib/activityLog.js'
import {
  resolveSenderBranding,
  buildBrandedEmailHtml,
  buildFromAddress,
} from './lib/senderBranding.js'

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
    const { quoteId, recipientEmail, subject, message, recipientPhone, generateOnly } = body
    if (!quoteId) return res.status(400).json({ error: 'quoteId is required' })
    if (!isValidEmail(recipientEmail)) {
      return res.status(400).json({ error: 'Valid recipientEmail is required' })
    }

    if (!generateOnly && !process.env.RESEND_API_KEY) {
      return res.status(500).json({ error: 'Email service not configured. Please set RESEND_API_KEY.' })
    }

    const { quote, index, all } = await getQuoteById(quoteId)
    if (!quote || quote.ownerId !== user.uid) {
      return res.status(404).json({ error: 'Quote not found' })
    }

    const token = generateToken()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const trimmedRecipient = recipientEmail.trim().toLowerCase()
    const safeMessage = String(message || '').slice(0, 4000)
    const quoteTitle = String(quote.title || 'Quote').slice(0, 200)

    const allInvites = await getAllQuoteInvites()
    const isResend = hasPriorQuoteInvite(allInvites, { quoteId, recipientEmail: trimmedRecipient })
    const safeSubject = String(
      subject || `Quote: ${quoteTitle}${isResend ? ' (new link)' : ''}`
    ).slice(0, 200)

    const invite = {
      id: `qinv_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      token,
      quoteId: quote.id,
      ownerId: quote.ownerId,
      ownerEmail: (quote.ownerEmail || user.email || '').toLowerCase(),
      recipientEmail: trimmedRecipient,
      recipientPhone: recipientPhone ? String(recipientPhone).slice(0, 40) : null,
      message: safeMessage,
      status: 'pending',
      createdAt: now.toISOString(),
      expiresAt,
    }

    const { invites: nextInvites } = supersedePendingQuoteInvites(allInvites, {
      quoteId: quote.id,
      recipientEmail: trimmedRecipient,
      keepToken: token,
    })
    nextInvites.push(invite)
    await saveAllQuoteInvites(nextInvites)

    const appOrigin = resolveOrigin(req)
    const quoteLink = `${appOrigin}/?quote=${encodeURIComponent(token)}`

    if (generateOnly) {
      const updatedQuote = {
        ...quote,
        clientEmail: trimmedRecipient,
        clientPhone: invite.recipientPhone || quote.clientPhone,
        status: quote.status === 'draft' ? 'sent' : quote.status,
        sentAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }
      await updateQuoteAtIndex(all, index, updatedQuote)
      return res.status(200).json({
        inviteId: invite.id,
        expiresAt: invite.expiresAt,
        recipientEmail: trimmedRecipient,
        quoteLink,
        quote: updatedQuote,
      })
    }

    const branding = await resolveSenderBranding(user)
    const senderLabel = branding.senderName
    const totalStr = quote.total != null ? `$${Number(quote.total).toFixed(2)}` : ''
    const innerHtml = `
      <p>${escapeHtml(senderLabel)} has sent you a quote${quoteTitle ? `: <strong>${escapeHtml(quoteTitle)}</strong>` : ''}${totalStr ? ` (${escapeHtml(totalStr)})` : ''}.</p>
      ${isResend ? '<p><strong>This is a new link.</strong> Any previous link for this quote is no longer valid.</p>' : ''}
      ${safeMessage ? `<p>${escapeHtml(safeMessage).replace(/\n/g, '<br/>')}</p>` : ''}
      <p><a href="${escapeHtml(quoteLink)}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">View quote</a></p>
      <p style="color:#666;font-size:13px;">This link is for ${escapeHtml(trimmedRecipient)} and expires in ${INVITE_EXPIRY_DAYS} days.</p>
    `
    const htmlBody = buildBrandedEmailHtml({ branding, bodyHtml: innerHtml })

    const userEmail = typeof user.email === 'string' && isValidEmail(user.email) ? user.email.trim() : null
    const replyTo = (branding.companyEmail && isValidEmail(branding.companyEmail))
      ? branding.companyEmail.trim()
      : userEmail
    const { error } = await resend.emails.send({
      from: buildFromAddress(FROM_ADDRESS, branding.businessName),
      to: [trimmedRecipient],
      ...(replyTo ? { replyTo } : {}),
      subject: safeSubject,
      html: htmlBody,
      headers: { 'X-Entity-Ref-ID': invite.id },
    })

    if (error) {
      console.error('Resend quote error:', error)
      return res.status(500).json({ error: 'Failed to send quote email', message: error.message })
    }

    const updatedQuote = {
      ...quote,
      clientEmail: trimmedRecipient,
      clientPhone: invite.recipientPhone || quote.clientPhone,
      status: quote.status === 'draft' ? 'sent' : quote.status,
      sentAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }
    await updateQuoteAtIndex(all, index, updatedQuote)

    try {
      await logTeamActivity({
        teamIds: [],
        actor: user,
        type: 'quote.sent',
        summary: `${actorLabel({ ...user, displayName: branding.senderName })} sent quote "${quoteTitle}" to ${trimmedRecipient}`,
        entity: { quoteId: quote.id },
        nav: { panel: 'quotes', quoteId: quote.id },
      })
    } catch {
      /* ignore */
    }

    return res.status(200).json({
      inviteId: invite.id,
      expiresAt: invite.expiresAt,
      recipientEmail: trimmedRecipient,
      quoteLink,
      isResend,
      quote: updatedQuote,
    })
  } catch (err) {
    console.error('quotes-send error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
