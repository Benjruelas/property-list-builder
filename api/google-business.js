/**
 * Google Business Profile connection API.
 *
 * GET  ?scope=user|team&teamId=  → connection status (+ pending locations)
 * POST actions:
 *   connect | select-location | sync-reviews | set-featured | disconnect
 */

import { requireAuth } from './_lib/apiAuth.js'
import { applyCors } from './_lib/cors.js'
import { getAllTeams, loadTeamsForUser } from './_lib/teams.js'
import { isTeamAdmin } from './_lib/access.js'
import {
  gbpConfigured,
  resolveRedirectUri,
  signOAuthState,
  buildGoogleAuthUrl,
  loadPendingGbp,
  clearPendingGbp,
  loadGbpProfileForScope,
  saveGbpProfileForScope,
  toPublicGoogleBusinessProfile,
  emptyGoogleBusinessProfile,
  normalizeFeaturedReviewIds,
  normalizeGoogleBusinessProfile,
  encryptSecret,
  decryptSecret,
  revokeGoogleToken,
  syncReviewsIntoProfile,
  MAX_FEATURED_REVIEWS,
} from './_lib/googleBusinessProfile.js'

async function assertScopeAccess(user, scope, teamId) {
  const all = await getAllTeams()
  const membership = loadTeamsForUser(all, user.uid)[0] || null

  if (scope === 'user') {
    if (membership) {
      return { error: 'Team members use the team Google Business Profile', status: 403 }
    }
    return { ok: true, team: null }
  }

  if (scope === 'team') {
    if (!teamId) return { error: 'teamId is required', status: 400 }
    const team = all.find((t) => t.id === teamId)
    if (!team) return { error: 'Team not found', status: 404 }
    if (!isTeamAdmin(team, user.uid)) {
      return { error: 'Only team admins can manage Google Business Profile', status: 403 }
    }
    return { ok: true, team }
  }

  return { error: 'Invalid scope', status: 400 }
}

