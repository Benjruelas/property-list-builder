/**
 * Google Business Profile API client.
 */

import { getApiBase } from './apiBase'

async function apiCall(getToken, { method = 'GET', body = null, query = '' } = {}) {
  const token = await getToken()
  if (!token) throw new Error('Sign in required')
  const opts = {
    method,
    headers: { Authorization: `Bearer ${token}` },
  }
  if (body) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(`${getApiBase()}/google-business${query}`, opts)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || data.message || `Request failed (${res.status})`)
    err.status = res.status
    throw err
  }
  return data
}

export async function fetchGoogleBusinessStatus(getToken, { scope = 'user', teamId = null } = {}) {
  const params = new URLSearchParams({ scope })
  if (teamId) params.set('teamId', teamId)
  return apiCall(getToken, { method: 'GET', query: `?${params.toString()}` })
}

export async function startGoogleBusinessConnect(getToken, { scope = 'user', teamId = null } = {}) {
  return apiCall(getToken, {
    method: 'POST',
    body: { action: 'connect', scope, teamId },
  })
}

export async function selectGoogleBusinessLocation(
  getToken,
  { scope = 'user', teamId = null, accountName, locationName, locationTitle, mapsUri } = {},
) {
  return apiCall(getToken, {
    method: 'POST',
    body: {
      action: 'select-location',
      scope,
      teamId,
      accountName,
      locationName,
      locationTitle,
      mapsUri,
    },
  })
}

export async function syncGoogleBusinessReviews(getToken, { scope = 'user', teamId = null } = {}) {
  return apiCall(getToken, {
    method: 'POST',
    body: { action: 'sync-reviews', scope, teamId },
  })
}

export async function setGoogleBusinessFeatured(
  getToken,
  { scope = 'user', teamId = null, featuredReviewIds = [] } = {},
) {
  return apiCall(getToken, {
    method: 'POST',
    body: { action: 'set-featured', scope, teamId, featuredReviewIds },
  })
}

export async function disconnectGoogleBusiness(getToken, { scope = 'user', teamId = null } = {}) {
  return apiCall(getToken, {
    method: 'POST',
    body: { action: 'disconnect', scope, teamId },
  })
}

/** Read and clear gbp=* query params from the current URL. */
export function consumeGbpQueryParams() {
  if (typeof window === 'undefined') return null
  const url = new URL(window.location.href)
  const gbp = url.searchParams.get('gbp')
  if (!gbp) return null
  const result = {
    gbp,
    scope: url.searchParams.get('gbp_scope') || null,
    teamId: url.searchParams.get('gbp_team') || null,
    message: url.searchParams.get('gbp_msg') || null,
  }
  ;['gbp', 'gbp_scope', 'gbp_team', 'gbp_msg'].forEach((k) => url.searchParams.delete(k))
  const next = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState({}, '', next)
  return result
}
