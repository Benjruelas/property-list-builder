import { authenticate } from './_lib/auth.js'
import {
  getAllTeams,
  loadTeamsForUser,
} from './_lib/teams.js'
import { getTeamMemberRole } from './_lib/access.js'
import {
  getTeamActivity,
  isActivityStoreAvailable,
  ensureActivityStoreReady,
} from './_lib/activityStore.js'
import { mergeActivityFeeds } from './_lib/activityLog.js'

/**
 * Team activity feed API.
 * GET ?teamId=&limit=&before= — list activity for user's teams
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { user } = await authenticate(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized. Sign in and send Authorization: Bearer <token>.' })

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!isActivityStoreAvailable()) {
    return res.status(200).json({ activities: [], teams: [] })
  }

  const storeReady = await ensureActivityStoreReady()
  if (!storeReady) {
    return res.status(200).json({ activities: [], teams: [] })
  }

  try {
    const host = req.headers.host || req.headers['x-forwarded-host'] || 'localhost'
    const url = new URL(req.url, `http://${host}`)
    const teamIdFilter = url.searchParams.get('teamId') || null
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)
    const before = url.searchParams.get('before') || null

    const allTeams = await getAllTeams()
    const userTeams = loadTeamsForUser(allTeams, user.uid)
    const userTeamIds = new Set(userTeams.map((t) => t.id))

    if (teamIdFilter && !userTeamIds.has(teamIdFilter)) {
      return res.status(403).json({ error: 'Not a member of this team' })
    }

    const targetTeamIds = teamIdFilter
      ? [teamIdFilter]
      : userTeams.map((t) => t.id)

    const feeds = await Promise.all(targetTeamIds.map((tid) => getTeamActivity(tid)))
    let activities = mergeActivityFeeds(feeds, { limit: limit * 2, before })

    const adminTeamIds = new Set(
      userTeams.filter((t) => getTeamMemberRole(t, user.uid) === 'admin').map((t) => t.id)
    )
    activities = activities.filter((a) => {
      if (adminTeamIds.has(a.teamId)) return true
      return a.audience !== 'admin_only'
    })
    activities = activities.slice(0, Math.min(Math.max(limit, 1), 100))

    const teams = userTeams.map((t) => ({ id: t.id, name: t.name || 'Team' }))

    return res.status(200).json({ activities, teams })
  } catch (err) {
    console.error('activity API error', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
