/**
 * POST — claim an external Lead/Deal share link.
 * Auth required. Lead → collaborator ACL. Deal → clone lead+deal into claimer account.
 * Body: { token }
 */

import { requireAuth } from './_lib/apiAuth.js'
import { rateLimit } from './_lib/rateLimit.js'
import {
  findResourceShareInviteByToken,
  getAllResourceShareInvites,
  saveAllResourceShareInvites,
  findClaimForUid,
  upsertClaimOnInvite,
} from './_lib/resourceShareInvites.js'
import { getLeadByIdIndexed } from './_lib/leadLookup.js'
import { getLeadWithAccess, mutateLeads } from './_lib/leadAccess.js'
import { VISIBILITY } from './_lib/access.js'
import { getAllTeams } from './_lib/teams.js'
import { findPipelineById } from './_lib/pipelineRepo.js'
import { getAllPipelines, mutatePipelines } from './_lib/pipelineStoreFull.js'
import { DEFAULT_DEAL_STATUSES } from './_lib/dealStatuses.js'
import { displayLeadName } from './_lib/resourceSharePreview.js'
import { isKvLockUnavailable, respondKvLockUnavailable } from './_lib/kvLockErrors.js'

function cloneLineItems(rows) {
  if (!Array.isArray(rows)) return []
  return rows.map((item) => ({
    id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    name: String(item?.name || '').slice(0, 200),
    amount: Number(item?.amount) || 0,
    settled: false,
  }))
}

function buildClonedLead(sourceLead, user) {
  const now = new Date().toISOString()
  return {
    id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    firstName: sourceLead.firstName || '',
    lastName: sourceLead.lastName || '',
    address: sourceLead.address || '',
    parcelId: sourceLead.parcelId || null,
    lat: sourceLead.lat ?? null,
    lng: sourceLead.lng ?? null,
    addressDetails: Array.isArray(sourceLead.addressDetails)
      ? sourceLead.addressDetails.map((d) => ({ ...d }))
      : [],
    phone: sourceLead.phone || '',
    email: sourceLead.email || '',
    phones: Array.isArray(sourceLead.phones) ? [...sourceLead.phones] : [],
    emails: Array.isArray(sourceLead.emails) ? [...sourceLead.emails] : [],
    phoneDetails: Array.isArray(sourceLead.phoneDetails)
      ? sourceLead.phoneDetails.map((d) => ({ ...d }))
      : [],
    emailDetails: Array.isArray(sourceLead.emailDetails)
      ? sourceLead.emailDetails.map((d) => ({ ...d }))
      : [],
    notes: sourceLead.notes || '',
    properties: sourceLead.properties || null,
    ownerId: user.uid,
    ownerEmail: (user.email || '').toLowerCase(),
    sharedWith: [],
    teamShares: [],
    teamId: null,
    visibility: VISIBILITY.PRIVATE,
    sharedMemberUids: [],
    status: sourceLead.status || 'new',
    statusUpdatedAt: now,
    activity: [],
    photos: [],
    files: [],
    tagIds: Array.isArray(sourceLead.tagIds) ? [...sourceLead.tagIds] : [],
    tagMeta: Array.isArray(sourceLead.tagMeta)
      ? sourceLead.tagMeta.map((t) => ({ ...t }))
      : [],
    createdAt: now,
    updatedAt: now,
    clonedFromLeadId: sourceLead.id || null,
  }
}

function statusesToColumns(statuses) {
  return (statuses || DEFAULT_DEAL_STATUSES).map(({ id, label }) => ({ id, name: label }))
}

async function ensureOwnedPipeline(user) {
  const all = await getAllPipelines()
  const owned = (all || []).filter((p) => p.ownerId === user.uid && !p.isTeamPipe)
  if (owned.length) {
    // Prefer newest updated
    owned.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    return owned[0]
  }

  const cols = statusesToColumns(DEFAULT_DEAL_STATUSES)
  const now = new Date().toISOString()
  const newPipeline = {
    id: `pipe_user_${String(user.uid).replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now().toString(36)}`,
    title: 'Pipes',
    columns: cols,
    deals: [],
    ownerId: user.uid,
    ownerEmail: (user.email || '').toLowerCase(),
    sharedWith: [],
    teamShares: [],
    teamId: null,
    visibility: VISIBILITY.PRIVATE,
    sharedMemberUids: [],
    createdAt: now,
    updatedAt: now,
  }

  await mutatePipelines((current) => [...current, newPipeline], {
    changedResources: [{ resource: newPipeline }],
  })
  return newPipeline
}

