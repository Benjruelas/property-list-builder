/**
 * Shared KV storage for user_tasks with read cache and optional write lock.
 */

import { kv, kvAvailable } from './kvBootstrap.js'
import { flags } from './flags.js'
import { withKvLock } from './kvLock.js'

export const TASKS_KV_KEY = 'user_tasks'
const LOCK_KEY = 'lock:user_tasks'

let fallbackStore = []
let readCache = null
let readCacheAt = 0
const READ_CACHE_MS = 3000

function invalidateReadCache() {
  readCache = null
  readCacheAt = 0
}

async function loadTasksArray() {
  if (!kvAvailable || !kv) return fallbackStore
  try {
    const data = await kv.get(TASKS_KV_KEY)
    const rows = typeof data === 'string' ? (data ? JSON.parse(data) : []) : data
    const result = Array.isArray(rows) ? rows : []
    fallbackStore = result
    return result
  } catch {
    return fallbackStore
  }
}

export async function getAllTasks() {
  if (readCache && Date.now() - readCacheAt < READ_CACHE_MS) {
    return readCache
  }
  const result = await loadTasksArray()
  fallbackStore = result
  readCache = result
  readCacheAt = Date.now()
  return result
}

export async function saveAllTasks(tasks) {
  return mutateTasks(() => tasks)
}

async function writeAllTasks(tasks) {
  invalidateReadCache()
  fallbackStore = tasks
  if (kvAvailable && kv) {
    try {
      await kv.set(TASKS_KV_KEY, tasks).catch(() => kv.set(TASKS_KV_KEY, JSON.stringify(tasks)))
    } catch (e) {
      console.warn('KV save failed (user_tasks)', e.message)
    }
  }
  return tasks
}

export async function mutateTasks(mutatorFn) {
  const run = async () => {
    const all = await loadTasksArray()
    const next = await mutatorFn(all)
    if (next === undefined || next === all) return all
    return writeAllTasks(next)
  }
  if (!flags.TASKS_LOCK()) return run()
  const locked = await withKvLock(LOCK_KEY, run)
  if (locked !== null) return locked
  return run()
}
