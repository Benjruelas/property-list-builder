/**
 * Shared KV / local-dev storage for user_leads — used by leads.js and lead-photos.js
 * so photo uploads and lead CRUD read the same data.
 */

import { kv, kvAvailable } from './kvBootstrap.js'
import { readLocalDevArray, writeLocalDevArray } from './localDevPersistence.js'

export const LEADS_KV_KEY = 'user_leads'

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
  const result = await loadLeadsArray()
  fallbackLeads = result
  return result
}

export async function saveAllLeads(leads) {
  fallbackLeads = leads
  await writeLocalDevArray(LEADS_KV_KEY, leads)
  if (!kvAvailable || !kv) return
  try {
    await kv.set(LEADS_KV_KEY, leads).catch(() => kv.set(LEADS_KV_KEY, JSON.stringify(leads)))
  } catch (e) {
    console.warn('KV save failed (user_leads)', e.message)
  }
}
