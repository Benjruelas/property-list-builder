/**
 * Helpers for iOS Home Screen → Safari Google OAuth handoff.
 * Session lives in KV so Safari and the PWA can share a one-time custom token.
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { kv, kvAvailable } from './kvBootstrap.js'

export const HANDOFF_TTL_SEC = 5 * 60
export const MAX_AUTH_AGE_SEC = 5 * 60

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
