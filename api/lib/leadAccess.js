/**
 * Shared lead lookup + access for photo/report APIs.
 */

import { getAllTeams } from './teams.js'
import {
  buildAccessContext,
  getResourceAccess,
  canEdit,
  filterVisibleResources,
} from './resourceContext.js'

const LEADS_KV_KEY = 'user_leads'

let kv = null
let kvAvailable = false

if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  try {
    const kvModule = await import('@vercel/kv')
    kv = kvModule.kv
    kvAvailable = true
  } catch {
    kvAvailable = false
  }
} else if (process.env.REDIS_URL) {
  try {
    const { createClient } = await import('redis')
    kv = createClient({ url: process.env.REDIS_URL })
    await kv.connect()
    kvAvailable = true
  } catch {
    kvAvailable = false
  }
}

let fallbackLeads = []

export async function getAllLeads() {
  if (!kvAvailable || !kv) return fallbackLeads
  try {
    const data = await kv.get(LEADS_KV_KEY)
    const leads = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    const result = Array.isArray(leads) ? leads : []
    fallbackLeads = result
    return result
  } catch {
    return fallbackLeads
  }
}

export async function saveAllLeads(leads) {
  fallbackLeads = leads
  if (!kvAvailable || !kv) return
  try {
    await kv.set(LEADS_KV_KEY, leads).catch(() => kv.set(LEADS_KV_KEY, JSON.stringify(leads)))
  } catch (e) {
    console.warn('KV save failed (user_leads)', e.message)
  }
}

export async function buildLeadAccessContext(user) {
  const allTeams = await getAllTeams()
  const ctx = buildAccessContext(allTeams, user)
  return ctx
}

export async function getLeadWithAccess(user, leadId) {
  const all = await getAllLeads()
  const ctx = await buildLeadAccessContext(user)
  const lead = all.find((l) => l.id === leadId)
  if (!lead) return { lead: null, access: null, all, ctx, index: -1 }
  const access = getResourceAccess(lead, user, ctx)
  if (!access) return { lead: null, access: null, all, ctx, index: -1 }
  const index = all.findIndex((l) => l.id === leadId)
  return { lead, access, all, ctx, index }
}

export async function getVisibleLeads(user) {
  const all = await getAllLeads()
  const ctx = await buildLeadAccessContext(user)
  return filterVisibleResources(all, user, ctx)
}

export function canEditLead(access) {
  return canEdit(access) && access !== 'admin_view'
}
