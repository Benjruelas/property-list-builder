/**
 * POST — email an external Lead/Deal share link via Resend.
 * Body: { type, leadId|dealId, pipelineId?, recipientEmail, subject?, message?, generateOnly? }
 */

import { Resend } from 'resend'
import { requireAuth } from './_lib/apiAuth.js'
import { rateLimit } from './_lib/rateLimit.js'
import { sanitizeHeader } from './_lib/emailSafety.js'
import {
  isValidShareEmail,
  escapeHtml,
  findActiveResourceShareInvite,
  getAllResourceShareInvites,
  saveAllResourceShareInvites,
  generateResourceShareToken,
  RESOURCE_SHARE_INVITE_EXPIRY_DAYS,
} from './_lib/resourceShareInvites.js'
import { buildResourceSharePublicUrl } from './_lib/publicLinks.js'
import { getLeadWithAccess } from './_lib/leadAccess.js'
import { canChangeVisibility, getResourceAccess, buildAccessContext } from './_lib/resourceContext.js'
import { getAllTeams } from './_lib/teams.js'
import { findPipelineById } from './_lib/pipelineRepo.js'
import { getAllPipelines } from './_lib/pipelineStoreFull.js'
import {
  resolveSendAsSender,
  buildBrandedEmailHtml,
  buildFromAddress,
} from './_lib/senderBranding.js'
import { displayLeadName, buildLeadSharePreview, buildDealSharePreview } from './_lib/resourceSharePreview.js'
import { getLeadByIdIndexed } from './_lib/leadLookup.js'

const resend = new Resend(process.env.RESEND_API_KEY)
const DEFAULT_FROM = 'KnockScout <onboarding@resend.dev>'
const FROM_ADDRESS = process.env.FORMS_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || DEFAULT_FROM

function resolveOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host || ''
  if (host) return `${proto}://${host}`
  return req.headers.origin || 'https://localhost'
}

async function resolveDeal(user, dealId, pipelineId) {
  const ctx = buildAccessContext(await getAllTeams(), user)
  let pipeline = null
  if (pipelineId) pipeline = await findPipelineById(pipelineId)
  if (!pipeline) {
    const all = await getAllPipelines()
    pipeline = (all || []).find((p) => (p.deals || []).some((d) => String(d?.id) === String(dealId))) || null
  }
  if (!pipeline) return { deal: null, pipeline: null, access: null }
  const access = getResourceAccess(pipeline, user, ctx)
  if (!access) return { deal: null, pipeline: null, access: null }
  const deal = (pipeline.deals || []).find((d) => String(d?.id) === String(dealId)) || null
  return { deal, pipeline, access }
}

