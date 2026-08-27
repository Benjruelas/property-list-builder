/**
 * Helpers for iOS Home Screen → Safari Google OAuth handoff.
 * Session lives in KV so Safari and the PWA can share a one-time custom token.
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { kv, kvAvailable } from './kvBootstrap.js'
import { getAppOrigin } from './firebaseAdmin.js'

export const HANDOFF_TTL_SEC = 5 * 60
export const MAX_AUTH_AGE_SEC = 5 * 60
export const GOOGLE_OAUTH_SCOPES = 'openid email profile'

function isNativeRedis(client) {
  return client && typeof client.connect === 'function' && typeof client.hIncrBy === 'function'
}

export function handoffKvKey(handoffId) {
  return `auth:google-handoff:${handoffId}`
}

export function hashPollToken(pollToken) {
  return createHash('sha256').update(String(pollToken || '')).digest('hex')
}

export function createHandoffSecrets() {
  const handoffId = randomBytes(16).toString('hex')
  const pollToken = randomBytes(24).toString('base64url')
  return { handoffId, pollToken, pollTokenHash: hashPollToken(pollToken) }
}

/** PKCE S256 challenge pair for public OAuth clients. */
export function createPkcePair() {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export function safeEqualHex(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8')
  const right = Buffer.from(String(b || ''), 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export async function kvSetJsonEx(key, value, exSec) {
  if (!kvAvailable || !kv) return false
  const payload = typeof value === 'string' ? value : JSON.stringify(value)
  try {
    if (isNativeRedis(kv)) {
      await kv.set(key, payload, { EX: exSec })
    } else {
      await kv.set(key, payload, { ex: exSec })
    }
    return true
  } catch (err) {
    console.error('[googleHandoff] kv set failed', err?.message || err)
    return false
  }
}

export async function kvGetJson(key) {
  if (!kvAvailable || !kv) return null
  try {
    const raw = await kv.get(key)
    if (raw == null) return null
    if (typeof raw === 'object') return raw
    return JSON.parse(String(raw))
  } catch {
    return null
  }
}

export async function kvDelKey(key) {
  if (!kvAvailable || !kv) return
  try {
    await kv.del(key)
  } catch {
    /* ignore */
  }
}

export function storageAvailable() {
  return Boolean(kvAvailable && kv)
}

export function googleOAuthRedirectUri(origin = getAppOrigin()) {
  return `${String(origin).replace(/\/$/, '')}/api/auth-google-oauth-callback`
}

let cachedClientId = null

/** Web OAuth client ID used for Home Screen Google handoff (PKCE). */
export async function resolveGoogleOAuthWebClientId() {
  if (cachedClientId) return cachedClientId
  const fromEnv = (
    process.env.GOOGLE_OAUTH_WEB_CLIENT_ID
    || process.env.VITE_GOOGLE_OAUTH_WEB_CLIENT_ID
    || ''
  ).trim()
  if (fromEnv) {
    cachedClientId = fromEnv
    return cachedClientId
  }

  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY
  if (!apiKey) return ''
  try {
    const res = await fetch(
      `https://www.googleapis.com/identitytoolkit/v3/relyingparty/getProjectConfig?key=${encodeURIComponent(apiKey)}`,
    )
    const data = await res.json().catch(() => ({}))
    if (data?.clientId) {
      cachedClientId = String(data.clientId).trim()
      return cachedClientId
    }
    if (Array.isArray(data?.idpConfig)) {
      const google = data.idpConfig.find((x) => x?.provider === 'google.com' || x?.clientId)
      if (google?.clientId) {
        cachedClientId = String(google.clientId).trim()
        return cachedClientId
      }
    }
  } catch (err) {
    console.warn('[googleHandoff] getProjectConfig failed', err?.message || err)
  }
  return ''
}

export function buildGooglePkceAuthUrl({
  clientId,
  redirectUri,
  state,
  codeChallenge,
}) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_OAUTH_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
    include_granted_scopes: 'true',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function exchangeGoogleAuthCode({ code, redirectUri, codeVerifier }) {
  const clientId = await resolveGoogleOAuthWebClientId()
  const clientSecret = (
    process.env.GOOGLE_OAUTH_WEB_CLIENT_SECRET
    || process.env.GOOGLE_CLIENT_SECRET
    || ''
  ).trim()

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  })
  if (clientSecret) body.set('client_secret', clientSecret)

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error_description || data.error || 'Google token exchange failed')
    err.code = data.error || 'token_exchange_failed'
    throw err
  }
  return data
}

/** Verify Google ID token and return profile claims. */
export async function verifyGoogleIdTokenClaims(idToken, audience) {
  const { createRemoteJWKSet, jwtVerify } = await import('jose')
  const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience,
  })
  return {
    sub: String(payload.sub || ''),
    email: String(payload.email || '').toLowerCase() || null,
    emailVerified: Boolean(payload.email_verified),
    name: String(payload.name || '') || null,
    picture: String(payload.picture || '') || null,
  }
}

/**
 * Ensure a Firebase user exists for this Google account and return a custom token.
 */
export async function mintFirebaseCustomTokenForGoogleProfile(profile) {
  const { getFirebaseAdminAuth } = await import('./firebaseAdmin.js')
  const adminAuth = await getFirebaseAdminAuth()
  const googleUid = profile.sub
  if (!googleUid) throw new Error('Missing Google subject')

  let user
  try {
    user = await adminAuth.getUserByProviderUid('google.com', googleUid)
  } catch {
    user = null
  }

  if (!user && profile.email) {
    try {
      user = await adminAuth.getUserByEmail(profile.email)
    } catch {
      user = null
    }
  }

  if (!user) {
    user = await adminAuth.createUser({
      email: profile.email || undefined,
      emailVerified: Boolean(profile.emailVerified),
      displayName: profile.name || undefined,
      photoURL: profile.picture || undefined,
    })
  }

  // Best-effort provider link so the account shows Google in Firebase console.
  try {
    const alreadyLinked = (user.providerData || []).some(
      (p) => p.providerId === 'google.com' && p.uid === googleUid,
    )
    if (!alreadyLinked) {
      await adminAuth.updateUser(user.uid, {
        emailVerified: user.emailVerified || profile.emailVerified,
        displayName: user.displayName || profile.name || undefined,
        photoURL: user.photoURL || profile.picture || undefined,
        providerToLink: {
          providerId: 'google.com',
          uid: googleUid,
          displayName: profile.name || undefined,
          email: profile.email || undefined,
          photoURL: profile.picture || undefined,
        },
      })
    }
  } catch {
    /* ignore link failures — custom token sign-in still works */
  }

  const customToken = await adminAuth.createCustomToken(user.uid)
  return { uid: user.uid, customToken }
}
