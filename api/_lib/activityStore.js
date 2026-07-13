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
    if (Array.isArray(items)) return items.map(parseItem).filter(Boolean)
    return []
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

export function isActivityStoreAvailable() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) || !!process.env.REDIS_URL
}

export async function ensureActivityStoreReady() {
  await initKv()
  return kvAvailable && !!kv
}
