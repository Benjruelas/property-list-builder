/**
 * Shared KV / local-dev storage for user_leads — used by leads.js and lead-photos.js
 * so photo uploads and lead CRUD read the same data.
 */

import { kv, kvAvailable } from './kvBootstrap.js'
import { readLocalDevArray, writeLocalDevArray } from './localDevPersistence.js'
import { flags } from './flags.js'
import { withKvLock } from './kvLock.js'
import { KvLockUnavailableError } from './kvLockErrors.js'
import { withTiming } from './timing.js'
import {
  writeLeadToShards,
  appendLeadsToShards,
  removeLeadIndex,
  syncSharedIndexForLead,
  getLeadOwnerId,
  getOwnerLeads,
  saveOwnerLeads,
} from './leadRepo.js'
import { writeLeadEntities, deleteLeadEntity } from './entityLeadStore.js'
import { bumpLeadsVersionsForResource } from './dataVersion.js'
import { getAllTeams } from './teams.js'

export const LEADS_KV_KEY = 'user_leads'
const LOCK_KEY = 'lock:user_leads'

let fallbackLeads = []
let leadsReadCache = null
let leadsReadCacheAt = 0
const LEADS_READ_CACHE_MS = 3000

function invalidateLeadsReadCache() {
  leadsReadCache = null
  leadsReadCacheAt = 0
}

async function loadLeadsArray() {
  if (!kvAvailable || !kv) {
    return readLocalDevArray(LEADS_KV_KEY, fallbackLeads)
  }
  try {
    const data = await kv.get(LEADS_KV_KEY)
    const leads = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    const result = Array.isArray(leads) ? leads : []
    if (result.length > 0) {
      fallbackLeads = result
      return result
    }
    return readLocalDevArray(LEADS_KV_KEY, fallbackLeads)
  } catch {
    return readLocalDevArray(LEADS_KV_KEY, fallbackLeads)
  }
}

export async function getAllLeads() {
  if (leadsReadCache && Date.now() - leadsReadCacheAt < LEADS_READ_CACHE_MS) {
    return leadsReadCache
  }
  return withTiming('leadStore.getAllLeads', async () => {
    const result = await loadLeadsArray()
    fallbackLeads = result
    leadsReadCache = result
    leadsReadCacheAt = Date.now()
    const bytes = JSON.stringify(result).length
    if (bytes > 512 * 1024) {
      console.warn(JSON.stringify({ type: 'user_leads_size_warning', bytes, count: result.length }))
    }
    return result
  })
}

export async function saveAllLeads(leads, { changedResources = [], appendOnlyLeads = null } = {}) {
  return withTiming('leadStore.saveAllLeads', async () => {
    invalidateLeadsReadCache()
    fallbackLeads = leads
    await writeLocalDevArray(LEADS_KV_KEY, leads)
    if (kvAvailable && kv) {
      try {
        await kv.set(LEADS_KV_KEY, leads).catch(() => kv.set(LEADS_KV_KEY, JSON.stringify(leads)))
      } catch (e) {
        console.warn('KV save failed (user_leads)', e.message)
      }
    }
    if (appendOnlyLeads?.length) {
      const allTeams = await getAllTeams()
      await appendLeadsToShards(appendOnlyLeads, { allTeams })
    } else if (appendOnlyLeads === null) {
      await writeLeadToShards(leads)
    }
    if (changedResources.length) {
      const changed = changedResources
        .map((item) => item.resource)
        .filter(Boolean)
      if (changed.length) await writeLeadEntities(changed)
    }
    if (flags.LEADS_SHARDED() !== 'off' && changedResources.length) {
      const allTeams = await getAllTeams()
      for (const item of changedResources) {
        if (item.resource) {
          await syncSharedIndexForLead(item.resource, item.prevResource || null, allTeams)
        } else if (item.prevResource) {
          await syncSharedIndexForLead(null, item.prevResource, allTeams)
        }
      }
    }
    if (flags.VERSIONED_POLL()) {
      for (const item of changedResources) {
        await bumpLeadsVersionsForResource(item.resource, { prevResource: item.prevResource })
      }
    }
    return leads
  }, { count: Array.isArray(leads) ? leads.length : 0 })
}

