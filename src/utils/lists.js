/**
 * User-scoped lists API. All methods require an async getToken() that returns Firebase ID token.
 * Writes go through the offline outbox so list edits survive dead zones.
 */

import { getApiBase } from './apiBase'
import { mutateOrQueue, newTempId } from './offlineMutate'

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
  if (!(await getToken())) throw new Error('Sign in to create lists')

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

  const tempId = newTempId('list')
  const optimistic = {
    id: tempId,
    name: body.name,
    parcels: parcelList,
    tagIds: tagIds || [],
    tagMeta: tagMeta || [],
    sharedWith: sharedWith || [],
    teamShares: teamShares || [],
    teamId: teamId || null,
    visibility: visibility || 'private',
    sharedMemberUids: sharedMemberUids || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    _offlineQueued: true,
  }

  const result = await mutateOrQueue({
    endpoint: '/lists',
    method: 'POST',
    body,
    getToken,
    resource: 'lists',
    tempId,
    optimistic,
  })
  if (result.queued) return result.data || optimistic
  if (!result.data?.list) throw new Error('Failed to create list')
  return result.data.list
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
  if (!(await getToken())) throw new Error('Sign in to update lists')
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

  try {
    const result = await mutateOrQueue({
      endpoint: '/lists',
      method: 'PATCH',
      body,
      getToken,
      resource: 'lists',
      optimistic: { id: String(listId), ...updates, _offlineQueued: true },
    })
    if (result.queued) return result.data || { id: String(listId), ...updates, _offlineQueued: true }
    if (!result.data?.list) throw new Error('Invalid response from server when updating list')
    return result.data.list
  } catch (e) {
    const msg = e?.message || ''
    throw new Error(
      /failed to fetch|networkerror|load failed/i.test(msg)
        ? 'Network error — check that the dev server is running and try again.'
        : msg || 'Failed to update list'
    )
  }
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
  if (!(await getToken())) throw new Error('Sign in to delete lists')
  if (listId == null || String(listId).trim() === '') {
    throw new Error('List id is missing')
  }
  const result = await mutateOrQueue({
    endpoint: '/lists',
    method: 'DELETE',
    body: { listId: String(listId) },
    getToken,
    resource: 'lists',
  })
  if (result.queued) return
}