async function resolveSourceDeal(invite) {
  let pipeline = null
  if (invite.pipelineId) {
    pipeline = await findPipelineById(invite.pipelineId)
  }
  if (!pipeline) {
    const all = await getAllPipelines()
    pipeline = (all || []).find((p) =>
      (p.deals || []).some((d) => String(d?.id) === String(invite.resourceId)),
    ) || null
  }
  if (!pipeline) return { deal: null, pipeline: null }
  const deal = (pipeline.deals || []).find((d) => String(d?.id) === String(invite.resourceId)) || null
  return { deal, pipeline }
}

async function claimLeadShare(user, invite) {
  const leadId = invite.resourceId
  const sourceLead = await getLeadByIdIndexed(leadId)
  if (!sourceLead) {
    return { error: 'Lead no longer available', status: 404 }
  }

  // Owner opening their own link — just open source.
  if (sourceLead.ownerId === user.uid) {
    return {
      resourceType: 'lead',
      leadId: sourceLead.id,
      alreadyOwned: true,
    }
  }

  const { lead, access } = await getLeadWithAccess(user, leadId)
  if (lead && access) {
    // Already collaborator (or otherwise visible)
    return {
      resourceType: 'lead',
      leadId: lead.id,
      alreadyShared: true,
    }
  }

  const now = new Date().toISOString()
  const members = Array.isArray(sourceLead.sharedMemberUids) ? [...sourceLead.sharedMemberUids] : []
  if (!members.includes(user.uid)) members.push(user.uid)
  const updatedLead = {
    ...sourceLead,
    sharedMemberUids: members,
    visibility: VISIBILITY.MEMBERS,
    updatedAt: now,
  }

  let wrote = false
  await mutateLeads((current) => {
    const at = current.findIndex((l) => l.id === leadId)
    if (at === -1) {
      wrote = true
      return [...current, updatedLead]
    }
    wrote = true
    const next = [...current]
    next[at] = { ...current[at], ...updatedLead, sharedMemberUids: members, visibility: VISIBILITY.MEMBERS, updatedAt: now }
    return next
  }, { changedResources: [{ resource: updatedLead, prevResource: sourceLead }] })

  if (!wrote) {
    return { error: 'Could not share lead', status: 500 }
  }

  try {
    const { rebuildSharedIndexForLead } = await import('./_lib/leadRepo.js')
    const teams = await getAllTeams()
    await rebuildSharedIndexForLead(updatedLead, teams, sourceLead)
  } catch (e) {
    console.warn('lead share index sync', e.message)
  }

  return {
    resourceType: 'lead',
    leadId: updatedLead.id,
  }
}

