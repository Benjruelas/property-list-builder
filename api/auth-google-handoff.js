/**
 * Google OAuth handoff for iOS Home Screen PWAs.
 *
 * POST { action: 'start' } → { handoffId, pollToken, authUrl }
 * POST { action: 'complete', handoffId, idToken } → { ok: true } (legacy bridge)
 * GET  ?handoffId=&pollToken= → { status, customToken? } (token redeemed once)
 *
 * Home Screen opens authUrl (accounts.google.com). Google returns to
 * /api/auth-google-oauth-callback which mints the custom token into KV.
 */

import { applyCors } from './_lib/cors.js'
import { rateLimit, clientIp } from './_lib/rateLimit.js'
import { getFirebaseAdminAuth } from './_lib/firebaseAdmin.js'
import { verifyFirebaseTokenLocal, verifyFirebaseTokenRest } from './_lib/auth.js'
import {
  HANDOFF_TTL_SEC,
  MAX_AUTH_AGE_SEC,
  createHandoffSecrets,
  createPkcePair,
  buildGooglePkceAuthUrl,
  googleOAuthRedirectUri,
  resolveGoogleOAuthWebClientId,
  resolveGoogleOAuthWebClientSecret,
  handoffKvKey,
  hashPollToken,
  kvDelKey,
  kvGetJson,
  kvSetJsonEx,
  safeEqualHex,
  storageAvailable,
} from './_lib/googleHandoff.js'

async function verifyGoogleIdToken(idToken) {
  const local = await verifyFirebaseTokenLocal(idToken)
  if (local?.uid) {
    // Need auth_time / provider — decode via jose when local verify succeeded.
    try {
      const { createRemoteJWKSet, jwtVerify } = await import('jose')
      const projectId =
        process.env.FIREBASE_PROJECT_ID
        || process.env.VITE_FIREBASE_PROJECT_ID
        || process.env.GCLOUD_PROJECT
        || ''
      const jwks = createRemoteJWKSet(
        new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
      )
      const { payload } = await jwtVerify(idToken, jwks, {
        issuer: `https://securetoken.google.com/${projectId}`,
        audience: projectId,
      })
      return {
        uid: payload.sub,
        email: String(payload.email || '').toLowerCase() || null,
        authTime: Number(payload.auth_time) || 0,
        provider: payload.firebase?.sign_in_provider || '',
      }
    } catch (err) {
      console.warn('[auth-google-handoff] jose claims failed', err?.message || err)
    }
  }

  const rest = await verifyFirebaseTokenRest(idToken)
  if (!rest?.uid) return null
  // REST lookup lacks auth_time; accept but require recent client call + rate limits.
  return {
    uid: rest.uid,
    email: rest.email || null,
    authTime: Math.floor(Date.now() / 1000),
    provider: 'google.com',
  }
}

async function handleStart(req, res) {
  const ip = clientIp(req)
  const rl = await rateLimit({ key: `google-handoff:start:${ip}`, limit: 30, windowSec: 3600 })
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter || 60))
    return res.status(429).json({ error: 'Too many sign-in attempts. Try again later.' })
  }

  if (!storageAvailable()) {
    return res.status(503).json({ error: 'Sign-in handoff temporarily unavailable.' })
  }

  const clientId = await resolveGoogleOAuthWebClientId()
  if (!clientId) {
    return res.status(503).json({
      error: 'Google sign-in is not configured. Set GOOGLE_OAUTH_WEB_CLIENT_ID.',
    })
  }
  if (!resolveGoogleOAuthWebClientSecret()) {
    return res.status(503).json({
      error: 'Google sign-in is not configured. Set GOOGLE_OAUTH_WEB_CLIENT_SECRET.',
    })
  }

  const { handoffId, pollToken, pollTokenHash } = createHandoffSecrets()
  const { verifier, challenge } = createPkcePair()
  const redirectUri = googleOAuthRedirectUri()
  const authUrl = buildGooglePkceAuthUrl({
    clientId,
    redirectUri,
    state: handoffId,
    codeChallenge: challenge,
  })

  const ok = await kvSetJsonEx(
    handoffKvKey(handoffId),
    {
      status: 'pending',
      pollTokenHash,
      pkceVerifier: verifier,
      createdAt: Date.now(),
    },
    HANDOFF_TTL_SEC,
  )
  if (!ok) {
    return res.status(503).json({ error: 'Sign-in handoff temporarily unavailable.' })
  }

  return res.status(200).json({
    handoffId,
    pollToken,
    authUrl,
    expiresInSec: HANDOFF_TTL_SEC,
  })
}

