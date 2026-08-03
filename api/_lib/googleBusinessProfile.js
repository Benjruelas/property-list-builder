/**
 * Google Business Profile — OAuth, token encryption, reviews sync, public payload.
 */

import crypto from 'node:crypto'
import { kv, kvAvailable } from './kvBootstrap.js'
import { getAllTeams, saveAllTeams, loadTeamsForUser } from './teams.js'

export const GBP_SCOPE = 'https://www.googleapis.com/auth/business.manage'
export const MAX_FEATURED_REVIEWS = 3
const STATE_TTL_MS = 15 * 60 * 1000
const PENDING_TTL_MS = 15 * 60 * 1000

const STAR_RATING_MAP = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
  STAR_RATING_UNSPECIFIED: 0,
}

function tokenSecret() {
  const configured = process.env.GOOGLE_GBP_TOKEN_SECRET || process.env.PREVIEW_LINK_SECRET
  if (configured && configured.length >= 16) return configured
  if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
    throw new Error('GOOGLE_GBP_TOKEN_SECRET must be set (>=16 chars) in production')
  }
  return configured || 'dev-google-gbp-token-secret'
}

function deriveKey() {
  return crypto.createHash('sha256').update(tokenSecret()).digest()
}

export function encryptSecret(plain) {
  const text = String(plain || '')
  if (!text) return ''
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv)
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${enc.toString('base64url')}`
}

export function decryptSecret(blob) {
  const raw = String(blob || '')
  if (!raw.startsWith('v1:')) return ''
  const parts = raw.split(':')
  if (parts.length !== 4) return ''
  const [, ivB64, tagB64, dataB64] = parts
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      deriveKey(),
      Buffer.from(ivB64, 'base64url'),
    )
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    return ''
  }
}

export function gbpConfigured() {
  return !!(
    process.env.GOOGLE_GBP_CLIENT_ID &&
    process.env.GOOGLE_GBP_CLIENT_SECRET &&
    (process.env.GOOGLE_GBP_REDIRECT_URI || process.env.APP_ORIGIN)
  )
}

export function resolveRedirectUri(req) {
  if (process.env.GOOGLE_GBP_REDIRECT_URI) return process.env.GOOGLE_GBP_REDIRECT_URI
  const origin = resolveAppOrigin(req)
  return `${origin}/api/google-business-callback`
}

export function resolveAppOrigin(req) {
  const configured = String(process.env.APP_ORIGIN || '').replace(/\/$/, '')
  if (configured) return configured
  const proto = req?.headers?.['x-forwarded-proto'] || 'https'
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host || ''
  if (host) return `${proto}://${host}`
  return 'http://localhost:3000'
}

export function starRatingToNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(5, Math.round(value)))
  }
  const key = String(value || '').toUpperCase()
  if (Object.prototype.hasOwnProperty.call(STAR_RATING_MAP, key)) return STAR_RATING_MAP[key]
  const n = Number(value)
  if (Number.isFinite(n)) return Math.max(0, Math.min(5, Math.round(n)))
  return 0
}

export function normalizeReview(raw) {
  if (!raw || typeof raw !== 'object') return null
  const name = String(raw.name || raw.reviewId || raw.id || '').trim()
  const id = name.includes('/') ? name.split('/').pop() : name
  if (!id) return null
  const reviewer = raw.reviewer || {}
  const reviewerName = String(
    reviewer.displayName || raw.reviewerName || 'Google user',
  ).trim().slice(0, 120) || 'Google user'
  return {
    id,
    name: name.includes('/') ? name : (raw.name || id),
    reviewerName,
    starRating: starRatingToNumber(raw.starRating),
    comment: String(raw.comment || '').trim().slice(0, 4000),
    createTime: String(raw.createTime || '').trim(),
    updateTime: String(raw.updateTime || '').trim(),
  }
}

export function normalizeFeaturedReviewIds(ids, reviewsCache = []) {
  const cacheIds = new Set((reviewsCache || []).map((r) => r.id).filter(Boolean))
  const out = []
  const seen = new Set()
  for (const raw of Array.isArray(ids) ? ids : []) {
    const id = String(raw || '').trim()
    if (!id || seen.has(id)) continue
    if (cacheIds.size > 0 && !cacheIds.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= MAX_FEATURED_REVIEWS) break
  }
  return out
}

