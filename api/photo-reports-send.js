import { Resend } from 'resend'
import {resolveDevBypassUser, isDevBypassAllowed} from './lib/devBypassUsers.js'
import {
  generateReportToken,
  REPORT_INVITE_EXPIRY_DAYS,
  getAllReportInvites,
  saveAllReportInvites,
  isValidReportEmail,
  supersedePendingReportInvites,
  hasPriorReportInvite,
} from './lib/reportInvites.js'
import { getPhotoReportById, updatePhotoReportAtIndex } from './lib/reportStore.js'
import { getLeadWithAccess } from './lib/leadAccess.js'
import {
  resolveSenderBranding,
  buildBrandedEmailHtml,
  buildFromAddress,
  escapeHtml,
} from './lib/senderBranding.js'
import { leadDisplayName } from './lib/publicReportPayload.js'

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

    const trimmedRecipient = String(recipientEmail || '').trim().toLowerCase()
    if (!generateOnly && !isValidReportEmail(trimmedRecipient)) {
      return res.status(400).json({ error: 'Valid recipientEmail is required' })
    }
    if (generateOnly && !isValidReportEmail(trimmedRecipient)) {
      return res.status(400).json({ error: 'Valid recipientEmail is required for link generation' })
    }

    const token = generateReportToken()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + REPORT_INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const appOrigin = resolveOrigin(req)
    const publicUrl = `${appOrigin}/?report=${encodeURIComponent(token)}`
    const safeMessage = String(message || '').slice(0, 4000)
      .replace(/\{ReportLink\}/g, publicUrl)
      .replace(/\{\{ReportLink\}\}/g, publicUrl)
    const reportTitle = String(report.title || 'Photo Report').trim()

    const allInvites = await getAllReportInvites()
    const isResend = hasPriorReportInvite(allInvites, {
      reportId: report.id,
      recipientEmail: trimmedRecipient,
    })

    const invite = {
      id: `rinv_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      token,
      reportId: report.id,
      ownerId: user.uid,
      recipientEmail: trimmedRecipient,
      message: safeMessage,
      status: 'pending',
      createdAt: now.toISOString(),
      expiresAt,
    }

    const { invites: nextInvites } = supersedePendingReportInvites(allInvites, {
      reportId: report.id,
      recipientEmail: trimmedRecipient,
      keepToken: token,
    })
    nextInvites.push(invite)
    await saveAllReportInvites(nextInvites)

    const updated = {
      ...report,
      publicToken: token,
      status: report.status === 'draft' ? 'sent' : report.status,
      sentAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }
    await updatePhotoReportAtIndex(all, index, updated)

    if (generateOnly) {
      return res.status(200).json({
        report: updated,
        publicUrl,
        token,
        inviteId: invite.id,
        expiresAt: invite.expiresAt,
      })
    }

    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({ error: 'Email service not configured' })
    }

    const branding = await resolveSenderBranding(user)
    const senderLabel = branding.senderName
    const { lead } = await getLeadWithAccess(user, report.leadId)
    const propertyLabel = lead ? leadDisplayName(lead) : 'your property'
    const safeSubject = String(subject || `Photo report: ${reportTitle}`).slice(0, 200)

    const innerHtml = `
      <p>${escapeHtml(senderLabel)} has sent you a photo report${reportTitle ? `: <strong>${escapeHtml(reportTitle)}</strong>` : ''} for ${escapeHtml(propertyLabel)}.</p>
      ${isResend ? '<p><strong>This is a new link.</strong> Any previous link for this report is no longer valid.</p>' : ''}
      ${safeMessage ? `<p>${escapeHtml(safeMessage).replace(/\n/g, '<br/>')}</p>` : ''}
      <p><a href="${escapeHtml(publicUrl)}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">View photo report</a></p>
      <p style="color:#666;font-size:13px;">This link is for ${escapeHtml(trimmedRecipient)} and expires in ${REPORT_INVITE_EXPIRY_DAYS} days.</p>
    `
    const htmlBody = buildBrandedEmailHtml({ branding, bodyHtml: innerHtml })

    const userEmail = isValidReportEmail(user.email) ? user.email.trim() : null
    const replyTo =
      branding.companyEmail && isValidReportEmail(branding.companyEmail)
        ? branding.companyEmail.trim()
        : userEmail

    await resend.emails.send({
      from: buildFromAddress(FROM_ADDRESS, branding.businessName),
      to: [trimmedRecipient],
      ...(replyTo ? { replyTo } : {}),
      subject: safeSubject,
      html: htmlBody,
      headers: { 'X-Entity-Ref-ID': invite.id },
    })

    return res.status(200).json({
      report: updated,
      publicUrl,
      token,
      sentTo: trimmedRecipient,
      inviteId: invite.id,
      expiresAt: invite.expiresAt,
    })
  } catch (err) {
    console.error('photo-reports-send error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
