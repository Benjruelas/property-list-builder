/**
 * Vercel Cron: Sends push notifications for tasks due in the next hour.
 * Run via vercel.json cron (e.g. every hour).
 * Requires CRON_SECRET in env (Vercel Cron sends it, or set for manual trigger).
 */

let kv = null
let kvAvailable = false

if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  try {
    const kvModule = await import('@vercel/kv')
    kv = kvModule.kv
    kvAvailable = true
  } catch (e) {
    kvAvailable = false
  }
} else if (process.env.REDIS_URL) {
  try {
    const { createClient } = await import('redis')
    kv = createClient({ url: process.env.REDIS_URL })
    await kv.connect()
    kvAvailable = true
  } catch (e) {
    kvAvailable = false
  }
}

const REMIND_WINDOW_MS = 60 * 60 * 1000 // 1 hour ahead

function extractTasksDueSoon(leadTasks) {
  if (!leadTasks || typeof leadTasks !== 'object') return []
  const now = Date.now()
  const end = now + REMIND_WINDOW_MS
  const due = []
  for (const tasks of Object.values(leadTasks)) {
    if (!Array.isArray(tasks)) continue
    for (const t of tasks) {
      if (t.completed || !t.scheduledAt || !t.title?.trim()) continue
      const sched = Number(t.scheduledAt)
      if (Number.isFinite(sched) && sched >= now && sched <= end) {
        due.push({ title: t.title.trim(), at: sched })
      }
    }
  }
  return due
}

export default async function handler(req, res) {
  const secret = req.headers.authorization?.replace('Bearer ', '') || req.headers['x-cron-secret']
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!kvAvailable || !kv) {
    return res.status(503).json({ error: 'KV not available' })
  }

  try {
    const registryRaw = await kv.get('task_reminder_uids')
    let uids = []
    if (Array.isArray(registryRaw)) uids = registryRaw
    else if (registryRaw) uids = typeof registryRaw === 'string' ? JSON.parse(registryRaw) : []

    const { sendPushToUser } = await import('../lib/sendPush.js')
    let sent = 0

    for (const uid of uids) {
      try {
        const data = await kv.get(`user_data_${uid}`)
        const userData = typeof data === 'string' ? JSON.parse(data) : data
        if (!userData?.fcmToken || userData.pushTaskReminders === false) continue

        const leadTasks = userData.leadTasks || {}
        const dueTasks = extractTasksDueSoon(leadTasks)
        if (dueTasks.length === 0) continue

        const task = dueTasks[0]
        const timeStr = new Date(task.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
        const body = dueTasks.length > 1
          ? `${task.title} and ${dueTasks.length - 1} more due soon`
          : `${task.title} at ${timeStr}`

        const ok = await sendPushToUser(uid, {
          title: 'Task reminder',
          body,
          type: 'taskReminder'
        })
        if (ok) sent++
      } catch (e) {
        console.warn('Task reminder failed for', uid, e.message)
      }
    }

    return res.status(200).json({ ok: true, sent, users: uids.length })
  } catch (err) {
    console.error('Task reminders cron error:', err)
    return res.status(500).json({ error: err.message })
  }
}
