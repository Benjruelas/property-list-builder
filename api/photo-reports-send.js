import { Resend } from 'resend'
import { requireAuth } from './_lib/apiAuth.js'
import {
  generateReportToken,
  REPORT_INVITE_EXPIRY_DAYS,
  getAllReportInvites,
  saveAllReportInvites,
  isValidReportEmail,
  supersedePendingReportInvites,
  hasPriorReportInvite,
  findActiveReportInviteByToken,
  findActiveLinkOnlyReportInvite,
} from './_lib/reportInvites.js'
import { buildReportPublicUrl } from './_lib/publicLinks.js'
import { getPhotoReportById, updatePhotoReportAtIndex } from './_lib/reportStore.js'
import { getLeadWithAccess } from './_lib/leadAccess.js'
import {
  resolveSenderBranding,
  buildBrandedEmailHtml,
  buildFromAddress,
  escapeHtml,
} from './_lib/senderBranding.js'
import { leadDisplayName } from './_lib/publicReportPayload.js'
import { rateLimit } from './_lib/rateLimit.js'
import { sanitizeHeader } from './_lib/emailSafety.js'
import { ensureReportPdf } from './_lib/ensureReportPdf.js'
import { getAllLeads } from './_lib/leadAccess.js'

async function canAccessReport(user, report) {
  if (report.ownerId === user.uid) return true
  const { lead } = await getLeadWithAccess(user, report.leadId)
  return !!lead
}

const resend = new Resend(process.env.RESEND_API_KEY)
const DEFAULT_FROM = 'KnockScout <onboarding@resend.dev>'
const FROM_ADDRESS = process.env.FORMS_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || DEFAULT_FROM

function normalizeEmailList(raw) {
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  const out = []
  for (const item of raw) {
    const email = typeof item === 'string' ? item.trim().toLowerCase() : ''
    if (!isValidReportEmail(email) || seen.has(email)) continue
    seen.add(email)
    out.push(email)
  }
  return out
}

function resolveOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host || ''
  if (host) return `${proto}://${host}`
  return req.headers.origin || 'https://localhost'
}

function findReusableReportInvite(allInvites, { report, ownerId, preferToken }) {
  const normalizedPrefer = String(preferToken || '').trim()
  if (normalizedPrefer) {
    const byToken = findActiveReportInviteByToken(allInvites, {
      token: normalizedPrefer,
      reportId: report.id,
      ownerId,
    })
    if (byToken) return byToken
  }

  const reportToken = String(report.publicToken || '').trim()
  if (reportToken) {
    const byReportToken = findActiveReportInviteByToken(allInvites, {
      token: reportToken,
      reportId: report.id,
      ownerId,
    })
    if (byReportToken) return byReportToken
  }

  return findActiveLinkOnlyReportInvite(allInvites, { reportId: report.id, ownerId })
}

