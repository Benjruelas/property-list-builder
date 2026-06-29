/**
 * Thin Redis/KV command wrapper for @vercel/kv and node-redis v5.
 */

import { kv, kvAvailable } from './kvBootstrap.js'

function isNativeRedis(client) {
  return client && typeof client.connect === 'function' && typeof client.hIncrBy === 'function'
}

export async function kvSetNxPx(key, value, pxMs) {
  if (!kvAvailable || !kv) return false
  if (isNativeRedis(kv)) {
    const result = await kv.set(key, value, { NX: true, PX: pxMs })
    return result === 'OK'
  }
  const result = await kv.set(key, value, { nx: true, px: pxMs })
  return result === 'OK'
}

export async function kvGet(key) {
  if (!kvAvailable || !kv) return null
  return kv.get(key)
}

export async function kvDel(key) {
  if (!kvAvailable || !kv) return 0
  if (isNativeRedis(kv)) return kv.del(key)
  return kv.del(key)
}

export async function kvHGet(hash, field) {
  if (!kvAvailable || !kv) return null
  if (isNativeRedis(kv)) return kv.hGet(hash, field)
  return kv.hget(hash, field)
}

export async function kvHIncrBy(hash, field, increment = 1) {
  if (!kvAvailable || !kv) return null
  if (isNativeRedis(kv)) return kv.hIncrBy(hash, field, increment)
  return kv.hincrby(hash, field, increment)
}

export async function kvHSet(hash, field, value) {
  if (!kvAvailable || !kv) return 0
  if (isNativeRedis(kv)) return kv.hSet(hash, field, value)
  return kv.hset(hash, field, value)
}

export async function kvSAdd(key, ...members) {
  if (!kvAvailable || !kv || !members.length) return 0
  if (isNativeRedis(kv)) return kv.sAdd(key, members)
  return kv.sadd(key, ...members)
}

export async function kvSRem(key, ...members) {
  if (!kvAvailable || !kv || !members.length) return 0
  if (isNativeRedis(kv)) return kv.sRem(key, members)
  return kv.srem(key, ...members)
}

export async function kvSMembers(key) {
  if (!kvAvailable || !kv) return []
  if (isNativeRedis(kv)) return kv.sMembers(key)
  const result = await kv.smembers(key)
  return Array.isArray(result) ? result : []
}

export async function kvEval(script, keys, args) {
  if (!kvAvailable || !kv) return null
  if (isNativeRedis(kv)) return kv.eval(script, { keys, arguments: args })
  return kv.eval(script, keys, args)
}

export { kvAvailable }
