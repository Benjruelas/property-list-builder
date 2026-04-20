/**
 * Vercel Serverless Function - Teams.
 *
 * - GET    /api/teams                    -> teams user owns or is a member of
 * - POST   /api/teams                    -> create team (paid-plan gate)       body: { name }
 * - PATCH  /api/teams                    -> team mutations                     body: { teamId, action, ... }
 *     action 'rename'          : { name }                (owner only)
 *     action 'add-member'      : { email }               (owner only, enforces seatLimit)
 *     action 'remove-member'   : { uid }                 (owner, OR self-remove)
 *     action 'transfer-owner'  : { toUid }               (owner only - Phase 2)
 * - DELETE /api/teams                    -> delete team, strip teamShares      body: { teamId }
 *                                          from all resources (owner only)
 *
 * Requires Firebase Auth Bearer token. Accepts dev-bypass on localhost.
 */

import { resolveDevBypassUser, isDevBypassToken } from './lib/devBypassUsers.js'
import {
  getAllTeams,
  saveAllTeams,
  loadTeamsForUser,
  lookupFirebaseUidByEmail,
  verifyFirebaseToken,
  DEFAULT_SEAT_LIMIT
} from './lib/teams.js'

let kv = null
let kvAvailable = false

if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  try {
    const kvModule = await import('@vercel/kv')
    kv = kvModule.kv
    kvAvailable = true
  } catch {
    kvAvailable = false
  }
} else if (process.env.REDIS_URL) {
  try {
    const { createClient } = await import('redis')
    kv = createClient({ url: process.env.REDIS_URL })
    await kv.connect()
    kvAvailable = true
  } catch {
    kvAvailable = false
  }
}

/** When a team is deleted we strip its id from every resource's teamShares. */
async function stripTeamIdFromAllResources(teamId) {
  if (!kvAvailable || !kv) return
  for (const key of ['user_lists', 'user_pipelines', 'user_paths']) {
    try {
      const d = await kv.get(key)
      const rows = typeof d === 'string' ? (d ? JSON.parse(d) : []) : d
      const arr = Array.isArray(rows) ? rows : []
      let changed = false
      for (const r of arr) {
        if (Array.isArray(r.teamShares) && r.teamShares.includes(teamId)) {
          r.teamShares = r.teamShares.filter((id) => id !== teamId)
          changed = true
        }
      }
      if (changed) {
        await kv.set(key, arr).catch(() => kv.set(key, JSON.stringify(arr)))
      }
    } catch (e) {
      console.warn(`strip teamId from ${key} failed`, e.message)
    }
  }
}

/**
 * Paywall gate. Phase 1: env-var allowlist OR user's user_data.plan === 'pro'.
 * Full Stripe wiring is a separate workstream.
 */
