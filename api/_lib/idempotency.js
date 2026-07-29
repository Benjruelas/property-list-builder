/**
 * Idempotency helpers for side-effecting operations (webhooks, email, PDF, offline outbox).
 */

import { kv, kvAvailable } from './kvBootstrap.js'

const PREFIX = 'idempotency:'
const RESPONSE_PREFIX = 'idempotency-res:'

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

function responseKey(key) {
  return `${RESPONSE_PREFIX}${key}`
}

export async function getIdempotentResponse(key) {
  if (!key || !kvAvailable || !kv) return null
  try {
    const raw = await kv.get(responseKey(key))
    if (!raw) return null
    if (typeof raw === 'string') return JSON.parse(raw)
    return raw
  } catch {
    return null
  }
}

export async function storeIdempotentResponse(key, status, body, { ttlSec = 86400 } = {}) {
  if (!key || !kvAvailable || !kv) return
  try {
    const payload = JSON.stringify({ status, body })
    if (ttlSec) {
      await kv.set(responseKey(key), payload, { ex: ttlSec })
    } else {
      await kv.set(responseKey(key), payload)
    }
  } catch (e) {
    console.warn('[idempotency] store response failed', e?.message || e)
  }
}

/**
 * Read Idempotency-Key from request headers (case-insensitive).
 */
export function readIdempotencyKey(req) {
  const headers = req?.headers || {}
  const raw =
    headers['idempotency-key']
    || headers['Idempotency-Key']
    || headers['IDEMPOTENCY-KEY']
  if (!raw) return null
  const key = String(Array.isArray(raw) ? raw[0] : raw).trim().slice(0, 200)
  return key || null
}

/**
 * Begin an idempotent mutation. Call before side effects.
 * If `{ replay: true }`, the response was already written — return immediately.
 *
 * @returns {Promise<{ key: string|null, replay: boolean }>}
 */
export async function beginIdempotent(req, res, scope) {
  const clientKey = readIdempotencyKey(req)
  if (!clientKey) return { key: null, replay: false }

  const scopedKey = `${scope}:${clientKey}`
  const cached = await getIdempotentResponse(scopedKey)
  if (cached && typeof cached.status === 'number') {
    res.status(cached.status).json(cached.body)
    return { key: scopedKey, replay: true }
  }

  const claimed = await claimIdempotencyKey(scopedKey, { ttlSec: 86400 })
  if (!claimed) {
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 50 * (i + 1)))
      const again = await getIdempotentResponse(scopedKey)
      if (again && typeof again.status === 'number') {
        res.status(again.status).json(again.body)
        return { key: scopedKey, replay: true }
      }
    }
    res.status(409).json({ error: 'Idempotent request in progress. Retry shortly.' })
    return { key: scopedKey, replay: true }
  }

  return { key: scopedKey, replay: false }
}

/** Persist the successful response for later replays. */
export async function finishIdempotent(key, status, body) {
  if (!key) return
  await storeIdempotentResponse(key, status, body, { ttlSec: 86400 })
}

/**
 * Run a mutating handler exactly once per Idempotency-Key.
 * On replay, returns the stored JSON response.
 *
 * @param {object} req
 * @param {object} res
 * @param {string} scope - e.g. 'lists', 'leads', 'paths'
 * @param {() => Promise<{ status?: number, body: object }>} handler
 *   Handler must return { status, body } and NOT write to res itself.
 */
export async function withIdempotency(req, res, scope, handler) {
  const idem = await beginIdempotent(req, res, scope)
  if (idem.replay) return res

  const result = await handler()
  const status = result?.status || 200
  const body = result?.body ?? result
  await finishIdempotent(idem.key, status, body)
  return res.status(status).json(body)
}
