/**
 * Web Push helpers: load subscriptions from KV, read notification prefs from user blob,
 * send via web-push. Used by lists/pipelines PATCH handlers.
 */
import webpush from 'web-push'

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

let vapidConfigured = false
function ensureVapid() {
  if (vapidConfigured) return
  const pub = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:notify@localhost'
  if (pub && priv) {
    webpush.setVapidDetails(subject, pub, priv)
    vapidConfigured = true
  }
}

async function getUserData(uid) {
  if (!kvAvailable || !kv) return null
  try {
    const data = await kv.get(`user_data_${uid}`)
    if (!data) return null
    return typeof data === 'string' ? JSON.parse(data) : data
  } catch {
    return null
  }
}

function normalizePrefs(prefs) {
  const d = {
    pushEnabled: true,
    listShared: true,
    pipelineShared: true,
    pipelineLeadStage: true,
  }
  if (!prefs || typeof prefs !== 'object') return d
  return {
    pushEnabled: prefs.pushEnabled !== false,
    listShared: prefs.listShared !== false,
    pipelineShared: prefs.pipelineShared !== false,
    pipelineLeadStage: prefs.pipelineLeadStage !== false,
  }
}

async function getNotificationPrefs(uid) {
  const data = await getUserData(uid)
  const n = data?.appSettings?.notifications
  return normalizePrefs(n)
}

async function getSubscriptionUid(email) {
  const e = (email || '').toLowerCase().trim()
  if (!e || !kvAvailable || !kv) return null
  try {
    return await kv.get(`push_by_email:${e}`)
  } catch {
    return null
  }
}

async function getPushSubscription(uid) {
  if (!kvAvailable || !kv) return null
  try {
    const raw = await kv.get(`push_sub:${uid}`)
    if (!raw) return null
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    return null
  }
}

/**
 * @param {string} recipientEmail
 * @param {{ title: string, body: string, tag?: string, data?: object }} payload
 * @param {'listShared'|'pipelineShared'|'pipelineLeadStage'} kind
 * @param {{ uid?: string, email?: string }} actor - skip notifying self
 */
export async function sendWebPushToEmail(recipientEmail, payload, kind, actor = {}) {
  ensureVapid()
  if (!vapidConfigured) return
  const e = (recipientEmail || '').toLowerCase().trim()
  if (!e) return
  const actorEmail = (actor.email || '').toLowerCase().trim()
  if (e === actorEmail) return

  const uid = await getSubscriptionUid(e)
  if (!uid) return

  const prefs = await getNotificationPrefs(uid)
  if (!prefs.pushEnabled) return
  if (kind === 'listShared' && !prefs.listShared) return
  if (kind === 'pipelineShared' && !prefs.pipelineShared) return
  if (kind === 'pipelineLeadStage' && !prefs.pipelineLeadStage) return

  const sub = await getPushSubscription(uid)
  if (!sub) return

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    tag: payload.tag || 'property-map',
    data: payload.data || {},
  })

  try {
    await webpush.sendNotification(sub, body, {
      TTL: 60 * 60,
      urgency: 'normal',
    })
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      try {
        await kv.del(`push_sub:${uid}`)
        await kv.del(`push_by_email:${e}`)
      } catch {
        /* ignore */
      }
    } else {
      console.warn('web push send failed', err.message)
    }
  }
}

export async function notifyNewListShares(newEmails, { listName, actorEmail }) {
  const title = 'List shared with you'
  for (const email of newEmails) {
    await sendWebPushToEmail(
      email,
      {
        title,
        body: `${actorEmail || 'Someone'} shared "${listName || 'a list'}" with you`,
        tag: `list-share-${Date.now()}`,
        data: { type: 'listShared' },
      },
      'listShared',
      { email: actorEmail }
    )
  }
}

export async function notifyNewPipelineShares(newEmails, { pipelineTitle, actorEmail }) {
  const title = 'Pipeline shared with you'
  for (const email of newEmails) {
    await sendWebPushToEmail(
      email,
      {
        title,
        body: `${actorEmail || 'Someone'} shared "${pipelineTitle || 'a pipeline'}" with you`,
        tag: `pipe-share-${Date.now()}`,
        data: { type: 'pipelineShared' },
      },
      'pipelineShared',
      { email: actorEmail }
    )
  }
}

function columnName(columns, statusId) {
  if (!Array.isArray(columns)) return 'stage'
  const c = columns.find((x) => x.id === statusId)
  return c?.name || 'stage'
}

function leadLabel(lead) {
  const a = lead?.address || lead?.properties?.SITUS_ADDR || ''
  const o = lead?.owner || lead?.properties?.OWNER_NAME || ''
  return (a || o || 'Lead').slice(0, 80)
}

/**
 * @param {Array<{ lead: object, oldStatus: string, newStatus: string }>} changes
 */
export async function notifyPipelineLeadStatusChanges(
  changes,
  { pipelineTitle, columns, ownerEmail, sharedWith, actorEmail }
) {
  const recipients = new Set()
  const o = (ownerEmail || '').toLowerCase().trim()
  if (o) recipients.add(o)
  for (const s of sharedWith || []) {
    const t = (s || '').toLowerCase().trim()
    if (t) recipients.add(t)
  }
  const actor = (actorEmail || '').toLowerCase().trim()
  recipients.delete(actor)

  for (const { lead, oldStatus, newStatus } of changes) {
    const from = columnName(columns, oldStatus)
    const to = columnName(columns, newStatus)
    const label = leadLabel(lead)
    const body = `"${label}" moved from ${from} \u2192 ${to} in ${pipelineTitle || 'pipeline'}`
    for (const email of recipients) {
      await sendWebPushToEmail(
        email,
        {
          title: 'Lead stage updated',
          body,
          tag: `lead-${lead.id}-${newStatus}`,
          data: { type: 'pipelineLeadStage' },
        },
        'pipelineLeadStage',
        { email: actorEmail }
      )
    }
  }
}

/** Diff old vs new leads for status changes (same lead id). */
export function diffLeadStatusChanges(oldLeads, newLeads) {
  const oldById = new Map()
  for (const l of oldLeads || []) {
    if (l?.id) oldById.set(l.id, l.status)
  }
  const changes = []
  for (const nl of newLeads || []) {
    if (!nl?.id) continue
    const prev = oldById.get(nl.id)
    if (prev !== undefined && prev !== nl.status) {
      changes.push({ lead: nl, oldStatus: prev, newStatus: nl.status })
    }
  }
  return changes
}