async function claimDealShare(user, invite) {
  const existingClaim = findClaimForUid(invite, user.uid)
  if (existingClaim?.dealId && existingClaim?.pipelineId) {
    return {
      resourceType: 'deal',
      leadId: existingClaim.leadId || null,
      dealId: existingClaim.dealId,
      pipelineId: existingClaim.pipelineId,
      reused: true,
    }
  }

  const { deal, pipeline } = await resolveSourceDeal(invite)
  if (!deal || !pipeline) {
    return { error: 'Deal no longer available', status: 404 }
  }

  // Owner opening their own link — open source deal
  if (pipeline.ownerId === user.uid) {
    return {
      resourceType: 'deal',
      leadId: deal.leadId || null,
      dealId: deal.id,
      pipelineId: pipeline.id,
      alreadyOwned: true,
    }
  }

  let sourceLead = null
  if (deal.leadId) {
    sourceLead = await getLeadByIdIndexed(deal.leadId)
  }

  // Build a minimal lead if source lead missing
  const nowIso = new Date().toISOString()
  const nowMs = Date.now()
  let newLead
  if (sourceLead) {
    newLead = buildClonedLead(sourceLead, user)
  } else {
    const nameParts = String(deal.leadName || deal.title || 'Lead').trim().split(/\s+/)
    newLead = buildClonedLead({
      firstName: nameParts[0] || 'Lead',
      lastName: nameParts.slice(1).join(' ') || '',
      address: deal.leadAddress || '',
      parcelId: deal.parcelId || null,
      notes: '',
    }, user)
  }

  await mutateLeads((current) => [...current, newLead], {
    changedResources: [{ resource: newLead }],
  })

  const targetPipeline = await ensureOwnedPipeline(user)
  const cols = Array.isArray(targetPipeline.columns) && targetPipeline.columns.length
    ? targetPipeline.columns
    : statusesToColumns(DEFAULT_DEAL_STATUSES)
  const initialStatus = cols[0]?.id || 'open'
  const leadName = displayLeadName(newLead)
  const leadAddress = newLead.address || deal.leadAddress || ''

  const newDeal = {
    id: `deal_${nowMs}_${Math.random().toString(36).slice(2, 9)}`,
    leadId: newLead.id,
    title: String(deal.title || `${leadName} · ${leadAddress}`).slice(0, 120),
    status: initialStatus,
    statusEnteredAt: nowMs,
    cumulativeTimeByStatus: {},
    notes: String(deal.notes || '').trim(),
    payments: cloneLineItems(deal.payments),
    costs: cloneLineItems(deal.costs),
    tasks: [],
    files: [],
    photos: [],
    leadName,
    leadAddress,
    parcelId: newLead.parcelId || deal.parcelId || null,
    pipelineId: targetPipeline.id,
    createdAt: nowMs,
    updatedAt: nowMs,
    clonedFromDealId: deal.id || null,
  }

  let savedPipelineId = targetPipeline.id
  await mutatePipelines((all) => {
    const pIdx = all.findIndex((p) => p.id === targetPipeline.id)
    if (pIdx === -1) {
      const pipe = {
        ...targetPipeline,
        deals: [newDeal],
        updatedAt: nowIso,
      }
      savedPipelineId = pipe.id
      return [...all, pipe]
    }
    const pipelineRow = { ...all[pIdx] }
    const deals = Array.isArray(pipelineRow.deals) ? [...pipelineRow.deals, newDeal] : [newDeal]
    pipelineRow.deals = deals
    pipelineRow.updatedAt = nowIso
    const next = [...all]
    next[pIdx] = pipelineRow
    return next
  }, { changedResources: [{ resource: { ...targetPipeline, id: savedPipelineId } }] })

  return {
    resourceType: 'deal',
    leadId: newLead.id,
    dealId: newDeal.id,
    pipelineId: savedPipelineId,
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const user = await requireAuth(req, res)
  if (!user) return

  const rl = await rateLimit({ key: `resource-share-claim:${user.uid}`, limit: 60, windowSec: 3600 })
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter))
    return res.status(429).json({ error: 'Too many claim attempts. Please try again later.', retryAfter: rl.retryAfter })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const token = String(body.token || '').trim()
    if (!token) return res.status(400).json({ error: 'token is required' })

    const { invite, index, error } = await findResourceShareInviteByToken(token)
    if (error === 'not_found' || !invite) {
      return res.status(404).json({ error: 'Share link not found' })
    }
    if (error === 'revoked') return res.status(410).json({ error: 'Share link has been revoked' })
    if (error === 'expired') return res.status(410).json({ error: 'Share link has expired' })

    let result
    if (invite.resourceType === 'lead') {
      result = await claimLeadShare(user, invite)
    } else if (invite.resourceType === 'deal') {
      result = await claimDealShare(user, invite)
    } else {
      return res.status(400).json({ error: 'Invalid share link type' })
    }

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error })
    }

    // Record claim for idempotency (especially deal clones)
    if (!result.alreadyOwned) {
      const claim = {
        uid: user.uid,
        claimedAt: new Date().toISOString(),
        resourceType: result.resourceType,
        leadId: result.leadId || null,
        dealId: result.dealId || null,
        pipelineId: result.pipelineId || null,
      }
      const all = await getAllResourceShareInvites()
      if (index >= 0 && all[index]) {
        all[index] = upsertClaimOnInvite(all[index], claim)
        await saveAllResourceShareInvites(all)
      }
    }

    return res.status(200).json(result)
  } catch (err) {
    if (isKvLockUnavailable(err)) return respondKvLockUnavailable(res, err)
    console.error('resource-share-claim error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
