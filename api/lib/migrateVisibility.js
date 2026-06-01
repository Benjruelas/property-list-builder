/**
 * One-time v1 → v2 visibility migration for KV resource stores.
 */

import { normalizeResourceVisibility, VISIBILITY } from './access.js'

export function migrateResourceRecord(resource) {
  if (!resource || typeof resource !== 'object') return resource
  const r = normalizeResourceVisibility(resource)
  if (r.visibility === VISIBILITY.TEAM && r.teamId) {
    r.teamShares = [r.teamId]
  } else if (r.visibility === VISIBILITY.PRIVATE) {
    r.teamShares = []
  }
  return r
}

export function migrateResourceArray(arr) {
  if (!Array.isArray(arr)) return arr
  let changed = false
  const next = arr.map((item) => {
    const before = JSON.stringify(item)
    const migrated = migrateResourceRecord({ ...item })
    if (JSON.stringify(migrated) !== before) changed = true
    return migrated
  })
  return { items: next, changed }
}

export async function migrateKvStore(kv, key) {
  if (!kv || !key) return false
  try {
    const data = await kv.get(key)
    const arr = typeof data === 'string' ? (data ? JSON.parse(data) : []) : data
    if (!Array.isArray(arr)) return false
    const { items, changed } = migrateResourceArray(arr)
    if (changed) {
      await kv.set(key, items).catch(() => kv.set(key, JSON.stringify(items)))
    }
    return changed
  } catch {
    return false
  }
}

export async function runAllResourceMigrations(kv) {
  const keys = ['user_leads', 'user_lists', 'user_paths', 'user_pipelines', 'user_form_templates']
  const results = {}
  for (const key of keys) {
    results[key] = await migrateKvStore(kv, key)
  }
  return results
}