export default async function handler(req, res) {
  applyCors(req, res, { methods: 'GET, POST, OPTIONS' })
  if (req.method === 'OPTIONS') return res.status(200).end()

  const user = await requireAuth(req, res)
  if (!user) return

  try {
    if (!gbpConfigured()) {
      return res.status(503).json({
        error: 'Google Business Profile is not configured on this server',
        configured: false,
      })
    }

    if (req.method === 'GET') {
      const scope = String(req.query.scope || 'user').trim()
      const teamId = String(req.query.teamId || '').trim() || null
      const access = await assertScopeAccess(user, scope, teamId)
      if (access.error) return res.status(access.status).json({ error: access.error })

      // Team members (non-admin) may view team connection read-only via teamId + member check
      if (scope === 'team' && access.team) {
        /* admin already verified */
      }

      const { profile } = await loadGbpProfileForScope({ scope, teamId, uid: user.uid })
      const pending = scope === 'user' || scope === 'team'
        ? await loadPendingGbp(user.uid)
        : null
      const pendingForScope =
        pending && pending.scope === scope && (scope === 'user' || pending.teamId === teamId)
          ? {
              locations: pending.locations || [],
              expiresAt: pending.exp || null,
            }
          : null

      return res.status(200).json({
        configured: true,
        connection: toPublicGoogleBusinessProfile(profile),
        pendingLocations: pendingForScope,
        maxFeatured: MAX_FEATURED_REVIEWS,
      })
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const action = String(body.action || '').trim()
    const scope = String(body.scope || 'user').trim()
    const teamId = String(body.teamId || '').trim() || null

    const access = await assertScopeAccess(user, scope, teamId)
    if (access.error) return res.status(access.status).json({ error: access.error })

    if (action === 'connect') {
      const state = signOAuthState({ uid: user.uid, scope, teamId })
      const redirectUri = resolveRedirectUri(req)
      const authUrl = buildGoogleAuthUrl({ state, redirectUri })
      return res.status(200).json({ authUrl })
    }

    if (action === 'select-location') {
      const pending = await loadPendingGbp(user.uid)
      if (!pending || pending.scope !== scope || (scope === 'team' && pending.teamId !== teamId)) {
        return res.status(400).json({ error: 'No pending Google connection. Connect again.' })
      }
      const accountName = String(body.accountName || '').trim()
      const locationName = String(body.locationName || '').trim()
      const locationTitle = String(body.locationTitle || '').trim()
      const mapsUri = String(body.mapsUri || '').trim()
      const match = (pending.locations || []).find(
        (l) => l.locationName === locationName && (!accountName || l.accountName === accountName),
      )
      if (!match && !(accountName && locationName)) {
        return res.status(400).json({ error: 'Invalid location selection' })
      }
      const chosen = match || { accountName, locationName, locationTitle, mapsUri }
      const refreshToken = pending.refreshTokenEnc
        ? decryptSecret(pending.refreshTokenEnc)
        : pending.refreshToken
      if (!refreshToken) {
        return res.status(400).json({ error: 'Pending connection expired. Connect again.' })
      }

      let profile = normalizeGoogleBusinessProfile({
        connected: true,
        accountName: chosen.accountName,
        locationName: chosen.locationName,
        locationTitle: chosen.locationTitle || locationTitle || 'Business location',
        mapsUri: chosen.mapsUri || mapsUri,
        refreshTokenEnc: encryptSecret(refreshToken),
        tokenUpdatedAt: new Date().toISOString(),
        featuredReviewIds: [],
        reviewsCache: [],
      })

      try {
        profile = await syncReviewsIntoProfile(profile)
      } catch (e) {
        console.warn('Initial review sync failed', e.message)
      }

      await saveGbpProfileForScope({ scope, teamId, uid: user.uid, profile })
      await clearPendingGbp(user.uid)
      return res.status(200).json({ connection: toPublicGoogleBusinessProfile(profile) })
    }

    if (action === 'sync-reviews') {
      const { profile } = await loadGbpProfileForScope({ scope, teamId, uid: user.uid })
      if (!profile.connected) {
        return res.status(400).json({ error: 'Google Business Profile is not connected' })
      }
      const synced = await syncReviewsIntoProfile(profile)
      await saveGbpProfileForScope({ scope, teamId, uid: user.uid, profile: synced })
      return res.status(200).json({ connection: toPublicGoogleBusinessProfile(synced) })
    }

    if (action === 'set-featured') {
      const { profile } = await loadGbpProfileForScope({ scope, teamId, uid: user.uid })
      if (!profile.connected) {
        return res.status(400).json({ error: 'Google Business Profile is not connected' })
      }
      const featuredReviewIds = normalizeFeaturedReviewIds(body.featuredReviewIds, profile.reviewsCache)
      const next = normalizeGoogleBusinessProfile({ ...profile, featuredReviewIds })
      await saveGbpProfileForScope({ scope, teamId, uid: user.uid, profile: next })
      return res.status(200).json({ connection: toPublicGoogleBusinessProfile(next) })
    }

    if (action === 'disconnect') {
      const { profile } = await loadGbpProfileForScope({ scope, teamId, uid: user.uid })
      const refreshToken = decryptSecret(profile.refreshTokenEnc)
      if (refreshToken) await revokeGoogleToken(refreshToken)
      await clearPendingGbp(user.uid)
      const cleared = emptyGoogleBusinessProfile()
      await saveGbpProfileForScope({ scope, teamId, uid: user.uid, profile: cleared })
      return res.status(200).json({ connection: toPublicGoogleBusinessProfile(cleared) })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })
  } catch (err) {
    console.error('google-business error', err)
    const status = err.status && Number.isFinite(err.status) ? err.status : 500
    return res.status(status).json({ error: err.message || 'Google Business Profile error' })
  }
}