async function mintOrReuseInvite({ type, resourceId, pipelineId, ownerId, ownerEmail }) {
  const allInvites = await getAllResourceShareInvites()
  const reusable = findActiveResourceShareInvite(allInvites, {
    resourceType: type,
    resourceId,
    ownerId,
  })
  if (reusable) return { invite: reusable, reused: true, allInvites }

  const now = new Date()
  const token = generateResourceShareToken()
  const invite = {
    id: `rsinv_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    token,
    resourceType: type,
    resourceId,
    pipelineId: pipelineId || null,
    ownerId,
    ownerEmail,
    status: 'pending',
    claims: [],
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + RESOURCE_SHARE_INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  }
  await saveAllResourceShareInvites([...allInvites, invite])
  return { invite, reused: false, allInvites }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const user = await requireAuth(req, res)
  if (!user) return

  const rl = await rateLimit({ key: `resource-share-send:${user.uid}`, limit: 60, windowSec: 3600 })
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter))
    return res.status(429).json({ error: 'Too many sends. Please try again later.', retryAfter: rl.retryAfter })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const type = String(body.type || '').trim()
    const generateOnly = !!body.generateOnly
    const recipientEmail = String(body.recipientEmail || '').trim().toLowerCase()
    const senderUid = body.senderUid

    if (type !== 'lead' && type !== 'deal') {
      return res.status(400).json({ error: 'type must be lead or deal' })
    }
    if (!generateOnly && !isValidShareEmail(recipientEmail)) {
      return res.status(400).json({ error: 'Valid recipientEmail is required' })
    }
    if (!generateOnly && !process.env.RESEND_API_KEY) {
      return res.status(500).json({ error: 'Email service not configured. Please set RESEND_API_KEY.' })
    }

    let resourceId = ''
    let pipelineId = null
    let ownerId = user.uid
    let ownerEmail = (user.email || '').toLowerCase()
    let previewLabel = type === 'deal' ? 'Deal' : 'Lead'

    if (type === 'lead') {
      const leadId = String(body.leadId || body.id || '').trim()
      if (!leadId) return res.status(400).json({ error: 'leadId is required' })
      const { lead, access } = await getLeadWithAccess(user, leadId)
      // Any user with access to the lead (owner or collaborator) can send a share link.
      if (!lead || !access) return res.status(404).json({ error: 'Lead not found' })
      resourceId = lead.id
      ownerId = lead.ownerId || user.uid
      ownerEmail = (lead.ownerEmail || user.email || '').toLowerCase()
      previewLabel = displayLeadName(lead)
    } else {
      const dealId = String(body.dealId || body.id || '').trim()
      const pipeId = String(body.pipelineId || '').trim() || null
      if (!dealId) return res.status(400).json({ error: 'dealId is required' })
      const { deal, pipeline, access } = await resolveDeal(user, dealId, pipeId)
      if (!deal || !pipeline || !access) return res.status(404).json({ error: 'Deal not found' })
      if (!canChangeVisibility(access)) {
        return res.status(403).json({ error: 'Only the pipeline owner can share this deal' })
      }
      resourceId = deal.id
      pipelineId = pipeline.id
      ownerId = pipeline.ownerId || user.uid
      ownerEmail = (pipeline.ownerEmail || user.email || '').toLowerCase()
      previewLabel = String(deal.title || deal.leadName || 'Deal').slice(0, 120)
    }

    const { invite, reused } = await mintOrReuseInvite({
      type,
      resourceId,
      pipelineId,
      ownerId,
      ownerEmail,
    })

    const origin = resolveOrigin(req)
    const shareLink = buildResourceSharePublicUrl(origin, invite.token)

    if (generateOnly) {
      return res.status(200).json({
        shareLink,
        token: invite.token,
        expiresAt: invite.expiresAt,
        reused,
      })
    }

    const sendAs = await resolveSendAsSender({ actingUser: user, senderUid })
    if (sendAs.error) {
      return res.status(sendAs.status || 403).json({ error: sendAs.error })
    }
    const branding = sendAs.branding
    const safeMessage = String(body.message || '').slice(0, 4000)
    const safeSubject = sanitizeHeader(
      body.subject || `${previewLabel} shared with you on KnockScout`,
      200,
    )

    let addressLine = ''
    try {
      if (type === 'lead') {
        const lead = await getLeadByIdIndexed(resourceId)
        addressLine = buildLeadSharePreview(lead).address || ''
      } else {
        const { deal } = await resolveDeal(user, resourceId, pipelineId)
        const lead = deal?.leadId ? await getLeadByIdIndexed(deal.leadId) : null
        addressLine = buildDealSharePreview(deal, lead).address || ''
      }
    } catch { /* optional */ }

    const messageHtml = safeMessage
      ? `<p style="white-space:pre-wrap;">${escapeHtml(safeMessage)}</p>`
      : `<p>${escapeHtml(branding.senderName || 'Someone')} shared a ${type} with you on KnockScout.</p>`

    const html = buildBrandedEmailHtml({
      branding,
      bodyHtml: `
        ${messageHtml}
        ${addressLine ? `<p style="color:#71717a;font-size:14px;">${escapeHtml(addressLine)}</p>` : ''}
        <p style="margin:24px 0;">
          <a href="${escapeHtml(shareLink)}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">
            Open in KnockScout
          </a>
        </p>
        <p style="font-size:13px;color:#71717a;">Or copy this link:<br/>${escapeHtml(shareLink)}</p>
      `,
    })

    const { error } = await resend.emails.send({
      from: buildFromAddress(FROM_ADDRESS, branding.businessName),
      to: [recipientEmail],
      subject: safeSubject,
      html,
    })
    if (error) {
      console.error('Resend resource share error:', error)
      return res.status(502).json({ error: 'Failed to send email', details: error.message || String(error) })
    }

    return res.status(200).json({
      shareLink,
      token: invite.token,
      expiresAt: invite.expiresAt,
      reused,
      sentTo: recipientEmail,
    })
  } catch (err) {
    console.error('resource-share-send error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
