/**
 * Shared KV storage for user_lists with read cache and optional write lock.
 */

import { kv, kvAvailable } from './kvBootstrap.js'
import { flags } from './flags.js'
import { withKvLock } from './kvLock.js'

export const LISTS_KV_KEY = 'user_lists'
const LOCK_KEY = 'lock:user_lists'

let fallbackStore = []
let readCache = null
let readCacheAt = 0
const READ_CACHE_MS = 3000

function invalidateReadCache() {
  readCache = null
  readCacheAt = 0
}

async function loadListsArray() {
  if (!kvAvailable || !kv) return fallbackStore
  try {
    const data = await kv.get(LISTS_KV_KEY)
    const lists = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    const result = Array.isArray(lists) ? lists : []
    fallbackStore = result
    return result
  } catch {
    return fallbackStore
  }
}

export async function getAllLists() {
  if (readCache && Date.now() - readCacheAt < READ_CACHE_MS) {
    return readCache
  }
  const result = await loadListsArray()
  fallbackStore = result
  readCache = result
  readCacheAt = Date.now()
  return result
}

export async function saveAllLists(lists) {
  return mutateLists(() => lists)
}

async function writeAllLists(lists) {
  invalidateReadCache()
  fallbackStore = lists
  if (kvAvailable && kv) {
    try {
      await kv.set(LISTS_KV_KEY, lists).catch(() => kv.set(LISTS_KV_KEY, JSON.stringify(lists)))
    } catch (e) {
      console.warn('KV save failed (user_lists)', e.message)
    }
  }
  return lists
}

export async function mutateLists(mutatorFn) {
  const run = async () => {
    const all = await loadListsArray()
    const next = await mutatorFn(all)
    if (next === undefined || next === all) return all
    return writeAllLists(next)
  }
  if (!flags.LISTS_LOCK()) return run()
  const locked = await withKvLock(LOCK_KEY, run)
  if (locked !== null) return locked
  return run()
}
