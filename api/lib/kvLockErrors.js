/**
 * Thrown when a distributed KV lock cannot be acquired in time.
 * Callers should map this to 503 + Retry-After (never perform unlocked writes).
 */

export class KvLockUnavailableError extends Error {
  constructor(lockKey, { retryAfterSec = 2 } = {}) {
    super(`KV lock unavailable: ${lockKey}`)
    this.name = 'KvLockUnavailableError'
    this.lockKey = lockKey
    this.statusCode = 503
    this.retryAfterSec = retryAfterSec
  }
}

export function isKvLockUnavailable(err) {
  return err?.name === 'KvLockUnavailableError'
}

export function respondKvLockUnavailable(res, err) {
  const retry = err?.retryAfterSec ?? 2
  res.setHeader('Retry-After', String(retry))
  return res.status(503).json({ error: 'Resource busy, retry shortly', code: 'lock_unavailable' })
}
