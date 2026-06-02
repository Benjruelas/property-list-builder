import { resolveDevBypassUser } from './lib/devBypassUsers.js'
import {
  getAllTeams,
  loadTeamsForUser,
  verifyFirebaseToken,
} from './lib/teams.js'
import { getTeamMemberRole } from './lib/access.js'
import {
  getInbox,
  markNotificationsRead,
  getSeenActivityIds,
  markActivitiesSeen,
  markAllActivitiesSeen,
  ensureNotificationStoreReady,
  isNotificationStoreAvailable,
} from './lib/notificationStore.js'
import {
  getTeamActivity,
  isActivityStoreAvailable,
  ensureActivityStoreReady,
} from './lib/activityStore.js'
import { mergeActivityFeeds } from './lib/activityLog.js'

/**
 * Unified notifications + team activity feed.
 * GET  ?teamId=&limit= — merged items + unreadCount
 * PATCH { markAllRead?, items?: [{ source: 'notification'|'activity', id }] }
 */

function buildFeedItems(notifications, activities, seenActivityIds) {
  const items = []

  for (const n of notifications) {
    items.push({
      id: n.id,
      source: 'notification',
      unseen: !n.read,
      createdAt: n.createdAt,
      type: n.type,
      title: n.title,
      body: n.body || '',
      summary: n.title,
      nav: n.data && typeof n.data === 'object' ? n.data : { type: n.type },
    })
  }

  for (const a of activities) {
    items.push({
      id: a.id,
      source: 'activity',
      unseen: !seenActivityIds.has(a.id),
      createdAt: a.createdAt,
      type: a.type,
      summary: a.summary,
      actorEmail: a.actorEmail,
      audience: a.audience,
      teamId: a.teamId,
      entity: a.entity && typeof a.entity === 'object' ? a.entity : {},
      nav: a.nav && typeof a.nav === 'object' ? a.nav : {},
    })
  }

  items.sort((x, y) => new Date(y.createdAt || 0).getTime() - new Date(x.createdAt || 0).getTime())
  return items
}

async function loadActivitiesForUser(user, teamIdFilter, limit) {
  if (!isActivityStoreAvailable()) return { activities: [], teams: [] }
  const storeReady = await ensureActivityStoreReady()
  if (!storeReady) return { activities: [], teams: [] }

  const allTeams = await getAllTeams()
  const userTeams = loadTeamsForUser(allTeams, user.uid)
  const userTeamIds = new Set(userTeams.map((t) => t.id))

  if (teamIdFilter && !userTeamIds.has(teamIdFilter)) {
    return { activities: [], teams: userTeams.map((t) => ({ id: t.id, name: t.name || 'Team' })) }
  }

  const targetTeamIds = teamIdFilter ? [teamIdFilter] : userTeams.map((t) => t.id)
  const feeds = await Promise.all(targetTeamIds.map((tid) => getTeamActivity(tid)))
  let activities = mergeActivityFeeds(feeds, { limit: limit * 2 })

  const adminTeamIds = new Set(
    userTeams.filter((t) => getTeamMemberRole(t, user.uid) === 'admin').map((t) => t.id)
  )
  activities = activities.filter((a) => {
    if (adminTeamIds.has(a.teamId)) return true
    return a.audience !== 'admin_only'
  })
  activities = activities.slice(0, Math.min(Math.max(limit, 1), 100))

  return {
    activities,
    teams: userTeams.map((t) => ({ id: t.id, name: t.name || 'Team' })),
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const authHeader = req.headers.authorization
  const idToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  const host = req.headers.host || req.headers['x-forwarded-host'] || ''
  const origin = req.headers.origin || ''
  const isLocalhost = /localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0/.test(host) || /localhost|127\.0\.0\.1|\[::1\]/.test(origin)
  const allowDevBypass = isLocalhost || process.env.ENABLE_DEV_BYPASS === 'true'
  let user = allowDevBypass ? resolveDevBypassUser(idToken) : null
  if (!user) user = await verifyFirebaseToken(idToken)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${host}`)
      const teamIdFilter = url.searchParams.get('teamId') || null
      const limit = parseInt(url.searchParams.get('limit') || '50', 10)

      const notifications = isNotificationStoreAvailable() && (await ensureNotificationStoreReady())
        ? await getInbox(user.uid)
        : []
      const seenActivityIds = isNotificationStoreAvailable() && (await ensureNotificationStoreReady())
        ? await getSeenActivityIds(user.uid)
        : new Set()

      const { activities, teams } = await loadActivitiesForUser(user, teamIdFilter, limit)
      const items = buildFeedItems(notifications, activities, seenActivityIds).slice(0, limit)
      const unreadCount = items.filter((i) => i.unseen).length

      return res.status(200).json({ items, unreadCount, teams })
    }

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})

      if (body.markAllRead) {
        const teamIdFilter = body.teamId || null
        const limit = 100
        const notifications = isNotificationStoreAvailable() && (await ensureNotificationStoreReady())
          ? await markNotificationsRead(user.uid, null)
          : []
        const { activities } = await loadActivitiesForUser(user, teamIdFilter, limit)
        const activityIds = activities.map((a) => a.id).filter(Boolean)
        const seenActivityIds = isNotificationStoreAvailable() && (await ensureNotificationStoreReady())
          ? await markAllActivitiesSeen(user.uid, activityIds)
          : new Set(activityIds)

        const items = buildFeedItems(notifications, activities, seenActivityIds).slice(0, limit)
        return res.status(200).json({ items, unreadCount: 0, teams: [] })
      }

      const rawItems = Array.isArray(body.items) ? body.items : []
      const notificationIds = rawItems.filter((i) => i?.source === 'notification' && i.id).map((i) => i.id)
      const activityIds = rawItems.filter((i) => i?.source === 'activity' && i.id).map((i) => i.id)

      let notifications = isNotificationStoreAvailable() && (await ensureNotificationStoreReady())
        ? await getInbox(user.uid)
        : []
      if (notificationIds.length && isNotificationStoreAvailable() && (await ensureNotificationStoreReady())) {
        notifications = await markNotificationsRead(user.uid, notificationIds)
      }

      let seenActivityIds = isNotificationStoreAvailable() && (await ensureNotificationStoreReady())
        ? await getSeenActivityIds(user.uid)
        : new Set()
      if (activityIds.length && isNotificationStoreAvailable() && (await ensureNotificationStoreReady())) {
        seenActivityIds = await markActivitiesSeen(user.uid, activityIds)
      }

      const teamIdFilter = body.teamId || null
      const { activities, teams } = await loadActivitiesForUser(user, teamIdFilter, 50)
      const items = buildFeedItems(notifications, activities, seenActivityIds).slice(0, 50)
      const unreadCount = items.filter((i) => i.unseen).length

      return res.status(200).json({ items, unreadCount, teams })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('feed API error', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