export const config = {
  api: { bodyParser: { sizeLimit: '2mb' } },
  maxDuration: 120,
  memory: 1024,
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const user = await requireAuth(req, res)
  if (!user) return

  const rl = await rateLimit({ key: `reports-send:${user.uid}`, limit: 100, windowSec: 3600 })
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter))
    return res.status(429).json({ error: 'Too many sends. Please try again later.', retryAfter: rl.retryAfter })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const {
      reportId,
      recipientEmail,
      subject,
      message,
      generateOnly,
      cc: ccRaw,
      sendMeCopy,
      token: preferToken,
    } = body
    if (!reportId) return res.status(400).json({ error: 'reportId is required' })

    const { report, index, all } = await getPhotoReportById(reportId)
    if (!report || !(await canAccessReport(user, report))) {
      return res.status(404).json({ error: 'Report not found' })
    }

    const trimmedRecipient = String(recipientEmail || '').trim().toLowerCase()
    if (!generateOnly && !isValidReportEmail(trimmedRecipient)) {
      return res.status(400).json({ error: 'Valid recipientEmail is required' })
    }

    const now = new Date()
    const appOrigin = resolveOrigin(req)
    const allInvites = await getAllReportInvites()
    const linkOnly = generateOnly && !trimmedRecipient
    const inviteOwnerId = report.ownerId || user.uid
    const reusable = findReusableReportInvite(allInvites, {
      report,
      ownerId: inviteOwnerId,
      preferToken,
    })

    if (linkOnly && reusable) {
      const token = reusable.token
      const publicUrl = buildReportPublicUrl(appOrigin, token)
      const updated = {
        ...report,
        publicToken: token,
        updatedAt: now.toISOString(),
      }
      if (report.publicToken !== token) {
        await updatePhotoReportAtIndex(all, index, updated)
      }
      let reportOut = updated
      try {
        const { lead } = await getLeadWithAccess(user, report.leadId)
        if (lead) {
          await ensureReportPdf(updated, index, all, lead, {
            message: reusable.message || '',
          })
          const refreshed = await getPhotoReportById(report.id)
          if (refreshed?.report) reportOut = refreshed.report
        }
      } catch (pdfErr) {
        console.warn('report pdf pre-generate failed', pdfErr?.message || pdfErr)
      }
      return res.status(200).json({
        report: reportOut,
        publicUrl,
        token,
        inviteId: reusable.id,
        expiresAt: reusable.expiresAt,
        reused: true,
      })
    }

    const expiresAt = new Date(now.getTime() + REPORT_INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const token = reusable?.token || generateReportToken()
    const publicUrl = buildReportPublicUrl(appOrigin, token)
    const safeMessage = String(message || '').slice(0, 4000)
      .replace(/\{ReportLink\}/g, publicUrl)
      .replace(/\{\{ReportLink\}\}/g, publicUrl)
    const reportTitle = String(report.title || 'Photo Report').trim()

    const isResend = hasPriorReportInvite(allInvites, {
      reportId: report.id,
      recipientEmail: trimmedRecipient,
    })

    const invite = reusable
      ? {
          ...reusable,
          recipientEmail: trimmedRecipient,
          message: safeMessage,
          updatedAt: now.toISOString(),
        }
      : {
          id: `rinv_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
          token,
          reportId: report.id,
          ownerId: inviteOwnerId,
          recipientEmail: trimmedRecipient,
          message: safeMessage,
          status: 'pending',
          createdAt: now.toISOString(),
          expiresAt,
        }

    const { invites: supersededInvites } = supersedePendingReportInvites(allInvites, {
      reportId: report.id,
      recipientEmail: trimmedRecipient,
      keepToken: token,
    })

    let nextInvites
    if (reusable) {
      nextInvites = supersededInvites.map((inv) => (inv.token === token ? invite : inv))
    } else {
      nextInvites = [...supersededInvites, invite]
    }
    await saveAllReportInvites(nextInvites)

    const updated = {
      ...report,
      publicToken: token,
      status: linkOnly ? report.status : (report.status === 'draft' ? 'sent' : report.status),
      sentAt: linkOnly ? report.sentAt : now.toISOString(),
      updatedAt: now.toISOString(),
    }
    await updatePhotoReportAtIndex(all, index, updated)

    // Warm the PDF cache while sending so client download is a fast R2 hit.
    // Prefer the invite message so the PDF matches the public HTML view.
    let reportForPdf = updated
    try {
      const { lead: accessLead } = await getLeadWithAccess(user, report.leadId)
      let lead = accessLead
      if (!lead) {
        const { getLeadByIdIndexed } = await import('./_lib/leadLookup.js')
        lead = await getLeadByIdIndexed(report.leadId)
      }
      if (lead) {
        await ensureReportPdf(updated, index, all, lead, { message: safeMessage })
        const refreshed = await getPhotoReportById(report.id)
        if (refreshed?.report) reportForPdf = refreshed.report
      }
    } catch (pdfErr) {
      console.warn('report pdf pre-generate failed', pdfErr?.message || pdfErr)
    }

    if (generateOnly) {
      return res.status(200).json({
        report: reportForPdf,
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
    const safeSubject = sanitizeHeader(subject || `Photo report: ${reportTitle}`, 200)

    const innerHtml = `
      <p>${escapeHtml(senderLabel)} has sent you a photo report${reportTitle ? `: <strong>${escapeHtml(reportTitle)}</strong>` : ''} for ${escapeHtml(propertyLabel)}.</p>
      ${isResend ? '<p><strong>This is a new link.</strong> Any previous link for this report is no longer valid.</p>' : ''}
      ${safeMessage ? `<p>${escapeHtml(safeMessage).replace(/\n/g, '<br/>')}</p>` : ''}
      <p><a href="${escapeHtml(publicUrl)}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">View photo report</a></p>
      <p style="color:#666;font-size:13px;">This link is for ${escapeHtml(trimmedRecipient)} and expires in ${REPORT_INVITE_EXPIRY_DAYS} days.</p>
    `
    const htmlBody = buildBrandedEmailHtml({ branding, bodyHtml: innerHtml })

    const userEmail = isValidReportEmail(user.email) ? user.email.trim().toLowerCase() : null
    const replyTo =
      branding.companyEmail && isValidReportEmail(branding.companyEmail)
        ? branding.companyEmail.trim()
        : userEmail

    const cc = normalizeEmailList(ccRaw).filter((email) => email !== trimmedRecipient)
    const alreadyRecipient = new Set([trimmedRecipient, ...cc])
    const bccList = (sendMeCopy && userEmail && !alreadyRecipient.has(userEmail))
      ? [userEmail]
      : null

    await resend.emails.send({
      from: buildFromAddress(FROM_ADDRESS, branding.businessName),
      to: [trimmedRecipient],
      ...(cc.length ? { cc } : {}),
      ...(replyTo ? { replyTo } : {}),
      ...(bccList ? { bcc: bccList } : {}),
      subject: safeSubject,
      html: htmlBody,
      headers: { 'X-Entity-Ref-ID': invite.id },
    })

    return res.status(200).json({
      report: reportForPdf,
      publicUrl,
      token,
      sentTo: trimmedRecipient,
      sentCopyToSender: !!bccList,
      inviteId: invite.id,
      expiresAt: invite.expiresAt,
    })
  } catch (err) {
    console.error('photo-reports-send error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
