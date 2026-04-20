/**
 * Shared helpers for the Teams feature.
 *
 * - KV bootstrap (same pattern as api/lists.js, api/pipelines.js, api/paths.js)
 * - getAllTeams / saveAllTeams
 * - teamsIndexFor / loadTeamsForUser
 * - resolveAccess(resource, user, teamsIndex) - single source of truth for read access
 * - lookupFirebaseUidByEmail - email -> uid resolution via identitytoolkit
 */

import { resolveDevBypassUser, isDevBypassToken, DEV_BYPASS_USER_A, DEV_BYPASS_USER_B } from './devBypassUsers.js'

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

export const TEAMS_KV_KEY = 'teams'
export const DEFAULT_SEAT_LIMIT = 10

let fallbackStore = []

export async function getAllTeams() {
  if (!kvAvailable || !kv) return fallbackStore
  try {
    const data = await kv.get(TEAMS_KV_KEY)
    const teams = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    const result = Array.isArray(teams) ? teams : []
    fallbackStore = result
    return result
  } catch {
    return fallbackStore
  }
}

export async function saveAllTeams(teams) {
  fallbackStore = teams
  if (!kvAvailable || !kv) return
  try {
    await kv.set(TEAMS_KV_KEY, teams).catch(() => kv.set(TEAMS_KV_KEY, JSON.stringify(teams)))
  } catch (e) {
    console.warn('teams KV save failed', e.message)
  }
}

/** Returns teams the user owns OR is a member of. */
export function loadTeamsForUser(teams, uid) {
  if (!Array.isArray(teams) || !uid) return []
  return teams.filter(
    (t) =>
      t.ownerId === uid ||
      (Array.isArray(t.members) && t.members.some((m) => m.uid === uid))
  )
}

/** Build a { [teamId]: team } index from a subset of team IDs. */
export function teamsIndexFor(allTeams, teamIds = []) {
  const ids = new Set(teamIds.filter(Boolean))
  const index = {}
  for (const t of allTeams) {
    if (ids.has(t.id)) index[t.id] = t
  }
  return index
}

/** Full index of every team by id. */
export function fullTeamsIndex(allTeams) {
  const index = {}
  for (const t of allTeams) {
    if (t && t.id) index[t.id] = t
  }
  return index
}

/**
 * The single source of truth for whether a user can see / mutate a resource.
 * Returns 'owner' | 'collaborator' | null.
 *
 * - owner: user.uid === resource.ownerId
 * - collaborator (email): user.email is in resource.sharedWith
 * - collaborator (team): resource.teamShares contains a team whose members include user.uid
 * - null: no access
 */
export function resolveAccess(resource, user, teamsIndex = {}) {
  if (!resource || !user) return null
  if (resource.ownerId && user.uid && resource.ownerId === user.uid) return 'owner'

  const userEmail = (user.email || '').toLowerCase().trim()
  if (userEmail && Array.isArray(resource.sharedWith)) {
    const hit = resource.sharedWith.some(
      (e) => (e || '').toLowerCase().trim() === userEmail
    )
    if (hit) return 'collaborator'
  }

  if (Array.isArray(resource.teamShares) && resource.teamShares.length > 0) {
    for (const tid of resource.teamShares) {
      const team = teamsIndex[tid]
      if (!team) continue
      const memberHit =
        team.ownerId === user.uid ||
        (Array.isArray(team.members) && team.members.some((m) => m.uid === user.uid))
      if (memberHit) return 'collaborator'
    }
  }

  return null
}

/**
 * Extract the userId of the actor from an Authorization header, using the same
 * auth chain as the resource handlers (dev-bypass first, then Firebase lookup).
 */
export function getDevBypassUserIfAllowed(req, idToken) {
  const host = req.headers.host || req.headers['x-forwarded-host'] || ''
  const origin = req.headers.origin || ''
  const isLocalhost =
    /localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0/.test(host) ||
    /localhost|127\.0\.0\.1|\[::1\]/.test(origin)
  const allowDevBypass = isLocalhost || process.env.ENABLE_DEV_BYPASS === 'true'
  const user = allowDevBypass ? resolveDevBypassUser(idToken) : null
  return { user, allowDevBypass }
}

