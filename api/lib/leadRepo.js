/**
 * Per-owner lead shards with dual-write / shadow-read / cutover modes.
 */

import { flags } from './flags.js'
import { kv, kvAvailable } from './kvBootstrap.js'
import { kvSAdd, kvSMembers } from './kvOps.js'
import { withTiming } from './timing.js'
import { getAllTeams } from './teams.js'
import { buildAccessContext, filterVisibleResources } from './resourceContext.js'
import { collectAffectedUidsForResource } from './shareIndex.js'

export const LEAD_INDEX_PREFIX = 'lead-index:'
export const LEADS_SHARD_PREFIX = 'leads:'
export const SHARED_LEADS_PREFIX = 'shared-leads:'

async function getMonolithLeads() {
  const { getAllLeads } = await import('./leadStore.js')
  return getAllLeads()
}

function ownerShardKey(ownerId) {
  return `${LEADS_SHARD_PREFIX}${ownerId}`
}

function sharedIndexKey(uid) {
  return `${SHARED_LEADS_PREFIX}${uid}`
}

function leadIndexKey(leadId) {
  return `${LEAD_INDEX_PREFIX}${leadId}`
}

async function kvGetJson(key) {
  if (!kvAvailable || !kv) return null
  try {
    const data = await kv.get(key)
    if (!data) return null
    return typeof data === 'string' ? JSON.parse(data) : data
  } catch {
    return null
  }
}

async function kvSetJson(key, value) {
  if (!kvAvailable || !kv) return
  try {
    await kv.set(key, value).catch(() => kv.set(key, JSON.stringify(value)))
  } catch (e) {
    console.warn('leadRepo KV set failed', key, e.message)
  }
}

export async function getOwnerLeads(ownerId) {
  if (!ownerId) return []
  const data = await kvGetJson(ownerShardKey(ownerId))
  return Array.isArray(data) ? data : []
}

export async function saveOwnerLeads(ownerId, leads) {
  if (!ownerId) return
  await kvSetJson(ownerShardKey(ownerId), Array.isArray(leads) ? leads : [])
}

export async function getSharedOwnerIds(uid) {
  if (!uid) return []
  return kvSMembers(sharedIndexKey(uid))
}

export async function indexLead(lead) {
  if (!lead?.id || !lead?.ownerId || !kvAvailable) return
  await kv.set(leadIndexKey(lead.id), lead.ownerId)
}

export async function removeLeadIndex(leadId) {
  if (!leadId || !kvAvailable) return
  try {
    await kv.del(leadIndexKey(leadId))
  } catch { /* ignore */ }
}

export async function getLeadOwnerId(leadId) {
  if (!leadId || !kvAvailable) return null
  try {
    return await kv.get(leadIndexKey(leadId))
  } catch {
    return null
  }
}

export async function rebuildSharedIndexForLead(lead, allTeams) {
  if (!lead?.ownerId) return
  const uids = collectAffectedUidsForResource(lead, allTeams)
  for (const uid of uids) {
    if (uid === lead.ownerId) continue
    await kvSAdd(sharedIndexKey(uid), lead.ownerId)
  }
}

export async function writeLeadToShards(allLeads) {
  const mode = flags.LEADS_SHARDED()
  if (mode === 'off' || !kvAvailable) return
  const byOwner = new Map()
  for (const lead of allLeads || []) {
    const ownerId = lead?.ownerId
    if (!ownerId) continue
    if (!byOwner.has(ownerId)) byOwner.set(ownerId, [])
    byOwner.get(ownerId).push(lead)
    await indexLead(lead)
  }
  await Promise.all([...byOwner.entries()].map(([ownerId, leads]) => saveOwnerLeads(ownerId, leads)))
}

export async function getVisibleLeadsFromShards(user, ctx) {
  const ownerIds = new Set([user.uid])
  const shared = await getSharedOwnerIds(user.uid)
  for (const id of shared) ownerIds.add(id)
  const chunks = await Promise.all([...ownerIds].map((oid) => getOwnerLeads(oid)))
  const merged = chunks.flat()
  return filterVisibleResources(merged, user, ctx)
}

function diffLeadSets(a, b) {
  const aIds = new Set((a || []).map((l) => l.id))
  const bIds = new Set((b || []).map((l) => l.id))
  const onlyA = [...aIds].filter((id) => !bIds.has(id))
  const onlyB = [...bIds].filter((id) => !aIds.has(id))
  return { onlyA, onlyB, countA: aIds.size, countB: bIds.size }
}

export async function getLeadsForUser(user, ctx) {
  const mode = flags.LEADS_SHARDED()
  const monolith = filterVisibleResources(await getMonolithLeads(), user, ctx)

  if (mode === 'off') return monolith

  const sharded = await withTiming('leadRepo.getVisibleLeadsFromShards', () =>
    getVisibleLeadsFromShards(user, ctx), { uid: user.uid })

  if (mode === 'shadow') {
    const diff = diffLeadSets(monolith, sharded)
    if (diff.onlyA.length || diff.onlyB.length || diff.countA !== diff.countB) {
      console.warn(JSON.stringify({ type: 'lead_shard_parity_diff', ...diff, uid: user.uid }))
    }
    return monolith
  }

  return sharded
}

export async function findLeadById(user, ctx, leadId) {
  const mode = flags.LEADS_SHARDED()
  const all = await getMonolithLeads()
  const idx = all.findIndex((l) => l.id === leadId)
  const fromMono = idx >= 0 ? all[idx] : null

  if (mode === 'off') {
    if (!fromMono) return { lead: null, all, index: -1 }
    const access = filterVisibleResources([fromMono], user, ctx).length ? 'ok' : null
    return access ? { lead: fromMono, all, index: idx } : { lead: null, all, index: -1 }
  }

  const ownerId = await getLeadOwnerId(leadId)
  let lead = null
  if (ownerId) {
    const ownerLeads = await getOwnerLeads(ownerId)
    lead = ownerLeads.find((l) => l.id === leadId) || null
  }
  if (!lead && mode === 'shadow') lead = fromMono
  if (!lead) return { lead: null, all, index: idx }

  const visible = filterVisibleResources([lead], user, ctx)
  if (!visible.length) return { lead: null, all, index: -1 }
  return { lead: visible[0], all, index: idx }
}

export async function backfillLeadShards() {
  const all = await getMonolithLeads()
  const allTeams = await getAllTeams()
  const byOwner = new Map()
  const sharedPairs = []

  for (const lead of all) {
    const ownerId = lead?.ownerId
    if (!ownerId) continue
    if (!byOwner.has(ownerId)) byOwner.set(ownerId, [])
    byOwner.get(ownerId).push(lead)
    await indexLead(lead)
    for (const uid of collectAffectedUidsForResource(lead, allTeams)) {
      if (uid !== ownerId) sharedPairs.push([uid, ownerId])
    }
  }

  await Promise.all([...byOwner.entries()].map(([ownerId, leads]) => saveOwnerLeads(ownerId, leads)))
  for (const [uid, ownerId] of sharedPairs) {
    await kvSAdd(sharedIndexKey(uid), ownerId)
  }

  return {
    owners: byOwner.size,
    leads: all.length,
    sharedLinks: sharedPairs.length,
  }
}

export default {
  getOwnerLeads,
  saveOwnerLeads,
  getLeadsForUser,
  findLeadById,
  writeLeadToShards,
  backfillLeadShards,
}
