/**
 * Lightweight fixed-window rate limiter backed by KV/Redis, with an
 * in-memory fallback so it still throttles when KV is unavailable.
 *
 * Usage:
 *   const rl = await rateLimit({ key: `skiptrace:${uid}`, limit: 200, windowSec: 86400 })
 *   if (!rl.allowed) return res.status(429).json({ error: 'Rate limit exceeded', retryAfter: rl.retryAfter })
 */
import { kv, kvAvailable } from './kvBootstrap.js'

const memory = new Map()

function memoryLimit(key, limit, windowSec, increment = 1) {
  const now = Date.now()
  const windowMs = windowSec * 1000
  const entry = memory.get(key)
  if (!entry || entry.reset <= now) {
    const allowed = increment <= limit
    memory.set(key, { count: increment, reset: now + windowMs })
    return {
      allowed,
      remaining: Math.max(0, limit - increment),
      retryAfter: allowed ? 0 : Math.ceil(windowMs / 1000),
    }
  }
  entry.count += increment
  const allowed = entry.count <= limit
  return {
    allowed,
    remaining: Math.max(0, limit - entry.count),
    retryAfter: allowed ? 0 : Math.ceil((entry.reset - now) / 1000),
  }
}

async function kvIncrement(key, increment) {
  if (increment <= 0) return 0
  if (typeof kv.incrBy === 'function') return kv.incrBy(key, increment)
  if (typeof kv.incrby === 'function') return kv.incrby(key, increment)
  let count = 0
  for (let i = 0; i < increment; i += 1) {
    count = await kv.incr(key)
  }
  return count
}

export async function rateLimit({ key, limit, windowSec, increment = 1 }) {
  const bucketKey = `ratelimit:${key}`
  const delta = Number.isFinite(increment) && increment > 0 ? Math.floor(increment) : 1
  if (!kvAvailable || !kv) {
    return memoryLimit(bucketKey, limit, windowSec, delta)
  }
  try {
    const count = await kvIncrement(bucketKey, delta)
    if (count === delta) {
      // First hit in this window: set expiry.
      if (typeof kv.expire === 'function') {
        await kv.expire(bucketKey, windowSec)
      }
    }
    const allowed = count <= limit
    let retryAfter = 0
    if (!allowed && typeof kv.ttl === 'function') {
      const ttl = await kv.ttl(bucketKey)
      retryAfter = ttl > 0 ? ttl : windowSec
    }
    return { allowed, remaining: Math.max(0, limit - count), retryAfter }
  } catch (e) {
    console.warn('[rateLimit] KV error, falling back to memory:', e?.message || e)
    return memoryLimit(bucketKey, limit, windowSec, delta)
  }
}

/** Best-effort client IP for anonymous-endpoint throttling. */
export function clientIp(req) {
  const xff = req.headers['x-forwarded-for']
  if (xff) return String(xff).split(',')[0].trim()
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown'
}

/**
 * Enforce a per-IP rate limit for public/expensive endpoints. Returns true if
 * the request was rate-limited (a 429 has already been sent) so callers can
 * simply `if (await enforceIpRateLimit(...)) return`.
 */
export async function enforceIpRateLimit(req, res, { name, limit, windowSec }) {
  const ip = clientIp(req)
  const rl = await rateLimit({ key: `ip:${name}:${ip}`, limit, windowSec })
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter))
    res.status(429).json({ error: 'Rate limit exceeded. Please slow down.', retryAfter: rl.retryAfter })
    return true
  }
  return false
}

export default rateLimit