export async function verifyFirebaseToken(idToken) {
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY
  if (!apiKey || !idToken) return null
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      }
    )
    if (!r.ok) return null
    const data = await r.json()
    const user = data.users && data.users[0]
    if (!user) return null
    return { uid: user.localId, email: (user.email || '').toLowerCase() }
  } catch (e) {
    console.error('teams token verify error', e.message)
    return null
  }
}

/**
 * Resolve an email to a Firebase uid using the privileged Identity Toolkit
 * endpoint. Requires a service account / admin API key in production.
 *
 * In dev-bypass mode: resolves our two synthetic users; others return null
 * (and the caller should respond 404 with a clear message).
 *
 * Returns { uid, email } or null if the user isn't registered.
 */
export async function lookupFirebaseUidByEmail(rawEmail, { allowDevBypass = false, idToken = null } = {}) {
  const email = (rawEmail || '').toLowerCase().trim()
  if (!email) return null

  if (allowDevBypass) {
    if (email === DEV_BYPASS_USER_A.email) return { uid: DEV_BYPASS_USER_A.uid, email }
    if (email === DEV_BYPASS_USER_B.email) return { uid: DEV_BYPASS_USER_B.uid, email }
    if (idToken && isDevBypassToken(idToken)) {
      // In dev-bypass mode we don't have real Firebase lookup; fabricate a
      // deterministic uid so the team can still be exercised locally.
      return { uid: `dev-${email}`, email }
    }
  }

  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY
  if (!apiKey) {
    // Without a key we can't verify - fail closed.
    return null
  }

  // identitytoolkit accounts:lookup with an idToken only returns the bearer's
  // account. To look up another user by email we need a service-account /
  // admin credential, which isn't wired into this project. Fall back to the
  // existing "email is known to our data" heuristic: if the email owns or is
  // a collaborator on any list/pipeline, they're registered.
  //
  // This mirrors api/validate-share-email.js. Rate-limit pressure therefore
  // stays on our own KV, not on identitytoolkit.
  try {
    const [lists, pipelines] = await Promise.all([
      (async () => {
        if (!kvAvailable || !kv) return []
        try {
          const d = await kv.get('user_lists')
          const v = typeof d === 'string' ? (d ? JSON.parse(d) : []) : d
          return Array.isArray(v) ? v : []
        } catch {
          return []
        }
      })(),
      (async () => {
        if (!kvAvailable || !kv) return []
        try {
          const d = await kv.get('user_pipelines')
          const v = typeof d === 'string' ? (d ? JSON.parse(d) : []) : d
          return Array.isArray(v) ? v : []
        } catch {
          return []
        }
      })()
    ])

    // Search owners first (they have uid + email). Collaborators only carry
    // email; we can't recover their uid without Firebase Admin.
    for (const r of [...lists, ...pipelines]) {
      const ownerEmail = (r.ownerEmail || '').toLowerCase().trim()
      if (ownerEmail === email && r.ownerId) {
        return { uid: r.ownerId, email }
      }
    }

    // Collaborator-only: email is "known" but uid unknown. Return a synthetic
    // email-keyed uid so the team add succeeds; resolveAccess still works
    // because team members are keyed on uid, and this user's real uid will
    // match their own resources when they log in via email-based sharedWith
    // matching. For team-keyed resolution to work for THIS email-only user
    // we record the email and rely on a uid-less fallback in resolveAccess.
    const emailSet = new Set()
    for (const r of [...lists, ...pipelines]) {
      for (const e of r.sharedWith || []) {
        const s = (e || '').toLowerCase().trim()
        if (s) emailSet.add(s)
      }
    }
    if (emailSet.has(email)) {
      // Can't produce a real uid; signal not-found so the UX forces the user
      // to sign up / sign in at least once (at which point their uid appears
      // on a resource they own and we can resolve).
      return null
    }
  } catch (e) {
    console.warn('teams email lookup fallback failed', e.message)
  }

  return null
}
