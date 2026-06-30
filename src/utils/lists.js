/**
 * User-scoped lists API. All methods require an async getToken() that returns Firebase ID token.
 */

import { getApiBase } from './apiBase'

export async function fetchLists(getToken) {
  const token = await getToken()
  if (!token) return []
  const res = await fetch(`${getApiBase()}/lists`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) throw new Error('Failed to fetch lists')
  const data = await res.json()
  return data.lists || []
}

export async function createList(getToken, input, parcels = []) {
  const token = await getToken()
  if (!token) throw new Error('Sign in to create lists')

  const opts = typeof input === 'string' ? { name: input, parcels } : { parcels: [], ...input }
  const {
    name,
    parcels: parcelList = parcels,
    tagIds,
    tagMeta,
    visibility,
    sharedMemberUids,
    teamShares,
    teamId,
    sharedWith,
  } = opts

  const body = { name: String(name || '').trim(), parcels: parcelList }
  if (tagIds !== undefined) body.tagIds = tagIds
  if (tagMeta !== undefined) body.tagMeta = tagMeta
  if (visibility !== undefined) body.visibility = visibility
  if (sharedMemberUids !== undefined) body.sharedMemberUids = sharedMemberUids
  if (teamShares !== undefined) body.teamShares = teamShares
  if (teamId !== undefined) body.teamId = teamId
  if (sharedWith !== undefined) body.sharedWith = sharedWith

  const res = await fetch(`${getApiBase()}/lists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to create list')
  }
  const data = await res.json()
  return data.list
}

export async function updateList(getToken, listId, updates = {}) {
  const {
    parcels,
    removeParcels,
    sharedWith,
    teamShares,
    teamId,
    visibility,
    sharedMemberUids,
    name,
    tagIds,
    tagMeta,
  } = updates
  const token = await getToken()
  if (!token) throw new Error('Sign in to update lists')
  if (listId == null || String(listId).trim() === '') {
    throw new Error('List id is missing')
  }
  const body = { listId: String(listId) }
  if (parcels !== undefined) body.parcels = parcels
  if (removeParcels !== undefined) body.removeParcels = removeParcels
  if (sharedWith !== undefined) body.sharedWith = sharedWith
  if (teamShares !== undefined) body.teamShares = teamShares
  if (teamId !== undefined) body.teamId = teamId
  if (visibility !== undefined) body.visibility = visibility
  if (sharedMemberUids !== undefined) body.sharedMemberUids = sharedMemberUids
  if (name !== undefined) body.name = name
  if (tagIds !== undefined) body.tagIds = tagIds
  if (tagMeta !== undefined) body.tagMeta = tagMeta
  let res
  try {
    res = await fetch(`${getApiBase()}/lists`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
  } catch (e) {
    const msg = e?.message || ''
    throw new Error(
      /failed to fetch|networkerror|load failed/i.test(msg)
        ? 'Network error — check that the dev server is running and try again.'
        : msg || 'Failed to update list'
    )
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to update list')
  }
  const data = await res.json().catch(() => ({}))
  if (!data || typeof data !== 'object' || data.list == null) {
    throw new Error('Invalid response from server when updating list')
  }
  return data.list
}

export async function validateShareEmail(getToken, email) {
  const trimmed = (email || '').trim().toLowerCase()
  if (!trimmed) return { valid: false }
  const token = await getToken()
  if (!token) return { valid: false }
  const base = getApiBase()
  const url = `${base}/validate-share-email?email=${encodeURIComponent(trimmed)}`
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) return { valid: false }
  const data = await res.json().catch(() => ({}))
  return { valid: !!data.valid }
}

export async function deleteList(getToken, listId) {
  const token = await getToken()
  if (!token) throw new Error('Sign in to delete lists')
  if (listId == null || String(listId).trim() === '') {
    throw new Error('List id is missing')
  }
  const res = await fetch(`${getApiBase()}/lists`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ listId: String(listId) }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to delete list')
  }
}
