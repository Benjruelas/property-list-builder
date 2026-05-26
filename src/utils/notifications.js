/**
 * In-app notification inbox API client.
 */

const getApiBase = () => {
  if (import.meta.env.DEV) return '/api'
  if (typeof window !== 'undefined') return `${window.location.origin}/api`
  return import.meta.env.VITE_API_URL || ''
}

async function parseJsonSafe(res) {
  try {
    return await res.json()
  } catch {
    return {}
  }
}

export async function fetchNotifications(getToken) {
  const token = await getToken()
  if (!token) return { notifications: [], unreadCount: 0 }
  const res = await fetch(`${getApiBase()}/notifications`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) return { notifications: [], unreadCount: 0 }
  return parseJsonSafe(res)
}

export async function markNotificationsRead(getToken, { ids = null, markAllRead = false } = {}) {
  const token = await getToken()
  if (!token) return { notifications: [], unreadCount: 0 }
  const res = await fetch(`${getApiBase()}/notifications`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(markAllRead ? { markAllRead: true } : { ids })
  })
  if (!res.ok) throw new Error('Failed to update notifications')
  return parseJsonSafe(res)
}
