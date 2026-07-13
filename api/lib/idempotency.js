/**
 * Idempotency helpers for side-effecting operations (webhooks, email, PDF).
 */

import { kv, kvAvailable } from './kvBootstrap.js'

const PREFIX = 'idempotency:'

export async function claimIdempotencyKey(key, { ttlSec = 86400 } = {}) {
  if (!key) return true
  if (!kvAvailable || !kv) return true
  const full = `${PREFIX}${key}`
  try {
    if (typeof kv.set === 'function') {
      const opts = ttlSec ? { nx: true, ex: ttlSec } : { nx: true }
      const ok = await kv.set(full, '1', opts)
      return ok === 'OK' || ok === true
    }
  } catch {
    return true
  }
  return true
}

export async function claimStripeEvent(eventId) {
  return claimIdempotencyKey(`stripe:${eventId}`, { ttlSec: 7 * 86400 })
}
