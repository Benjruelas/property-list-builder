import { requireAuth } from './lib/apiAuth.js'
import {
  getInbox,
  markNotificationsRead,
  getUnreadCount,
  isNotificationStoreAvailable,
  ensureNotificationStoreReady,
} from './lib/notificationStore.js'

/**
 * In-app notification inbox API.
 * GET  — list notifications + unreadCount
 * PATCH { markAllRead?: boolean, ids?: string[] } — mark read
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const user = await requireAuth(req, res)
  if (!user) return

  if (!isNotificationStoreAvailable()) {
    return req.method === 'GET'
      ? res.status(200).json({ notifications: [], unreadCount: 0 })
      : res.status(503).json({ error: 'Storage unavailable' })
  }

  const storeReady = await ensureNotificationStoreReady()
  if (!storeReady) {
    return req.method === 'GET'
      ? res.status(200).json({ notifications: [], unreadCount: 0 })
      : res.status(503).json({ error: 'Storage unavailable' })
  }

  try {
    if (req.method === 'GET') {
      const notifications = await getInbox(user.uid)
      const unreadCount = await getUnreadCount(user.uid)
      return res.status(200).json({ notifications, unreadCount })
    }

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
      const ids = body.markAllRead ? null : (Array.isArray(body.ids) ? body.ids : [])
      const notifications = await markNotificationsRead(user.uid, ids)
      const unreadCount = notifications.filter((n) => !n.read).length
      return res.status(200).json({ notifications, unreadCount })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('notifications API error', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