async function userCanCreateTeam(user, { allowDevBypass, idToken }) {
  if (allowDevBypass && isDevBypassToken(idToken)) return true

  const allowlist = (process.env.TEAMS_ENABLED_FOR || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  const email = (user.email || '').toLowerCase()
  if (allowlist.includes(email)) return true

  if (!kvAvailable || !kv) return false
  try {
    const key = `user_data:${user.uid}`
    const data = await kv.get(key)
    const blob = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    const plan = blob && blob.appSettings && blob.appSettings.plan
    return plan === 'pro'
  } catch {
    return false
  }
}

function normalizeTeamForWire(team) {
  return {
    id: team.id,
    name: team.name,
    ownerId: team.ownerId,
    ownerEmail: team.ownerEmail,
    members: team.members || [],
    plan: team.plan || 'pro',
    seatLimit: team.seatLimit || DEFAULT_SEAT_LIMIT,
    createdAt: team.createdAt,
    updatedAt: team.updatedAt
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const authHeader = req.headers.authorization
  const idToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  const host = req.headers.host || req.headers['x-forwarded-host'] || ''
  const origin = req.headers.origin || ''
  const isLocalhost =
    /localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0/.test(host) ||
    /localhost|127\.0\.0\.1|\[::1\]/.test(origin)
  const allowDevBypass = isLocalhost || process.env.ENABLE_DEV_BYPASS === 'true'
  let user = allowDevBypass ? resolveDevBypassUser(idToken) : null
  if (!user) user = await verifyFirebaseToken(idToken)

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Sign in and send Authorization: Bearer <token>.' })
  }

  const { method, body = {} } = req

  try {
    if (method === 'GET') {
      const all = await getAllTeams()
      const teams = loadTeamsForUser(all, user.uid).map(normalizeTeamForWire)
      return res.status(200).json({ teams })
    }

    if (method === 'POST') {
      const { name } = body
      const trimmed = (name || '').trim()
      if (!trimmed) return res.status(400).json({ error: 'Team name is required' })
      if (trimmed.length > 80) return res.status(400).json({ error: 'Team name is too long' })

      const allowed = await userCanCreateTeam(user, { allowDevBypass, idToken })
      if (!allowed) {
        return res.status(402).json({
          error: 'upgrade_required',
          message: 'Teams is a Pro feature. Upgrade to create a team.'
        })
      }

      const now = new Date().toISOString()
      const newTeam = {
        id: `team_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        name: trimmed,
        ownerId: user.uid,
        ownerEmail: user.email,
        members: [
          {
            uid: user.uid,
            email: user.email,
            role: 'owner',
            addedAt: now,
            addedBy: user.uid
          }
        ],
        plan: 'pro',
        seatLimit: DEFAULT_SEAT_LIMIT,
        teamShares: undefined, // reserved; not used on team rows themselves
        createdAt: now,
        updatedAt: now
      }
      const all = await getAllTeams()
      all.push(newTeam)
      await saveAllTeams(all)
      return res.status(201).json({ team: normalizeTeamForWire(newTeam) })
    }

    if (method === 'PATCH') {
      const { teamId, action } = body
      if (!teamId) return res.status(400).json({ error: 'teamId is required' })
      if (!action) return res.status(400).json({ error: 'action is required' })

      const all = await getAllTeams()
      const idx = all.findIndex((t) => t.id === teamId)
      if (idx === -1) return res.status(404).json({ error: 'Team not found' })
      const team = all[idx]
      const isOwner = team.ownerId === user.uid
      const selfMember = (team.members || []).find((m) => m.uid === user.uid)

      if (action === 'rename') {
        if (!isOwner) return res.status(403).json({ error: 'Only the team owner can rename the team' })
        const newName = (body.name || '').trim()
        if (!newName) return res.status(400).json({ error: 'Name cannot be empty' })
        if (newName.length > 80) return res.status(400).json({ error: 'Team name is too long' })
        team.name = newName
        team.updatedAt = new Date().toISOString()
        all[idx] = team
        await saveAllTeams(all)
        return res.status(200).json({ team: normalizeTeamForWire(team) })
      }

      if (action === 'add-member') {
        if (!isOwner) return res.status(403).json({ error: 'Only the team owner can add members' })
        const email = (body.email || '').toLowerCase().trim()
        if (!email) return res.status(400).json({ error: 'email is required' })
        if (/\s/.test(email) || !email.includes('@')) {
          return res.status(400).json({ error: 'Invalid email' })
        }

        const seatLimit = team.seatLimit || DEFAULT_SEAT_LIMIT
        if ((team.members || []).length >= seatLimit) {
          return res.status(400).json({ error: `Seat limit reached (${seatLimit})` })
        }
        if ((team.members || []).some((m) => (m.email || '').toLowerCase() === email)) {
          return res.status(400).json({ error: 'That user is already on the team' })
        }

        const resolved = await lookupFirebaseUidByEmail(email, { allowDevBypass, idToken })
        if (!resolved) {
          return res.status(404).json({ error: 'User must sign up before being added to a team' })
        }

        const now = new Date().toISOString()
        team.members = [
          ...(team.members || []),
          {
            uid: resolved.uid,
            email: resolved.email,
            role: 'member',
            addedAt: now,
            addedBy: user.uid
          }
        ]
        team.updatedAt = now
        all[idx] = team
        await saveAllTeams(all)
        return res.status(200).json({ team: normalizeTeamForWire(team) })
      }

      if (action === 'remove-member') {
        const targetUid = body.uid
        if (!targetUid) return res.status(400).json({ error: 'uid is required' })
        const selfRemove = targetUid === user.uid
        if (!isOwner && !selfRemove) {
          return res.status(403).json({ error: 'Only the team owner can remove other members' })
        }
        if (targetUid === team.ownerId) {
          return res.status(400).json({ error: 'Cannot remove the team owner. Delete the team or transfer ownership.' })
        }
        const before = (team.members || []).length
        team.members = (team.members || []).filter((m) => m.uid !== targetUid)
        if (team.members.length === before) {
          return res.status(404).json({ error: 'Member not found' })
        }
        team.updatedAt = new Date().toISOString()
        all[idx] = team
        await saveAllTeams(all)
        return res.status(200).json({ team: normalizeTeamForWire(team) })
      }

      if (action === 'transfer-owner') {
        if (!isOwner) return res.status(403).json({ error: 'Only the team owner can transfer ownership' })
        const toUid = body.toUid
        if (!toUid) return res.status(400).json({ error: 'toUid is required' })
        const target = (team.members || []).find((m) => m.uid === toUid)
        if (!target) return res.status(404).json({ error: 'New owner must already be a team member' })

        team.ownerId = target.uid
        team.ownerEmail = target.email
        team.members = (team.members || []).map((m) => {
          if (m.uid === target.uid) return { ...m, role: 'owner' }
          if (m.uid === user.uid) return { ...m, role: 'member' }
          return m
        })
        team.updatedAt = new Date().toISOString()
        all[idx] = team
        await saveAllTeams(all)
        return res.status(200).json({ team: normalizeTeamForWire(team) })
      }

      // Must be a member at least for any action below (none yet; future-proof)
      if (!selfMember && !isOwner) {
        return res.status(403).json({ error: 'Not a team member' })
      }
      return res.status(400).json({ error: `Unknown action: ${action}` })
    }

    if (method === 'DELETE') {
      const { teamId } = body
      if (!teamId) return res.status(400).json({ error: 'teamId is required' })
      const all = await getAllTeams()
      const idx = all.findIndex((t) => t.id === teamId)
      if (idx === -1) return res.status(404).json({ error: 'Team not found' })
      const team = all[idx]
      if (team.ownerId !== user.uid) {
        return res.status(403).json({ error: 'Only the team owner can delete this team' })
      }
      // Strip teamShares from resources first, then remove the team row.
      await stripTeamIdFromAllResources(team.id)
      all.splice(idx, 1)
      await saveAllTeams(all)
      return res.status(200).json({ message: 'Team deleted' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('teams API error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
