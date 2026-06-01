/**
 * Unified notifications + activity feed API client.
 */

const getApiBase = () => {
  if (import.meta.env.DEV) return '/api'
  if (typeof window !== 'undefined') return `${window.location.origin}/api`
  return import.meta.env.VITE_API_URL || ''
}

const LOCAL_SEEN_PREFIX = 'feed_seen_activity_v1_'

function localSeenKey(uid) {
  return `${LOCAL_SEEN_PREFIX}${uid || 'anon'}`
}

function getLocalSeenActivityIds(uid) {
  try {
    const raw = localStorage.getItem(localSeenKey(uid))
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : [])
  } catch {
    return new Set()
  }
}

function addLocalSeenActivityIds(uid, ids) {
  if (!uid || !ids?.length) return
  try {
    const seen = getLocalSeenActivityIds(uid)
    for (const id of ids) seen.add(id)
    localStorage.setItem(localSeenKey(uid), JSON.stringify([...seen].slice(-500)))
  } catch {
    /* ignore */
  }
}

async function parseJsonSafe(res) {
  try {
    return await res.json()
  } catch {
    return {}
  }
}

function applyLocalSeen(items, uid) {
  if (!uid || !items?.length) return items
  const localSeen = getLocalSeenActivityIds(uid)
  if (localSeen.size === 0) return items
  return items.map((item) => {
    if (item.source === 'activity' && localSeen.has(item.id)) {
      return { ...item, unseen: false }
    }
    return item
  })
}

function countUnseen(items) {
  return (items || []).filter((i) => i.unseen).length
}

export function feedItemKey(item) {
  return `${item.source}:${item.id}`
}

export function collectUnseenKeys(items) {
  const keys = new Set()
  for (const item of items || []) {
    if (item.unseen) keys.add(feedItemKey(item))
  }
  return keys
}

export async function fetchFeed(getToken, { teamId = null, limit = 50, uid = null } = {}) {
  const token = await getToken?.()
  if (!token) return { items: [], unreadCount: 0, teams: [] }

  const params = new URLSearchParams()
  if (teamId) params.set('teamId', teamId)
  if (limit) params.set('limit', String(limit))
  const qs = params.toString()

  const res = await fetch(`${getApiBase()}/feed${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return { items: [], unreadCount: 0, teams: [] }

  const data = await parseJsonSafe(res)
  let items = applyLocalSeen(data.items || [], uid)
  return {
    items,
    unreadCount: countUnseen(items),
    teams: data.teams || [],
  }
}

export async function markFeedSeen(getToken, { items = null, markAllRead = false, teamId = null, uid = null } = {}) {
  const token = await getToken?.()
  if (!token) return { items: [], unreadCount: 0, teams: [] }

  if (items?.length && uid) {
    const activityIds = items.filter((i) => i.source === 'activity' && i.id).map((i) => i.id)
    if (activityIds.length) addLocalSeenActivityIds(uid, activityIds)
  }
  if (markAllRead && uid) {
    /* markAllRead activity ids filled in after response */
  }

  const res = await fetch(`${getApiBase()}/feed`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(
      markAllRead
        ? { markAllRead: true, teamId }
        : { items: items || [], teamId }
    ),
  })
  if (!res.ok) throw new Error('Failed to update feed')

  const data = await parseJsonSafe(res)
  if (markAllRead && uid) {
    const activityIds = (data.items || []).filter((i) => i.source === 'activity').map((i) => i.id)
    addLocalSeenActivityIds(uid, activityIds)
  }

  let merged = applyLocalSeen(data.items || [], uid)
  return {
    items: merged,
    unreadCount: countUnseen(merged),
    teams: data.teams || [],
  }
}
