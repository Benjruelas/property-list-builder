/**
 * In-app notification inbox stored in KV per user.
 * Key: notifications:{uid} — array of notification objects (newest first).
 */

import {
  buildNotificationCoalesceKey,
  buildNotificationContent,
  COLLAPSIBLE_NOTIFICATION_TYPES,
} from './feedCoalesce.js'

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

function legacyNotificationEntityKey(item) {
  const type = String(item?.type || 'general')
  const data = item?.data && typeof item.data === 'object' ? item.data : {}
  if (data.listId) return `${type}|list|${data.listId}`
  if (data.pipelineId && data.dealId) return `${type}|deal|${data.pipelineId}|${data.dealId}`
  if (data.pipelineId && data.leadId) return `${type}|lead|${data.pipelineId}|${data.leadId}`
  if (data.pipelineId) return `${type}|pipeline|${data.pipelineId}`
  if (data.quoteId) return `${type}|quote|${data.quoteId}`
  if (data.taskId) return `${type}|task|${data.taskId}`
  if (data.pathId) return `${type}|path|${data.pathId}`
  if (data.templateId) return `${type}|form|${data.templateId}`
  if (data.teamId) return `${type}|team|${data.teamId}`
  return `${type}|general|${String(item?.title || '').slice(0, 80)}`
}

function notificationEntityKey(item) {
  return buildNotificationCoalesceKey({
    type: item?.type,
    data: item?.data,
    coalesceKey: item?.coalesceKey,
  }) || legacyNotificationEntityKey(item)
}

/**
 * Merge a new unread notification into an inbox when it matches an unread row.
 * @returns {{ inbox: object[], record: object, coalesced: boolean }}
 */
export function coalesceInboxNotification(inbox, record) {
  const nextInbox = Array.isArray(inbox) ? [...inbox] : []
  const coalesceKey = record.coalesceKey || buildNotificationCoalesceKey({
    type: record.type,
    data: record.data,
  })
  const entityKey = coalesceKey || legacyNotificationEntityKey(record)
  const existingIdx = nextInbox.findIndex((n) => !n.read && (
    (coalesceKey && n.coalesceKey === coalesceKey)
    || notificationEntityKey(n) === entityKey
  ))

  if (existingIdx === -1) {
    const stored = {
      ...record,
      ...(coalesceKey ? { coalesceKey } : {}),
      count: record.count ?? record.delta ?? 1,
    }
    nextInbox.unshift(stored)
    return { inbox: nextInbox, record: stored, coalesced: false }
  }

  const existing = { ...nextInbox[existingIdx] }
  const collapsible = COLLAPSIBLE_NOTIFICATION_TYPES.has(String(record.type || ''))
  if (collapsible) {
    const delta = record.delta ?? 1
    existing.count = (existing.count || 1) + delta
    const content = buildNotificationContent(record.type, {
      count: existing.count,
      pipelineTitle: record.data?.pipelineTitle,
      body: record.body,
      title: record.title,
    })
    existing.title = content.title
    existing.body = content.body
  } else {
    existing.title = record.title
    existing.body = record.body
  }
  existing.data = record.data
  existing.createdAt = record.createdAt
  if (coalesceKey) existing.coalesceKey = coalesceKey
  nextInbox.splice(existingIdx, 1)
  nextInbox.unshift(existing)
  return { inbox: nextInbox, record: existing, coalesced: true }
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
 * @param {{ type: string, title: string, body: string, data?: object, coalesceKey?: string|null, delta?: number, count?: number }} item
 * @returns {Promise<{ record: object|null, coalesced: boolean }>}
 */
export async function appendInAppNotification(uid, item) {
  if (!uid || !item?.title) return { record: null, coalesced: false }
  const now = new Date().toISOString()
  const coalesceKey = item.coalesceKey || buildNotificationCoalesceKey({
    type: item.type,
    data: item.data,
  })
  const record = {
    id: `ntf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    type: String(item.type || 'general'),
    title: String(item.title).slice(0, 200),
    body: String(item.body || '').slice(0, 500),
    data: item.data && typeof item.data === 'object' ? item.data : {},
    read: false,
    createdAt: now,
    ...(coalesceKey ? { coalesceKey } : {}),
    count: item.count ?? item.delta ?? 1,
    delta: item.delta ?? 1,
  }
  const inbox = await getInbox(uid)
  const { inbox: nextInbox, record: storedRecord, coalesced } = coalesceInboxNotification(inbox, record)
  if (nextInbox.length > MAX_INBOX) nextInbox.length = MAX_INBOX
  await saveInbox(uid, nextInbox)
  return { record: storedRecord, coalesced }
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

const MAX_SEEN_ACTIVITY = 500
const feedSeenFallback = new Map()

function feedSeenKey(uid) {
  return `feed_seen:${uid}`
}

async function loadFeedSeen(uid) {
  if (!uid) return new Set()
  await initKv()
  if (kvAvailable && kv) {
    try {
      const raw = await kv.get(feedSeenKey(uid))
      const parsed = typeof raw === 'string' ? (raw ? JSON.parse(raw) : []) : raw
      const ids = Array.isArray(parsed) ? parsed : []
      return new Set(ids.filter(Boolean))
    } catch {
      return new Set()
    }
  }
  return new Set(feedSeenFallback.get(uid) || [])
}

async function saveFeedSeen(uid, idSet) {
  if (!uid) return
  const ids = [...idSet].slice(0, MAX_SEEN_ACTIVITY)
  await initKv()
  if (kvAvailable && kv) {
    try {
      await kv.set(feedSeenKey(uid), ids).catch(() => kv.set(feedSeenKey(uid), JSON.stringify(ids)))
    } catch (e) {
      console.warn('feed seen save failed', e.message)
    }
    return
  }
  feedSeenFallback.set(uid, ids)
}

export async function getSeenActivityIds(uid) {
  return loadFeedSeen(uid)
}

export async function markActivitiesSeen(uid, activityIds = []) {
  if (!uid || !activityIds.length) return loadFeedSeen(uid)
  const seen = await loadFeedSeen(uid)
  for (const id of activityIds) {
    if (id) seen.add(id)
  }
  while (seen.size > MAX_SEEN_ACTIVITY) {
    const first = seen.values().next().value
    seen.delete(first)
  }
  await saveFeedSeen(uid, seen)
  return seen
}

export async function markAllActivitiesSeen(uid, activityIds = []) {
  return markActivitiesSeen(uid, activityIds)
}

export function isNotificationStoreAvailable() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) || !!process.env.REDIS_URL
}

export async function ensureNotificationStoreReady() {
  await initKv()
  return kvAvailable && !!kv
}
