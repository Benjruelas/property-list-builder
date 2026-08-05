/**
 * POST — mint or reuse an external Lead/Deal share link (/s/{token}).
 * Body: { type: 'lead'|'deal', leadId?, dealId?, pipelineId? }
 */

import { requireAuth } from './_lib/apiAuth.js'
import { rateLimit } from './_lib/rateLimit.js'
import {
  getAllResourceShareInvites,
  saveAllResourceShareInvites,
  generateResourceShareToken,
  findActiveResourceShareInvite,
  RESOURCE_SHARE_INVITE_EXPIRY_DAYS,
} from './_lib/resourceShareInvites.js'
import { buildResourceSharePublicUrl } from './_lib/publicLinks.js'
import { getLeadWithAccess } from './_lib/leadAccess.js'
import { canChangeVisibility, getResourceAccess, buildAccessContext } from './_lib/resourceContext.js'
import { getAllTeams } from './_lib/teams.js'
import { findPipelineById } from './_lib/pipelineRepo.js'
import { getAllPipelines } from './_lib/pipelineStoreFull.js'

function resolveOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host || ''
  if (host) return `${proto}://${host}`
  return req.headers.origin || 'https://localhost'
}

async function resolveDeal(user, dealId, pipelineId) {
  const ctx = buildAccessContext(await getAllTeams(), user)
  let pipeline = null
  if (pipelineId) {
    pipeline = await findPipelineById(pipelineId)
  }
  if (!pipeline) {
    const all = await getAllPipelines()
    pipeline = (all || []).find((p) => (p.deals || []).some((d) => String(d?.id) === String(dealId))) || null
  }
  if (!pipeline) return { deal: null, pipeline: null, access: null, ctx }
  const access = getResourceAccess(pipeline, user, ctx)
  if (!access) return { deal: null, pipeline: null, access: null, ctx }
  const deal = (pipeline.deals || []).find((d) => String(d?.id) === String(dealId)) || null
  if (!deal) return { deal: null, pipeline, access, ctx }
  return { deal, pipeline, access, ctx }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const user = await requireAuth(req, res)
  if (!user) return

  const rl = await rateLimit({ key: `resource-share-links:${user.uid}`, limit: 60, windowSec: 3600 })
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter))
    return res.status(429).json({ error: 'Too many share links. Please try again later.', retryAfter: rl.retryAfter })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const type = String(body.type || '').trim()
    if (type !== 'lead' && type !== 'deal') {
      return res.status(400).json({ error: 'type must be lead or deal' })
    }

    let resourceId = ''
    let pipelineId = null
    let ownerId = user.uid
    let ownerEmail = (user.email || '').toLowerCase()

    if (type === 'lead') {
      const leadId = String(body.leadId || body.id || '').trim()
      if (!leadId) return res.status(400).json({ error: 'leadId is required' })
      const { lead, access } = await getLeadWithAccess(user, leadId)
      // Any user with access to the lead (owner or collaborator) can mint a share link.
      if (!lead || !access) return res.status(404).json({ error: 'Lead not found' })
      resourceId = lead.id
      ownerId = lead.ownerId || user.uid
      ownerEmail = (lead.ownerEmail || user.email || '').toLowerCase()
    } else {
      const dealId = String(body.dealId || body.id || '').trim()
      const pipeId = String(body.pipelineId || '').trim() || null
      if (!dealId) return res.status(400).json({ error: 'dealId is required' })
      const { deal, pipeline, access } = await resolveDeal(user, dealId, pipeId)
      if (!deal || !pipeline || !access) return res.status(404).json({ error: 'Deal not found' })
      // Only pipeline owner mints external deal share links.
      if (!canChangeVisibility(access)) {
        return res.status(403).json({ error: 'Only the pipeline owner can create a deal share link' })
      }
      resourceId = deal.id
      pipelineId = pipeline.id
      ownerId = pipeline.ownerId || user.uid
      ownerEmail = (pipeline.ownerEmail || user.email || '').toLowerCase()
    }

    const origin = resolveOrigin(req)
    const allInvites = await getAllResourceShareInvites()
    const reusable = findActiveResourceShareInvite(allInvites, {
      resourceType: type,
      resourceId,
      ownerId,
    })

    if (reusable) {
      return res.status(200).json({
        shareLink: buildResourceSharePublicUrl(origin, reusable.token),
        token: reusable.token,
        expiresAt: reusable.expiresAt,
        reused: true,
        resourceType: type,
        resourceId,
        pipelineId,
      })
    }

    const now = new Date()
    const token = generateResourceShareToken()
    const expiresAt = new Date(
      now.getTime() + RESOURCE_SHARE_INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString()

    const invite = {
      id: `rsinv_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      token,
      resourceType: type,
      resourceId,
      pipelineId,
      ownerId,
      ownerEmail,
      status: 'pending',
      claims: [],
      createdAt: now.toISOString(),
      expiresAt,
    }

    await saveAllResourceShareInvites([...allInvites, invite])

    return res.status(200).json({
      shareLink: buildResourceSharePublicUrl(origin, token),
      token,
      expiresAt,
      reused: false,
      resourceType: type,
      resourceId,
      pipelineId,
    })
  } catch (err) {
    console.error('resource-share-links error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