export function emptyGoogleBusinessProfile() {
  return {
    connected: false,
    accountName: '',
    locationName: '',
    locationTitle: '',
    mapsUri: '',
    averageRating: 0,
    totalReviewCount: 0,
    refreshTokenEnc: '',
    tokenUpdatedAt: '',
    reviewsCache: [],
    featuredReviewIds: [],
    lastSyncedAt: '',
  }
}

export function normalizeGoogleBusinessProfile(input) {
  const base = emptyGoogleBusinessProfile()
  if (!input || typeof input !== 'object') return base
  const reviewsCache = (Array.isArray(input.reviewsCache) ? input.reviewsCache : [])
    .map(normalizeReview)
    .filter(Boolean)
  const featuredReviewIds = normalizeFeaturedReviewIds(input.featuredReviewIds, reviewsCache)
  return {
    connected: input.connected === true && !!String(input.locationName || '').trim(),
    accountName: String(input.accountName || '').trim().slice(0, 200),
    locationName: String(input.locationName || '').trim().slice(0, 300),
    locationTitle: String(input.locationTitle || '').trim().slice(0, 200),
    mapsUri: String(input.mapsUri || '').trim().slice(0, 500),
    averageRating: Number.isFinite(Number(input.averageRating))
      ? Math.max(0, Math.min(5, Number(input.averageRating)))
      : 0,
    totalReviewCount: Math.max(0, Math.floor(Number(input.totalReviewCount) || 0)),
    refreshTokenEnc: String(input.refreshTokenEnc || ''),
    tokenUpdatedAt: String(input.tokenUpdatedAt || ''),
    reviewsCache,
    featuredReviewIds,
    lastSyncedAt: String(input.lastSyncedAt || ''),
  }
}

/** Client-safe profile (no refresh token). */
export function toPublicGoogleBusinessProfile(profile) {
  const p = normalizeGoogleBusinessProfile(profile)
  return {
    connected: p.connected,
    accountName: p.accountName,
    locationName: p.locationName,
    locationTitle: p.locationTitle,
    mapsUri: p.mapsUri,
    averageRating: p.averageRating,
    totalReviewCount: p.totalReviewCount,
    reviews: p.reviewsCache,
    featuredReviewIds: p.featuredReviewIds,
    lastSyncedAt: p.lastSyncedAt,
  }
}

export function resolveFeaturedReviews(profile) {
  const p = normalizeGoogleBusinessProfile(profile)
  if (!p.connected) {
    return { averageRating: 0, totalReviewCount: 0, featuredReviews: [] }
  }
  const byId = new Map(p.reviewsCache.map((r) => [r.id, r]))
  const featuredReviews = p.featuredReviewIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .slice(0, MAX_FEATURED_REVIEWS)
  return {
    averageRating: p.averageRating,
    totalReviewCount: p.totalReviewCount,
    featuredReviews,
  }
}

export function signOAuthState(payload) {
  const body = {
    ...payload,
    exp: Date.now() + STATE_TTL_MS,
  }
  const json = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url')
  const sig = crypto.createHmac('sha256', tokenSecret()).update(json).digest('base64url')
  return `${json}.${sig}`
}

export function parseOAuthState(state) {
  const raw = String(state || '')
  const dot = raw.lastIndexOf('.')
  if (dot <= 0) return null
  const json = raw.slice(0, dot)
  const sig = raw.slice(dot + 1)
  const expected = crypto.createHmac('sha256', tokenSecret()).update(json).digest('base64url')
  if (sig !== expected) return null
  try {
    const body = JSON.parse(Buffer.from(json, 'base64url').toString('utf8'))
    if (!body || typeof body !== 'object') return null
    if (!body.exp || Date.now() > Number(body.exp)) return null
    if (!body.uid || (body.scope !== 'user' && body.scope !== 'team')) return null
    if (body.scope === 'team' && !body.teamId) return null
    return body
  } catch {
    return null
  }
}

function pendingKey(uid) {
  return `gbp_pending_${uid}`
}

export async function savePendingGbp(uid, data) {
  if (!kvAvailable || !kv || !uid) return
  const payload = { ...data, exp: Date.now() + PENDING_TTL_MS }
  await kv.set(pendingKey(uid), payload, { ex: Math.ceil(PENDING_TTL_MS / 1000) }).catch(async () => {
    await kv.set(pendingKey(uid), JSON.stringify(payload))
  })
}