async function upsertLeadInMonolith(updated, prevResource, changedResources) {
  if (!updated?.id) return null
  const all = await loadLeadsArray()
  const idx = all.findIndex((l) => l.id === updated.id)
  const next = idx === -1
    ? [...all, updated]
    : all.map((lead, i) => (i === idx ? updated : lead))
  const prev = prevResource ?? (idx >= 0 ? all[idx] : null)
  if (!changedResources.length) {
    changedResources.push({ resource: updated, prevResource: prev })
  }
  return saveAllLeads(next, { changedResources })
}

/**
 * Atomic read-modify-write when FLAG_LEADS_LOCK is enabled.
 * mutatorFn receives the current array and must return the next array (or undefined to skip save).
 * changedResources: [{ resource, prevResource? }] for version bumps.
 */
export async function mutateLeads(mutatorFn, { changedResources = [], appendOnly = false } = {}) {
  const run = async () => {
    const all = await loadLeadsArray()
    const next = await mutatorFn(all)
    if (next === undefined || next === all) return all
    const appendOnlyLeads = appendOnly
      ? next.filter((lead) => lead?.id && !all.some((prev) => prev.id === lead.id))
      : null
    return saveAllLeads(next, { changedResources, appendOnlyLeads })
  }

  if (!flags.LEADS_LOCK()) return run()

  const locked = await withKvLock(LOCK_KEY, run, { ttlMs: 10000, maxWaitMs: 5000 })
  if (locked !== null) return locked
  throw new KvLockUnavailableError(LOCK_KEY)
}

async function mutateSingleLeadInShard(leadId, mutatorFn, changedResources) {
  const ownerId = await getLeadOwnerId(leadId)
  if (!ownerId) return null

  const ownerLeads = await getOwnerLeads(ownerId)
  const idx = ownerLeads.findIndex((l) => l.id === leadId)
  if (idx === -1) return null

  const prevLead = ownerLeads[idx]
  const updated = mutatorFn(prevLead, ownerLeads, idx)
  if (!updated) return null

  const nextOwnerLeads = [...ownerLeads]
  nextOwnerLeads[idx] = updated

  await saveOwnerLeads(ownerId, nextOwnerLeads)
  await writeLeadEntities([updated])

  if (!changedResources.length) {
    changedResources.push({ resource: updated, prevResource: prevLead })
  }

  if (flags.LEADS_SHARDED() !== 'off') {
    const allTeams = await getAllTeams()
    await syncSharedIndexForLead(updated, prevLead, allTeams)
    await upsertLeadInMonolith(updated, prevLead, changedResources)
    return updated
  }
  if (flags.VERSIONED_POLL()) {
    await bumpLeadsVersionsForResource(updated, { prevResource: prevLead })
  }

  return updated
}

export async function mutateSingleLead(leadId, mutatorFn, { changedResources = [] } = {}) {
  let result = null
  await mutateLeads((all) => {
    const idx = all.findIndex((l) => l.id === leadId)
    if (idx === -1) return undefined
    const prevLead = all[idx]
    const updated = mutatorFn(prevLead, all, idx)
    if (!updated) return undefined
    const next = [...all]
    next[idx] = updated
    result = updated
    if (!changedResources.length) {
      changedResources.push({ resource: updated, prevResource: prevLead })
    }
    return next
  }, { changedResources })

  if (result) return result
  if (flags.LEADS_SHARDED() === 'off') return null
  return mutateSingleLeadInShard(leadId, mutatorFn, changedResources)
}

export async function deleteLeadFromStore(leadId) {
  let removed = null
  await mutateLeads((all) => {
    const idx = all.findIndex((l) => l.id === leadId)
    if (idx === -1) return undefined
    removed = all[idx]
    const next = all.filter((l) => l.id !== leadId)
    return next
  }, { changedResources: removed ? [{ resource: null, prevResource: removed }] : [] })
  if (removed) {
    await removeLeadIndex(leadId)
    await deleteLeadEntity(leadId)
  }
  return removed
}

export default {
  getAllLeads,
  saveAllLeads,
  mutateLeads,
  mutateSingleLead,
}
