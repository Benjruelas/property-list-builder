/**
 * In-app notification inbox stored in KV per user.
 * Key: notifications:{uid} — array of notification objects (newest first).
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
          console.warn('notification store redis error', err.message)
          kvAvailable = false
        })
        await client.connect()
        kv = client
        kvAvailable = true
      } catch (e) {
        console.warn('notification store redis connect failed', e.message)
        kvAvailable = false
        kv = null
      }
    }
  })()

  return kvInitPromise
}

const MAX_INBOX = 100

function inboxKey(uid) {
  return `notifications:${uid}`
}

export async function getInbox(uid) {
  await initKv()
  if (!uid || !kvAvailable || !kv) return []
  try {
    const raw = await kv.get(inboxKey(uid))
    const parsed = typeof raw === 'string' ? (raw ? JSON.parse(raw) : []) : raw
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function saveInbox(uid, items) {
  await initKv()
  if (!uid || !kvAvailable || !kv) return
  try {
    await kv.set(inboxKey(uid), items).catch(() => kv.set(inboxKey(uid), JSON.stringify(items)))
  } catch (e) {
    console.warn('notification inbox save failed', e.message)
  }
}

/**
 * @param {string} uid
 * @param {{ type: string, title: string, body: string, data?: object }} item
 */
export async function appendInAppNotification(uid, item) {
  if (!uid || !item?.title) return null
  const now = new Date().toISOString()
  const record = {
    id: `ntf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    type: String(item.type || 'general'),
    title: String(item.title).slice(0, 200),
    body: String(item.body || '').slice(0, 500),
    data: item.data && typeof item.data === 'object' ? item.data : {},
    read: false,
    createdAt: now,
  }
  const inbox = await getInbox(uid)
  inbox.unshift(record)
  if (inbox.length > MAX_INBOX) inbox.length = MAX_INBOX
  await saveInbox(uid, inbox)
  return record
}

export async function markNotificationsRead(uid, ids = null) {
  const inbox = await getInbox(uid)
  const idSet = ids ? new Set(ids) : null
  let changed = false
  for (const n of inbox) {
    if (!idSet || idSet.has(n.id)) {
      if (!n.read) changed = true
      n.read = true
    }
  }
  if (changed) await saveInbox(uid, inbox)
  return inbox
}

export async function getUnreadCount(uid) {
  const inbox = await getInbox(uid)
  return inbox.filter((n) => !n.read).length
}

export function isNotificationStoreAvailable() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) || !!process.env.REDIS_URL
}

export async function ensureNotificationStoreReady() {
  await initKv()
  return kvAvailable && !!kv
}
