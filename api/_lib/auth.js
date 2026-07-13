/**
 * Shared Firebase auth for API routes.
 * Supports dev-bypass, optional local JWT verify + LRU cache, REST fallback.
 */

import { createHash } from 'crypto'
import { resolveDevBypassUser, isDevBypassAllowed } from './devBypassUsers.js'
import { flags } from './flags.js'

const tokenCache = new Map()
const MAX_CACHE = 500
const MAX_CACHE_TTL_MS = 5 * 60 * 1000

let jwks = null

function firebaseProjectId() {
  return process.env.FIREBASE_PROJECT_ID
    || process.env.VITE_FIREBASE_PROJECT_ID
    || process.env.GCLOUD_PROJECT
    || ''
}

async function getJwks() {
  if (!jwks) {
    const projectId = firebaseProjectId()
    if (!projectId) return null
    const { createRemoteJWKSet } = await import('jose')
    jwks = createRemoteJWKSet(
      new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
    )
  }
  return jwks
}

function cacheKey(token) {
  return createHash('sha256').update(token).digest('hex')
}

function readCache(key) {
  const hit = tokenCache.get(key)
  if (!hit) return null
  if (hit.expiresAt <= Date.now()) {
    tokenCache.delete(key)
    return null
  }
  return hit.user
}

function writeCache(key, user, expSec) {
  if (tokenCache.size >= MAX_CACHE) {
    const first = tokenCache.keys().next().value
    if (first) tokenCache.delete(first)
  }
  const expMs = expSec ? expSec * 1000 : Date.now() + MAX_CACHE_TTL_MS
  tokenCache.set(key, {
    user,
    expiresAt: Math.min(expMs, Date.now() + MAX_CACHE_TTL_MS),
  })
}

export async function verifyFirebaseTokenRest(idToken) {
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY
  if (!apiKey || !idToken) return null
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    )
    if (!r.ok) return null
    const data = await r.json()
    const user = data.users && data.users[0]
    if (!user) return null
    return { uid: user.localId, email: (user.email || '').toLowerCase() }
  } catch (e) {
    console.error('Token verify REST error', e.message)
    return null
  }
}

export async function verifyFirebaseTokenLocal(idToken) {
  const projectId = firebaseProjectId()
  const keys = await getJwks()
  if (!projectId || !keys || !idToken) return null
  try {
    const { jwtVerify } = await import('jose')
    const { payload } = await jwtVerify(idToken, keys, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    })
    const uid = payload.sub
    if (!uid) return null
    const email = String(payload.email || '').toLowerCase()
    return { uid, email: email || null, exp: payload.exp }
  } catch (e) {
    console.warn('Token verify local failed', e.message)
    return null
  }
}

async function verifyToken(idToken) {
  if (!idToken) return null

  const useCache = flags.AUTH_CACHE() || flags.AUTH_CACHE_SHADOW()
  const key = useCache ? cacheKey(idToken) : null
  if (key) {
    const cached = readCache(key)
    if (cached) return cached
  }

  let localUser = null
  if (flags.AUTH_CACHE() || flags.AUTH_CACHE_SHADOW()) {
    localUser = await verifyFirebaseTokenLocal(idToken)
  }

  if (flags.AUTH_CACHE_SHADOW() && localUser) {
    const restUser = await verifyFirebaseTokenRest(idToken)
    if (restUser && (restUser.uid !== localUser.uid || (restUser.email || '') !== (localUser.email || ''))) {
      console.warn(JSON.stringify({
        type: 'auth_shadow_mismatch',
        localUid: localUser.uid,
        restUid: restUser?.uid,
      }))
    }
  }

  if (flags.AUTH_CACHE() && localUser) {
    writeCache(key, { uid: localUser.uid, email: localUser.email }, localUser.exp)
    return { uid: localUser.uid, email: localUser.email }
  }

  const restUser = await verifyFirebaseTokenRest(idToken)
  if (restUser && useCache && key) writeCache(key, restUser, null)
  return restUser
}

/**
 * Authenticate a Vercel API request. Returns { user, allowDevBypass } or { user: null }.
 */
export async function authenticate(req) {
  const authHeader = req.headers.authorization
  const idToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  const allowDevBypass = isDevBypassAllowed(req)
  let user = allowDevBypass ? resolveDevBypassUser(idToken) : null
  if (!user) user = await verifyToken(idToken)
  return { user, allowDevBypass, idToken }
}

export default authenticate