export async function loadPendingGbp(uid) {
  if (!kvAvailable || !kv || !uid) return null
  try {
    const data = await kv.get(pendingKey(uid))
    const parsed = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    if (!parsed || typeof parsed !== 'object') return null
    if (parsed.exp && Date.now() > Number(parsed.exp)) {
      await clearPendingGbp(uid)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export async function clearPendingGbp(uid) {
  if (!kvAvailable || !kv || !uid) return
  try {
    await kv.del(pendingKey(uid))
  } catch {
    /* ignore */
  }
}

export function buildGoogleAuthUrl({ state, redirectUri }) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_GBP_CLIENT_ID || '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GBP_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function exchangeCodeForTokens(code, redirectUri) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_GBP_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_GBP_CLIENT_SECRET || '',
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error_description || data.error || 'Token exchange failed')
    err.status = 400
    throw err
  }
  return data
}

export async function refreshAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_GBP_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_GBP_CLIENT_SECRET || '',
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error_description || data.error || 'Token refresh failed')
    err.status = 401
    throw err
  }
  return data
}

export async function revokeGoogleToken(token) {
  if (!token) return
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
  } catch {
    /* ignore revoke failures */
  }
}

async function googleGet(url, accessToken) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error?.message || data.error_description || data.error || `Google API ${res.status}`)
    err.status = res.status
    throw err
  }
  return data
}

export async function listGbpAccounts(accessToken) {
  const data = await googleGet(
    'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
    accessToken,
  )
  return Array.isArray(data.accounts) ? data.accounts : []
}

export async function listGbpLocations(accessToken, accountName) {
  const parent = String(accountName || '').trim()
  if (!parent) return []
  const readMask = 'name,title,metadata'
  const url =
    `https://mybusinessbusinessinformation.googleapis.com/v1/${parent}/locations` +
    `?readMask=${encodeURIComponent(readMask)}&pageSize=100`
  const data = await googleGet(url, accessToken)
  return (Array.isArray(data.locations) ? data.locations : []).map((loc) => ({
    accountName: parent,
    locationName: String(loc.name || '').trim(),
    locationTitle: String(loc.title || loc.locationName || 'Business location').trim(),
    mapsUri: String(loc.metadata?.mapsUri || loc.metadata?.placeId || '').trim(),
  })).filter((l) => l.locationName)
}

/** Reviews API expects accounts/{aid}/locations/{lid} — Business Info returns accounts/{aid}/locations/{lid}. */
export function toReviewsParent(accountName, locationName) {
  const loc = String(locationName || '').trim()
  if (loc.startsWith('accounts/') && loc.includes('/locations/')) return loc
  const acct = String(accountName || '').trim()
  const locId = loc.includes('/') ? loc.split('/').pop() : loc
  const acctId = acct.includes('/') ? acct.split('/').pop() : acct
  if (!acctId || !locId) return ''
  return `accounts/${acctId}/locations/${locId}`
}

export async function fetchAllReviews(accessToken, reviewsParent) {
  const parent = String(reviewsParent || '').trim()
  if (!parent) {
    return { reviews: [], averageRating: 0, totalReviewCount: 0 }
  }
  const reviews = []
  let pageToken = ''
  let averageRating = 0
  let totalReviewCount = 0
  do {
    const params = new URLSearchParams({ pageSize: '50', orderBy: 'updateTime desc' })
    if (pageToken) params.set('pageToken', pageToken)
    const url = `https://mybusiness.googleapis.com/v4/${parent}/reviews?${params.toString()}`
    const data = await googleGet(url, accessToken)
    averageRating = Number(data.averageRating) || averageRating
    totalReviewCount = Number(data.totalReviewCount) || totalReviewCount
    for (const r of data.reviews || []) {
      const n = normalizeReview(r)
      if (n) reviews.push(n)
    }
    pageToken = data.nextPageToken || ''
  } while (pageToken && reviews.length < 500)
  return { reviews, averageRating, totalReviewCount }
}

