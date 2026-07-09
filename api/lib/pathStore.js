/**
 * Shared KV storage for user_paths with read cache and optional write lock.
 */

import { kv, kvAvailable } from './kvBootstrap.js'
import { flags } from './flags.js'
import { withKvLock } from './kvLock.js'

export const PATHS_KV_KEY = 'user_paths'
const LOCK_KEY = 'lock:user_paths'

let fallbackStore = []
let readCache = null
let readCacheAt = 0
const READ_CACHE_MS = 3000

function invalidateReadCache() {
  readCache = null
  readCacheAt = 0
}

async function loadPathsArray() {
  if (!kvAvailable || !kv) return fallbackStore
  try {
    const data = await kv.get(PATHS_KV_KEY)
    const paths = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    const result = Array.isArray(paths) ? paths : []
    fallbackStore = result
    return result
  } catch {
    return fallbackStore
  }
}

export async function getAllPaths() {
  if (readCache && Date.now() - readCacheAt < READ_CACHE_MS) {
    return readCache
  }
  const result = await loadPathsArray()
  fallbackStore = result
  readCache = result
  readCacheAt = Date.now()
  return result
}

export async function saveAllPaths(paths) {
  return mutatePaths(() => paths)
}

async function writeAllPaths(paths) {
  invalidateReadCache()
  fallbackStore = paths
  if (kvAvailable && kv) {
    try {
      await kv.set(PATHS_KV_KEY, paths).catch(() => kv.set(PATHS_KV_KEY, JSON.stringify(paths)))
    } catch (e) {
      console.warn('KV save failed (user_paths)', e.message)
    }
  }
  return paths
}

export async function mutatePaths(mutatorFn) {
  const run = async () => {
    const all = await loadPathsArray()
    const next = await mutatorFn(all)
    if (next === undefined || next === all) return all
    return writeAllPaths(next)
  }
  if (!flags.PATHS_LOCK()) return run()
  const locked = await withKvLock(LOCK_KEY, run)
  if (locked !== null) return locked
  return run()
}
