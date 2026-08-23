/**
 * Per-owner lead shards with dual-write / shadow-read / cutover modes.
 */

import { flags } from './flags.js'
import { kv, kvAvailable } from './kvBootstrap.js'
import { kvSAdd, kvSMembers, kvMSet } from './kvOps.js'
import { withTiming } from './timing.js'
import { getAllTeams } from './teams.js'
import { buildAccessContext, filterVisibleResources } from './resourceContext.js'
import { collectAffectedUidsForResource, syncSharedOwnerIndex } from './shareIndex.js'

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

export async function rebuildSharedIndexForLead(lead, allTeams, prevLead = null) {
  await syncSharedIndexForLead(lead, prevLead, allTeams)
}

export async function syncSharedIndexForLead(lead, prevLead, allTeams) {
  await syncSharedOwnerIndex({
    resource: lead,
    prevResource: prevLead,
    allTeams,
    sharedKeyPrefix: SHARED_LEADS_PREFIX,
  })
}

async function syncSharedIndexesForLeads(allLeads, allTeams) {
  if (!kvAvailable) return
  const byUid = new Map()
  for (const lead of allLeads || []) {
    const ownerId = lead?.ownerId
    if (!ownerId) continue
    for (const uid of collectAffectedUidsForResource(lead, allTeams)) {
      if (uid === ownerId) continue
      if (!byUid.has(uid)) byUid.set(uid, new Set())
      byUid.get(uid).add(ownerId)
    }
  }
  await Promise.all([...byUid.entries()].map(([uid, owners]) =>
    kvSAdd(sharedIndexKey(uid), ...owners),
  ))
}

function mergeRecordArrays(a, b) {
  const byKey = new Map()
  for (const item of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
    if (!item) continue
    const key = item.id || item.key || JSON.stringify(item)
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, item)
      continue
    }
    const prevAt = Date.parse(prev.updatedAt || prev.capturedAt || prev.createdAt || 0) || 0
    const nextAt = Date.parse(item.updatedAt || item.capturedAt || item.createdAt || 0) || 0
    if (nextAt >= prevAt) byKey.set(key, item)
  }
  return [...byKey.values()]
}

function mergeActivityArrays(a, b) {
  const combined = [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]
  if (!combined.length) return []
  const seen = new Set()
  const out = []
  for (const item of combined) {
    const key = item?.id || JSON.stringify(item)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

/** Merge two copies of the same lead — prefer newer updatedAt but keep rich fields from either side. */
export function mergeLeadPair(a, b) {
  const aAt = Date.parse(a?.updatedAt || a?.createdAt || 0) || 0
  const bAt = Date.parse(b?.updatedAt || b?.createdAt || 0) || 0
  const [winner, loser] = bAt >= aAt ? [b, a] : [a, b]
  return {
    ...winner,
    photos: mergeRecordArrays(winner.photos, loser.photos),
    files: mergeRecordArrays(winner.files, loser.files),
    activity: mergeActivityArrays(winner.activity, loser.activity),
  }
}

/** Prefer the copy with the latest updatedAt when the monolith and shards diverge. */
export function mergeLeadsByUpdatedAt(...groups) {
  const byId = new Map()
  for (const group of groups) {
    for (const lead of group || []) {
      if (!lead?.id) continue
      const prev = byId.get(lead.id)
      byId.set(lead.id, prev ? mergeLeadPair(prev, lead) : lead)
    }
  }
  return [...byId.values()]
}

/** Append new leads to owner shards without rewriting unrelated leads on the shard. */
export async function appendLeadsToShards(newLeads, { allTeams } = {}) {
  const mode = flags.LEADS_SHARDED()
  if (mode === 'off' || !kvAvailable || !newLeads?.length) return

  const byOwner = new Map()
  const indexEntries = {}
  for (const lead of newLeads) {
    const ownerId = lead?.ownerId
    if (!ownerId || !lead?.id) continue
    if (!byOwner.has(ownerId)) byOwner.set(ownerId, [])
    byOwner.get(ownerId).push(lead)
    indexEntries[leadIndexKey(lead.id)] = ownerId
  }

  const teams = allTeams || await getAllTeams()
  await Promise.all([
    kvMSet(indexEntries),
    ...[...byOwner.entries()].map(async ([ownerId, leads]) => {
      const existing = await getOwnerLeads(ownerId)
      const existingIds = new Set(existing.map((l) => l.id))
      const toAppend = leads.filter((l) => !existingIds.has(l.id))
      if (!toAppend.length) return
      await saveOwnerLeads(ownerId, [...existing, ...toAppend])
    }),
    syncSharedIndexesForLeads(newLeads, teams),
  ])
}

export async function writeLeadToShards(allLeads, { allTeams } = {}) {
  const mode = flags.LEADS_SHARDED()
  if (mode === 'off' || !kvAvailable) return
  const byOwner = new Map()
  const indexEntries = {}
  for (const lead of allLeads || []) {
    const ownerId = lead?.ownerId
    if (!ownerId) continue
    if (!byOwner.has(ownerId)) byOwner.set(ownerId, [])
    byOwner.get(ownerId).push(lead)
    if (lead.id) indexEntries[leadIndexKey(lead.id)] = ownerId
  }
  const teams = allTeams || await getAllTeams()
  // Never replace a shard wholesale from monolith — photo uploads can live on the shard first.
  await Promise.all([
    kvMSet(indexEntries),
    ...[...byOwner.entries()].map(async ([ownerId, leads]) => {
      const existing = await getOwnerLeads(ownerId)
      const merged = mergeLeadsByUpdatedAt(leads, existing)
      await saveOwnerLeads(ownerId, merged)
    }),
    syncSharedIndexesForLeads(allLeads, teams),
  ])
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
  const indexEntries = {}

  for (const lead of all) {
    const ownerId = lead?.ownerId
    if (!ownerId) continue
    if (!byOwner.has(ownerId)) byOwner.set(ownerId, [])
    byOwner.get(ownerId).push(lead)
    if (lead.id) indexEntries[leadIndexKey(lead.id)] = ownerId
    for (const uid of collectAffectedUidsForResource(lead, allTeams)) {
      if (uid !== ownerId) sharedPairs.push([uid, ownerId])
    }
  }

  await kvMSet(indexEntries)
  await Promise.all([...byOwner.entries()].map(async ([ownerId, leads]) => {
    const existing = await getOwnerLeads(ownerId)
    const merged = mergeLeadsByUpdatedAt(leads, existing)
    await saveOwnerLeads(ownerId, merged)
  }))
  // Group shared links per uid so each uid is one SADD with all owners.
  const byUid = new Map()
  for (const [uid, ownerId] of sharedPairs) {
    if (!byUid.has(uid)) byUid.set(uid, new Set())
    byUid.get(uid).add(ownerId)
  }
  await Promise.all([...byUid.entries()].map(([uid, owners]) => kvSAdd(sharedIndexKey(uid), ...owners)))

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
  appendLeadsToShards,
  backfillLeadShards,
}
