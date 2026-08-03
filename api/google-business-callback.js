/**
 * OAuth callback for Google Business Profile.
 * Exchanges code, lists locations, auto-selects if one, else stores pending selection.
 * Redirects back to the app with ?gbp=ok|select|error.
 */

import {
  gbpConfigured,
  resolveRedirectUri,
  resolveAppOrigin,
  parseOAuthState,
  exchangeCodeForTokens,
  listAllLocationsForToken,
  savePendingGbp,
  clearPendingGbp,
  encryptSecret,
  normalizeGoogleBusinessProfile,
  syncReviewsIntoProfile,
  saveGbpProfileForScope,
  toPublicGoogleBusinessProfile,
} from './_lib/googleBusinessProfile.js'
import { getAllTeams, loadTeamsForUser } from './_lib/teams.js'
import { isTeamAdmin } from './_lib/access.js'

function redirect(res, origin, params) {
  const url = new URL('/', origin)
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v))
  }
  res.statusCode = 302
  res.setHeader('Location', url.toString())
  res.end()
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const origin = resolveAppOrigin(req)

  try {
    if (!gbpConfigured()) {
      return redirect(res, origin, { gbp: 'error', gbp_msg: 'not_configured' })
    }

    const q = req.query || {}
    if (q.error) {
      return redirect(res, origin, { gbp: 'error', gbp_msg: String(q.error) })
    }

    const code = String(q.code || '').trim()
    const stateRaw = String(q.state || '').trim()
    if (!code || !stateRaw) {
      return redirect(res, origin, { gbp: 'error', gbp_msg: 'missing_code' })
    }

    const state = parseOAuthState(stateRaw)
    if (!state) {
      return redirect(res, origin, { gbp: 'error', gbp_msg: 'invalid_state' })
    }

    const { uid, scope, teamId } = state

    if (scope === 'user') {
      const all = await getAllTeams()
      if (loadTeamsForUser(all, uid)[0]) {
        return redirect(res, origin, { gbp: 'error', gbp_msg: 'team_member' })
      }
    } else if (scope === 'team') {
      const all = await getAllTeams()
      const team = all.find((t) => t.id === teamId)
      if (!team || !isTeamAdmin(team, uid)) {
        return redirect(res, origin, { gbp: 'error', gbp_msg: 'forbidden' })
      }
    } else {
      return redirect(res, origin, { gbp: 'error', gbp_msg: 'invalid_scope' })
    }

    const redirectUri = resolveRedirectUri(req)
    const tokens = await exchangeCodeForTokens(code, redirectUri)
    const refreshToken = tokens.refresh_token
    if (!refreshToken) {
      return redirect(res, origin, { gbp: 'error', gbp_msg: 'no_refresh_token' })
    }

    const accessToken = tokens.access_token
    let locations = []
    try {
      locations = await listAllLocationsForToken(accessToken)
    } catch (e) {
      console.warn('listAllLocationsForToken failed', e.message)
      return redirect(res, origin, { gbp: 'error', gbp_msg: 'list_locations_failed' })
    }

    if (locations.length === 0) {
      return redirect(res, origin, { gbp: 'error', gbp_msg: 'no_locations' })
    }

    if (locations.length === 1) {
      const loc = locations[0]
      let profile = normalizeGoogleBusinessProfile({
        connected: true,
        accountName: loc.accountName,
        locationName: loc.locationName,
        locationTitle: loc.locationTitle,
        mapsUri: loc.mapsUri,
        refreshTokenEnc: encryptSecret(refreshToken),
        tokenUpdatedAt: new Date().toISOString(),
        featuredReviewIds: [],
        reviewsCache: [],
      })
      try {
        profile = await syncReviewsIntoProfile(profile)
      } catch (e) {
        console.warn('callback review sync failed', e.message)
      }
      await saveGbpProfileForScope({ scope, teamId, uid, profile })
      await clearPendingGbp(uid)
      void toPublicGoogleBusinessProfile(profile)
      return redirect(res, origin, {
        gbp: 'ok',
        gbp_scope: scope,
        ...(teamId ? { gbp_team: teamId } : {}),
      })
    }

    await savePendingGbp(uid, {
      scope,
      teamId: teamId || null,
      refreshTokenEnc: encryptSecret(refreshToken),
      locations,
    })

    return redirect(res, origin, {
      gbp: 'select',
      gbp_scope: scope,
      ...(teamId ? { gbp_team: teamId } : {}),
    })
  } catch (err) {
    console.error('google-business-callback error', err)
    return redirect(res, origin, { gbp: 'error', gbp_msg: 'callback_failed' })
  }
}
