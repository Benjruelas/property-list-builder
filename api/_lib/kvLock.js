/**
 * Short-lived distributed locks for atomic read-modify-write on monolithic KV keys.
 */

import { kvSetNxPx, kvDel, kvEval, kvAvailable } from './kvOps.js'

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Acquire lock, run fn, release. Returns null if lock could not be acquired
 * within maxWaitMs (caller should fall back to unlocked path).
 */
export async function withKvLock(lockKey, fn, { ttlMs = 5000, maxWaitMs = 2000 } = {}) {
  if (!kvAvailable) return null
  const token = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  const deadline = Date.now() + maxWaitMs
  let acquired = false
  while (Date.now() < deadline) {
    acquired = await kvSetNxPx(lockKey, token, ttlMs)
    if (acquired) break
    await sleep(50 + Math.floor(Math.random() * 100))
  }
  if (!acquired) return null
  try {
    return await fn()
  } finally {
    try {
      await kvEval(RELEASE_SCRIPT, [lockKey], [token])
    } catch {
      await kvDel(lockKey)
    }
  }
}

export default withKvLock
