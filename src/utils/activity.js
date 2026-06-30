/**
 * Team activity feed API client.
 */

import { getApiBase } from './apiBase'

async function parseJsonSafe(res) {
  try {
    return await res.json()
  } catch {
    return {}
  }
}

export async function fetchActivity(getToken, { teamId = null, limit = 50, before = null } = {}) {
  const token = await getToken()
  if (!token) return { activities: [], teams: [] }

  const params = new URLSearchParams()
  if (teamId) params.set('teamId', teamId)
  if (limit) params.set('limit', String(limit))
  if (before) params.set('before', before)

  const qs = params.toString()
  const res = await fetch(`${getApiBase()}/activity${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return { activities: [], teams: [] }
  return parseJsonSafe(res)
}
