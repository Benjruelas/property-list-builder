/**
 * User-scoped paths API. All methods require an async getToken() that returns Firebase ID token.
 * Writes go through the offline outbox so path saves survive dead zones.
 */

import { getApiBase } from './apiBase'
import { mutateOrQueue, newTempId } from './offlineMutate'

export async function fetchPaths(getToken) {
  const token = await getToken()
  if (!token) return []
  const res = await fetch(`${getApiBase()}/paths`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) throw new Error('Failed to fetch paths')
  const data = await res.json()
  return data.paths || []
}

export async function createPath(getToken, name, points, distanceMiles, city = '') {
  if (!(await getToken())) throw new Error('Sign in to save paths')
  const tempId = newTempId('path')
  const optimistic = {
    id: tempId,
    name,
    points,
    distanceMiles: typeof distanceMiles === 'number' ? distanceMiles : 0,
    city: city || '',
    tagIds: [],
    tagMeta: [],
    sharedWith: [],
    teamShares: [],
    visibility: 'private',
    sharedMemberUids: [],
    createdAt: new Date().toISOString(),
    _offlineQueued: true,
  }
  const result = await mutateOrQueue({
    endpoint: '/paths',
    method: 'POST',
    body: { name, points, distanceMiles, city: city || undefined },
    getToken,
    resource: 'paths',
    tempId,
    optimistic,
  })
  if (result.queued) return result.data || optimistic
  return result.data?.path
}

async function pathMutation(getToken, body, { optimistic } = {}) {
  if (!(await getToken())) throw new Error('Sign in to update paths')
  const result = await mutateOrQueue({
    endpoint: '/paths',
    method: 'PATCH',
    body,
    getToken,
    resource: 'paths',
    optimistic,
  })
  if (result.queued) return result.data || optimistic || { id: body.pathId, ...body, _offlineQueued: true }
  return result.data?.path
}

export async function updatePathTags(getToken, pathId, { tagIds, tagMeta }) {
  return pathMutation(getToken, { pathId, tagIds, tagMeta })
}

export async function renamePath(getToken, pathId, name) {
  return pathMutation(getToken, { pathId, name }, { optimistic: { id: pathId, name, _offlineQueued: true } })
}

export async function sharePath(getToken, pathId, sharedWith) {
  return pathMutation(getToken, { pathId, sharedWith })
}

export async function sharePathWithTeams(getToken, pathId, sharePatch, teamId = null) {
  return pathMutation(getToken, {
    pathId,
    visibility: sharePatch.visibility,
    sharedMemberUids: sharePatch.sharedMemberUids || [],
    teamId: sharePatch.visibility === 'team' ? teamId : null,
    teamShares: sharePatch.visibility === 'team' && teamId ? [teamId] : [],
  })
}

export async function deletePath(getToken, pathId) {
  if (!(await getToken())) throw new Error('Sign in to delete paths')
  const result = await mutateOrQueue({
    endpoint: '/paths',
    method: 'DELETE',
    body: { pathId },
    getToken,
    resource: 'paths',
  })
  if (result.queued) return
}
