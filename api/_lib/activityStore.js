/**
 * Team activity feed stored in KV per team.
 * Key: team_activity:{teamId} — capped Redis LIST of activity JSON (newest first).
 *
 * Appends use LPUSH + LTRIM (O(1)) instead of read-modify-write on a JSON
 * array, which eliminates append races and full-array rewrites per event.
 * Legacy string keys holding a JSON array are migrated on first append/read.
 */

let kv = null
let kvAvailable = false
let kvInitPromise = null

async function initKv() {
  if (kvInitPromise) return kvInitPromise

  kvInitPromise = (async () => {
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      try {
        const kvModule = await import('@vercel/kv')
        kv = kvModule.kv
        kvAvailable = true
        return
      } catch {
        kvAvailable = false
      }
    }

    if (process.env.REDIS_URL) {
      try {
        const { createClient } = await import('redis')
        const client = createClient({
          url: process.env.REDIS_URL,
          socket: {
            connectTimeout: 4000,
            reconnectStrategy: false,
          },
        })
        client.on('error', (err) => {
          console.warn('activity store redis error', err.message)
          kvAvailable = false
        })
        await client.connect()
        kv = client
        kvAvailable = true
      } catch (e) {
        console.warn('activity store redis connect failed', e.message)
        kvAvailable = false
        kv = null
      }
    }
  })()

  return kvInitPromise
}

const MAX_ACTIVITY = 500

function activityKey(teamId) {
  return `team_activity:${teamId}`
}

function isNativeRedis(client) {
  return client && typeof client.connect === 'function' && typeof client.lPush === 'function'
}

function parseItem(item) {
  if (item && typeof item === 'object') return item
  if (typeof item === 'string') {
    try { return JSON.parse(item) } catch { return null }
  }
  return null
}

async function listRange(key) {
  if (isNativeRedis(kv)) return kv.lRange(key, 0, MAX_ACTIVITY - 1)
  return kv.lrange(key, 0, MAX_ACTIVITY - 1)
}

async function listPush(key, value) {
  if (isNativeRedis(kv)) {
    await kv.lPush(key, value)
    await kv.lTrim(key, 0, MAX_ACTIVITY - 1)
    return
  }
  await kv.lpush(key, value)
  await kv.ltrim(key, 0, MAX_ACTIVITY - 1)
}

async function listSet(key, index, value) {
  if (isNativeRedis(kv)) {
    await kv.lSet(key, index, value)
    return
  }
  await kv.lset(key, index, value)
}

/** Read a legacy string-key JSON-array feed, if present. Returns null when key is a list. */
async function readLegacyArray(key) {
  try {
    const raw = await kv.get(key)
    const parsed = typeof raw === 'string' ? (raw ? JSON.parse(raw) : null) : raw
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** One-time migration: convert a legacy JSON-array string key to a Redis list. */
async function migrateLegacyToList(key) {
  const legacy = await readLegacyArray(key)
  if (!legacy) {
    // Key might not exist or is already a list; nothing to migrate.
    return false
  }
  try {
    await kv.del(key)
    // LPUSH oldest first so newest ends at the head.
    for (let i = Math.min(legacy.length, MAX_ACTIVITY) - 1; i >= 0; i--) {
      await listPush(key, JSON.stringify(legacy[i]))
    }
    return true
  } catch (e) {
    console.warn('activity store legacy migration failed', e.message)
    return false
  }
}

export async function getTeamActivity(teamId) {
  await initKv()
  if (!teamId || !kvAvailable || !kv) return []
  const key = activityKey(teamId)
  try {
    const items = await listRange(key)
    if (!Array.isArray(items)) return []
    const seenIds = new Set()
    return items
      .map(parseItem)
      .filter(Boolean)
      .filter((item) => {
        if (item.replacedBy) return false
        if (seenIds.has(item.id)) return false
        seenIds.add(item.id)
        return true
      })
  } catch {
    // WRONGTYPE: legacy string key still holding a JSON array.
    const legacy = await readLegacyArray(key)
    return Array.isArray(legacy) ? legacy : []
  }
}

/**
 * @param {string} teamId
 * @param {object} record — full activity record including id, teamId, createdAt
 */
export async function appendTeamActivity(teamId, record) {
  if (!teamId || !record?.id) return null
  await initKv()
  if (!kvAvailable || !kv) return null
  const key = activityKey(teamId)
  try {
    await listPush(key, JSON.stringify(record))
  } catch {
    // WRONGTYPE: migrate the legacy array key to a list, then retry once.
    await migrateLegacyToList(key)
    try {
      await listPush(key, JSON.stringify(record))
    } catch (e) {
      console.warn('activity store append failed', e.message)
      return null
    }
  }
  return record
}

/**
 * Coalesce a team activity into a recent matching row when possible.
 * @param {string} teamId
 * @param {object} record
 * @param {{ coalesceKey?: string|null, delta?: number, type?: string, summaryContext?: object|null, windowMs?: number, scanLimit?: number }} options
 */
export async function upsertTeamActivity(teamId, record, options = {}) {
  const {
    coalesceKey = record?.coalesceKey || null,
    delta = record?.delta || record?.count || 1,
    type = record?.type,
    summaryContext = null,
    windowMs,
    scanLimit,
  } = options

  if (!coalesceKey) return appendTeamActivity(teamId, record)

  const { buildActivitySummary, isWithinActivityCoalesceWindow, ACTIVITY_COALESCE_WINDOW_MS, ACTIVITY_COALESCE_SCAN_LIMIT } = await import('./feedCoalesce.js')
  const effectiveWindow = windowMs ?? ACTIVITY_COALESCE_WINDOW_MS
  const effectiveScan = scanLimit ?? ACTIVITY_COALESCE_SCAN_LIMIT

  await initKv()
  if (!kvAvailable || !kv) return appendTeamActivity(teamId, record)

  const key = activityKey(teamId)
  let parsed = []
  try {
    const items = await listRange(key)
    parsed = (Array.isArray(items) ? items : []).map(parseItem).filter(Boolean).slice(0, effectiveScan)
  } catch {
    parsed = []
  }

  const now = Date.now()
  const matchIdx = parsed.findIndex((item) =>
    item.coalesceKey === coalesceKey
    && item.actorUid === record.actorUid
    && !item.replacedBy
    && isWithinActivityCoalesceWindow(item.createdAt, now, effectiveWindow)
  )

  if (matchIdx === -1) {
    return appendTeamActivity(teamId, {
      ...record,
      coalesceKey,
      count: delta,
      delta,
    })
  }

  const existing = parsed[matchIdx]
  const newCount = (existing.count || 1) + delta
  const updated = {
    ...existing,
    ...record,
    id: existing.id,
    coalesceKey,
    count: newCount,
    delta,
    summary: summaryContext
      ? buildActivitySummary(type, { ...summaryContext, count: newCount })
      : record.summary,
  }

  try {
    if (matchIdx === 0) {
      await listSet(key, 0, JSON.stringify(updated))
      return updated
    }

    await listSet(key, matchIdx, JSON.stringify({ ...existing, replacedBy: existing.id }))
    await listPush(key, JSON.stringify(updated))
    return updated
  } catch (e) {
    console.warn('activity store upsert failed', e.message)
    return appendTeamActivity(teamId, record)
  }
}

export function isActivityStoreAvailable() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) || !!process.env.REDIS_URL
}

export async function ensureActivityStoreReady() {
  await initKv()
  return kvAvailable && !!kv
}
