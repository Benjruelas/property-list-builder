/**
 * Shared KV / local-dev storage for user_leads — used by leads.js and lead-photos.js
 * so photo uploads and lead CRUD read the same data.
 */

import { kv, kvAvailable } from './kvBootstrap.js'
import { readLocalDevArray, writeLocalDevArray } from './localDevPersistence.js'
import { flags } from './flags.js'
import { withKvLock } from './kvLock.js'
import { withTiming } from './timing.js'
import { writeLeadToShards, removeLeadIndex } from './leadRepo.js'
import { bumpLeadsVersionsForResource } from './dataVersion.js'

export const LEADS_KV_KEY = 'user_leads'
const LOCK_KEY = 'lock:user_leads'

let fallbackLeads = []

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
  return withTiming('leadStore.getAllLeads', async () => {
    const result = await loadLeadsArray()
    fallbackLeads = result
    return result
  })
}

export async function saveAllLeads(leads, { changedResources = [] } = {}) {
  return withTiming('leadStore.saveAllLeads', async () => {
    fallbackLeads = leads
    await writeLocalDevArray(LEADS_KV_KEY, leads)
    if (kvAvailable && kv) {
      try {
        await kv.set(LEADS_KV_KEY, leads).catch(() => kv.set(LEADS_KV_KEY, JSON.stringify(leads)))
      } catch (e) {
        console.warn('KV save failed (user_leads)', e.message)
      }
    }
    await writeLeadToShards(leads)
    if (flags.VERSIONED_POLL()) {
      for (const item of changedResources) {
        await bumpLeadsVersionsForResource(item.resource, { prevResource: item.prevResource })
      }
    }
    return leads
  }, { count: Array.isArray(leads) ? leads.length : 0 })
}

/**
 * Atomic read-modify-write when FLAG_LEADS_LOCK is enabled.
 * mutatorFn receives the current array and must return the next array (or undefined to skip save).
 * changedResources: [{ resource, prevResource? }] for version bumps.
 */
export async function mutateLeads(mutatorFn, { changedResources = [] } = {}) {
  const run = async () => {
    const all = await loadLeadsArray()
    const next = await mutatorFn(all)
    if (next === undefined || next === all) return all
    return saveAllLeads(next, { changedResources })
  }

  if (!flags.LEADS_LOCK()) return run()

  const locked = await withKvLock(LOCK_KEY, run)
  if (locked !== null) return locked
  return run()
}

export async function mutateSingleLead(leadId, mutatorFn, { changedResources = [] } = {}) {
  let result = null
  let prevLead = null
  await mutateLeads((all) => {
    const idx = all.findIndex((l) => l.id === leadId)
    if (idx === -1) return undefined
    prevLead = all[idx]
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
  return result
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
  if (removed) await removeLeadIndex(leadId)
  return removed
}

export default {
  getAllLeads,
  saveAllLeads,
  mutateLeads,
  mutateSingleLead,
}