export async function listAllLocationsForToken(accessToken) {
  const accounts = await listGbpAccounts(accessToken)
  const locations = []
  for (const account of accounts) {
    const name = String(account.name || '').trim()
    if (!name) continue
    try {
      const locs = await listGbpLocations(accessToken, name)
      locations.push(...locs)
    } catch (e) {
      console.warn('listGbpLocations failed', name, e.message)
    }
  }
  return locations
}

function userDataKey(uid) {
  return `user_data_${uid}`
}

export async function getUserDataBlob(uid) {
  if (!uid || !kvAvailable || !kv) return null
  try {
    const data = await kv.get(userDataKey(uid))
    if (!data) return null
    if (typeof data === 'string') return JSON.parse(data)
    return data
  } catch {
    return null
  }
}

export async function saveUserDataBlob(uid, data) {
  if (!uid || !kvAvailable || !kv) return
  await kv.set(userDataKey(uid), JSON.stringify(data))
}

export async function loadGbpProfileForScope({ scope, teamId, uid }) {
  if (scope === 'team') {
    const all = await getAllTeams()
    const team = all.find((t) => t.id === teamId)
    if (!team) return { profile: emptyGoogleBusinessProfile(), team: null, allTeams: all }
    return {
      profile: normalizeGoogleBusinessProfile(team.googleBusinessProfile),
      team,
      allTeams: all,
    }
  }
  const data = await getUserDataBlob(uid)
  return {
    profile: normalizeGoogleBusinessProfile(data?.googleBusinessProfile),
    userData: data || {},
  }
}

export async function saveGbpProfileForScope({ scope, teamId, uid, profile }) {
  const normalized = normalizeGoogleBusinessProfile(profile)
  if (scope === 'team') {
    const all = await getAllTeams()
    const idx = all.findIndex((t) => t.id === teamId)
    if (idx < 0) throw Object.assign(new Error('Team not found'), { status: 404 })
    all[idx] = {
      ...all[idx],
      googleBusinessProfile: normalized,
      updatedAt: new Date().toISOString(),
    }
    await saveAllTeams(all)
    return normalized
  }
  const existing = (await getUserDataBlob(uid)) || {}
  const next = {
    ...existing,
    googleBusinessProfile: normalized,
    __version: (Number(existing.__version) || 0) + 1,
  }
  await saveUserDataBlob(uid, next)
  return normalized
}

export async function clearPersonalGbpIfAny(uid) {
  const data = await getUserDataBlob(uid)
  if (!data?.googleBusinessProfile?.connected && !data?.googleBusinessProfile?.refreshTokenEnc) return
  const token = decryptSecret(data.googleBusinessProfile.refreshTokenEnc)
  if (token) await revokeGoogleToken(token)
  await saveUserDataBlob(uid, {
    ...data,
    googleBusinessProfile: emptyGoogleBusinessProfile(),
    __version: (Number(data.__version) || 0) + 1,
  })
}

export async function resolveGbpForBranding(user) {
  if (!user?.uid) {
    return { averageRating: 0, totalReviewCount: 0, featuredReviews: [] }
  }
  const allTeams = await getAllTeams()
  const userTeams = loadTeamsForUser(allTeams, user.uid)
  if (userTeams[0]) {
    return resolveFeaturedReviews(userTeams[0].googleBusinessProfile)
  }
  const data = await getUserDataBlob(user.uid)
  return resolveFeaturedReviews(data?.googleBusinessProfile)
}

export async function syncReviewsIntoProfile(profile) {
  const p = normalizeGoogleBusinessProfile(profile)
  const refreshToken = decryptSecret(p.refreshTokenEnc)
  if (!refreshToken) {
    throw Object.assign(new Error('Google Business Profile is not connected'), { status: 400 })
  }
  const tokens = await refreshAccessToken(refreshToken)
  const accessToken = tokens.access_token
  const parent = toReviewsParent(p.accountName, p.locationName)
  const { reviews, averageRating, totalReviewCount } = await fetchAllReviews(accessToken, parent)
  const featuredReviewIds = normalizeFeaturedReviewIds(p.featuredReviewIds, reviews)
  return normalizeGoogleBusinessProfile({
    ...p,
    connected: true,
    averageRating,
    totalReviewCount,
    reviewsCache: reviews,
    featuredReviewIds,
    lastSyncedAt: new Date().toISOString(),
    tokenUpdatedAt: p.tokenUpdatedAt || new Date().toISOString(),
  })
}
