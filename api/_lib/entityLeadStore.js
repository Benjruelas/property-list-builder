/**
 * Per-entity lead storage (`lead-entity:{id}`) with owner index parity.
 * Dual-written from leadStore mutations; indexed reads avoid full-catalog loads.
 */

import { kv, kvAvailable } from './kvBootstrap.js'
import { flags } from './flags.js'
import { getLeadOwnerId, getOwnerLeads, indexLead, removeLeadIndex } from './leadRepo.js'

export const LEAD_ENTITY_PREFIX = 'lead-entity:'

export function leadEntityKey(leadId) {
  const id = String(leadId || '').trim()
  if (!id) return null
  return `${LEAD_ENTITY_PREFIX}${id}`
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
    console.warn('entityLeadStore KV set failed', key, e.message)
  }
}

export async function getLeadEntity(leadId) {
  if (!leadId) return null
  const key = leadEntityKey(leadId)
  if (!key) return null

  const direct = await kvGetJson(key)
  if (direct?.id) return direct

  const ownerId = await getLeadOwnerId(leadId)
  if (ownerId) {
    const ownerLeads = await getOwnerLeads(ownerId)
    const fromShard = ownerLeads.find((l) => l.id === leadId) || null
    if (fromShard) return fromShard
  }

  if (flags.LEADS_SHARDED() === 'off') {
    const { getAllLeads } = await import('./leadStore.js')
    const all = await getAllLeads()
    return all.find((l) => l.id === leadId) || null
  }

  return null
}

export async function saveLeadEntity(lead) {
  if (!lead?.id) return
  const key = leadEntityKey(lead.id)
  if (!key) return
  await kvSetJson(key, lead)
  await indexLead(lead)
}

export async function deleteLeadEntity(leadId) {
  if (!leadId || !kvAvailable || !kv) return
  const key = leadEntityKey(leadId)
  try {
    if (key) await kv.del(key)
  } catch { /* ignore */ }
  await removeLeadIndex(leadId)
}

export async function writeLeadEntities(leads) {
  if (!Array.isArray(leads) || !leads.length) return
  await Promise.all(leads.map((lead) => saveLeadEntity(lead)))
}
