/**
 * Cron: scan synced user data for upcoming task deadlines and send Web Push.
 * Secured via CRON_SECRET header (Vercel cron) or Authorization Bearer.
 */
import { notifyTaskDeadline } from './push-utils.js'

let kv = null
let kvAvailable = false

if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  try {
    const kvModule = await import('@vercel/kv')
    kv = kvModule.kv
    kvAvailable = true
  } catch {
    kvAvailable = false
  }
} else if (process.env.REDIS_URL) {
  try {
    const { createClient } = await import('redis')
    kv = createClient({ url: process.env.REDIS_URL })
    await kv.connect()
    kvAvailable = true
  } catch {
    kvAvailable = false
  }
}

const sentCache = new Map()

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.authorization || ''
    if (auth === `Bearer ${secret}`) return true
    if (req.headers['x-cron-secret'] === secret) return true
  }
  const host = req.headers.host || ''
  return /localhost|127\.0\.0\.1/.test(host)
}

function getLeadMinutes(prefs) {
  const n = parseInt(prefs?.taskDeadlineLeadMinutes, 10)
  return [15, 30, 60].includes(n) ? n : 60
}

function parseTasks(userData) {
  const raw = userData?.leadTasks
  if (!raw) return []
  if (raw?.v === 2 && Array.isArray(raw.tasks)) return raw.tasks
  if (Array.isArray(raw)) return raw
  return []
}

async function listUserDataKeys() {
  if (!kvAvailable || !kv) return []
  try {
    if (typeof kv.keys === 'function') {
      const keys = await kv.keys('user_data_*')
      return Array.isArray(keys) ? keys : []
    }
  } catch {
    /* scan fallback below */
  }
  const uids = new Set()
  try {
    if (typeof kv.keys === 'function') {
      const emailKeys = await kv.keys('push_by_email:*')
      for (const k of emailKeys || []) {
        const uid = await kv.get(k)
        if (uid) uids.add(uid)
      }
    }
  } catch {
    /* ignore */
  }
  return [...uids].map((uid) => `user_data_${uid}`)
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (!kvAvailable || !kv) {
    return res.status(503).json({ error: 'KV unavailable' })
  }

  const now = Date.now()
  let sent = 0
  let scanned = 0

  try {
    const keys = await listUserDataKeys()
    for (const key of keys) {
      const uid = key.replace(/^user_data_/, '')
      let data
      try {
        const raw = await kv.get(key)
        data = typeof raw === 'string' ? JSON.parse(raw) : raw
      } catch {
        continue
      }
      scanned++
      const prefs = data?.appSettings?.notifications || {}
      if (prefs.pushEnabled !== true || prefs.taskDeadline === false) continue

      const leadMs = getLeadMinutes(prefs) * 60 * 1000
      const email = await kv.get(`push_uid:${uid}`)
      const tasks = parseTasks(data)

      for (const t of tasks) {
        if (t.completed || !t.scheduledAt) continue
        const at = typeof t.scheduledAt === 'number' ? t.scheduledAt : new Date(t.scheduledAt).getTime()
        if (Number.isNaN(at)) continue
        if (now < at - leadMs || now >= at) continue

        const dayKey = new Date(at).toISOString().slice(0, 10)
        const cacheKey = `${uid}:${t.id}:${dayKey}`
        if (sentCache.has(cacheKey)) continue
        if (Date.now() - (sentCache.get(cacheKey) || 0) < 60000) continue

        await notifyTaskDeadline(uid, email, {
          taskTitle: t.title,
          scheduledAt: at,
          taskId: t.id,
        })
        sentCache.set(cacheKey, Date.now())
        sent++
      }
    }

    return res.status(200).json({ ok: true, scanned, sent })
  } catch (err) {
    console.error('cron-task-reminders error', err)
    return res.status(500).json({ error: err.message })
  }
}