async function handleComplete(req, res) {
  const ip = clientIp(req)
  const rl = await rateLimit({ key: `google-handoff:complete:${ip}`, limit: 40, windowSec: 3600 })
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter || 60))
    return res.status(429).json({ error: 'Too many requests. Try again later.' })
  }

  const handoffId = String(req.body?.handoffId || '').trim()
  const idToken = String(req.body?.idToken || '').trim()
  if (!handoffId || !idToken) {
    return res.status(400).json({ error: 'handoffId and idToken are required.' })
  }

  if (!storageAvailable()) {
    return res.status(503).json({ error: 'Sign-in handoff temporarily unavailable.' })
  }

  const key = handoffKvKey(handoffId)
  const session = await kvGetJson(key)
  if (!session || session.status !== 'pending') {
    return res.status(410).json({ error: 'This sign-in session expired. Try again from the Home Screen app.' })
  }

  const verified = await verifyGoogleIdToken(idToken)
  if (!verified?.uid) {
    return res.status(401).json({ error: 'Invalid Google sign-in token.' })
  }
  if (verified.provider && verified.provider !== 'google.com') {
    return res.status(400).json({ error: 'Google sign-in required.' })
  }
  const nowSec = Math.floor(Date.now() / 1000)
  if (verified.authTime && nowSec - verified.authTime > MAX_AUTH_AGE_SEC) {
    return res.status(401).json({ error: 'Google sign-in expired. Try again.' })
  }

  let customToken
  try {
    const adminAuth = await getFirebaseAdminAuth()
    customToken = await adminAuth.createCustomToken(verified.uid)
  } catch (err) {
    console.error('[auth-google-handoff] createCustomToken failed', err?.message || err)
    return res.status(503).json({ error: 'Unable to finish Google sign-in. Try again.' })
  }

  const saved = await kvSetJsonEx(
    key,
    {
      status: 'ready',
      pollTokenHash: session.pollTokenHash,
      customToken,
      uid: verified.uid,
      createdAt: session.createdAt,
      completedAt: Date.now(),
    },
    HANDOFF_TTL_SEC,
  )
  if (!saved) {
    return res.status(503).json({ error: 'Sign-in handoff temporarily unavailable.' })
  }

  return res.status(200).json({ ok: true })
}

async function handleStatus(req, res) {
  const handoffId = String(req.query?.handoffId || '').trim()
  const pollToken = String(req.query?.pollToken || '').trim()
  if (!handoffId || !pollToken) {
    return res.status(400).json({ error: 'handoffId and pollToken are required.' })
  }

  if (!storageAvailable()) {
    return res.status(503).json({ error: 'Sign-in handoff temporarily unavailable.' })
  }

  const key = handoffKvKey(handoffId)
  const session = await kvGetJson(key)
  if (!session) {
    return res.status(200).json({ status: 'expired' })
  }

  if (!safeEqualHex(session.pollTokenHash, hashPollToken(pollToken))) {
    return res.status(403).json({ error: 'Invalid poll token.' })
  }

  if (session.status === 'pending') {
    return res.status(200).json({ status: 'pending' })
  }

  if (session.status === 'ready' && session.customToken) {
    const token = session.customToken
    await kvDelKey(key)
    return res.status(200).json({ status: 'ready', customToken: token })
  }

  return res.status(200).json({ status: 'expired' })
}

export default async function handler(req, res) {
  applyCors(req, res, { methods: 'GET, POST, OPTIONS' })

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    if (req.method === 'GET') {
      return await handleStatus(req, res)
    }

    if (req.method === 'POST') {
      const action = String(req.body?.action || '').trim()
      if (action === 'start') return await handleStart(req, res)
      if (action === 'complete') return await handleComplete(req, res)
      return res.status(400).json({ error: 'Unknown action. Use start or complete.' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[auth-google-handoff]', err)
    return res.status(500).json({ error: 'Google handoff failed.' })
  }
}
