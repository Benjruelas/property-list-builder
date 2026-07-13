/**
 * Shared KV storage for user_form_templates with read cache and optional write lock.
 */

import { kv, kvAvailable } from './kvBootstrap.js'
import { flags } from './flags.js'
import { withKvLock } from './kvLock.js'

export const FORM_TEMPLATES_KV_KEY = 'user_form_templates'
const LOCK_KEY = 'lock:user_form_templates'

let fallbackStore = []
let readCache = null
let readCacheAt = 0
const READ_CACHE_MS = 3000

function invalidateReadCache() {
  readCache = null
  readCacheAt = 0
}

async function loadTemplatesArray() {
  if (!kvAvailable || !kv) return fallbackStore
  try {
    const data = await kv.get(FORM_TEMPLATES_KV_KEY)
    const rows = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    const result = Array.isArray(rows) ? rows : []
    fallbackStore = result
    return result
  } catch {
    return fallbackStore
  }
}

export async function getAllFormTemplates() {
  if (readCache && Date.now() - readCacheAt < READ_CACHE_MS) {
    return readCache
  }
  const result = await loadTemplatesArray()
  fallbackStore = result
  readCache = result
  readCacheAt = Date.now()
  return result
}

export async function saveAllFormTemplates(templates) {
  return mutateFormTemplates(() => templates)
}

async function writeAllFormTemplates(templates) {
  invalidateReadCache()
  fallbackStore = templates
  if (kvAvailable && kv) {
    try {
      await kv.set(FORM_TEMPLATES_KV_KEY, templates)
        .catch(() => kv.set(FORM_TEMPLATES_KV_KEY, JSON.stringify(templates)))
    } catch (e) {
      console.warn('KV save failed (user_form_templates)', e.message)
    }
  }
  return templates
}

export async function mutateFormTemplates(mutatorFn) {
  const run = async () => {
    const all = await loadTemplatesArray()
    const next = await mutatorFn(all)
    if (next === undefined || next === all) return all
    return writeAllFormTemplates(next)
  }
  if (!flags.FORM_TEMPLATES_LOCK()) return run()
  const locked = await withKvLock(LOCK_KEY, run)
  if (locked !== null) return locked
  return run()
}
