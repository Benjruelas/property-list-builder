/**
 * Lead-scoped form activity (invites + submissions).
 */

import { getApiBase } from './apiBase'

async function parseJsonSafe(res) {
  try {
    return await res.json()
  } catch {
    return {}
  }
}

const leadFormsListCache = new Map()
const leadFormsInflight = new Map()

export function peekCachedLeadForms(leadId) {
  if (!leadId) return undefined
  if (!leadFormsListCache.has(leadId)) return undefined
  return leadFormsListCache.get(leadId)
}

export function invalidateCachedLeadForms(leadId) {
  if (!leadId) return
  leadFormsListCache.delete(leadId)
  leadFormsInflight.delete(leadId)
}

export function isLeadFormsFetchInflight(leadId) {
  return !!leadId && leadFormsInflight.has(leadId)
}

export async function fetchLeadForms(getToken, leadId) {
  if (!leadId) return []
  const cached = peekCachedLeadForms(leadId)
  if (cached !== undefined) return cached

  const pending = leadFormsInflight.get(leadId)
  if (pending) return pending

  const request = (async () => {
    const token = await getToken()
    if (!token) return []
    const res = await fetch(`${getApiBase()}/lead-forms?leadId=${encodeURIComponent(leadId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const err = await parseJsonSafe(res)
      throw new Error(err.error || 'Failed to fetch lead forms')
    }
    const data = await parseJsonSafe(res)
    const items = Array.isArray(data.items) ? data.items : []
    leadFormsListCache.set(leadId, items)
    leadFormsInflight.delete(leadId)
    return items
  })().catch((err) => {
    leadFormsInflight.delete(leadId)
    throw err
  })

  leadFormsInflight.set(leadId, request)
  return request
}

export function leadFormStatusLabel(status) {
  switch (status) {
    case 'completed': return 'Completed'
    case 'sent': return 'Sent'
    case 'pending': return 'Pending'
    case 'expired': return 'Expired'
    case 'revoked': return 'Revoked'
    default: return status || 'Unknown'
  }
}
