/**
 * Team activity feed stored in KV per team.
 * Key: team_activity:{teamId} — array of activity objects (newest first).
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

export async function getTeamActivity(teamId) {
  await initKv()
  if (!teamId || !kvAvailable || !kv) return []
  try {
    const raw = await kv.get(activityKey(teamId))
    const parsed = typeof raw === 'string' ? (raw ? JSON.parse(raw) : []) : raw
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function saveTeamActivity(teamId, items) {
  await initKv()
  if (!teamId || !kvAvailable || !kv) return
  try {
    await kv.set(activityKey(teamId), items).catch(() =>
      kv.set(activityKey(teamId), JSON.stringify(items))
    )
  } catch (e) {
    console.warn('activity store save failed', e.message)
  }
}

/**
 * @param {string} teamId
 * @param {object} record — full activity record including id, teamId, createdAt
 */
export async function appendTeamActivity(teamId, record) {
  if (!teamId || !record?.id) return null
  const feed = await getTeamActivity(teamId)
  feed.unshift(record)
  if (feed.length > MAX_ACTIVITY) feed.length = MAX_ACTIVITY
  await saveTeamActivity(teamId, feed)
  return record
}

export function isActivityStoreAvailable() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) || !!process.env.REDIS_URL
}

export async function ensureActivityStoreReady() {
  await initKv()
  return kvAvailable && !!kv
}
