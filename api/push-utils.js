/**
 * Web Push helpers: load subscriptions from KV, read notification prefs from user blob,
 * send via web-push, and record in-app inbox entries.
 */
import webpush from 'web-push'
import { appendInAppNotification } from './lib/notificationStore.js'
import { fullTeamsIndex } from './lib/teams.js'

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
    pushEnabled: false,
    listShared: true,
    pipelineShared: true,
    pipelineLeadStage: true,
    pathShared: true,
    formSubmitted: true,
    teamAdded: true,
    skipTraceComplete: true,
    taskDeadline: true,
  }
  if (!prefs || typeof prefs !== 'object') return d
  return {
    pushEnabled: prefs.pushEnabled === true,
    listShared: prefs.listShared !== false,
    pipelineShared: prefs.pipelineShared !== false,
    pipelineLeadStage: prefs.pipelineLeadStage !== false,
    pathShared: prefs.pathShared !== false,
    formSubmitted: prefs.formSubmitted !== false,
    teamAdded: prefs.teamAdded !== false,
    skipTraceComplete: prefs.skipTraceComplete !== false,
    taskDeadline: prefs.taskDeadline !== false,
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

function subscriptionEndpointId(sub) {
  return sub?.endpoint ? String(sub.endpoint).slice(-48) : `sub_${Date.now()}`
}

async function getPushSubscriptions(uid) {
  if (!kvAvailable || !kv || !uid) return []
  const subs = []
  try {
    const multi = await kv.get(`push_subs:${uid}`)
    const parsed = typeof multi === 'string' ? (multi ? JSON.parse(multi) : []) : multi
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        const sub = entry?.subscription || entry
        if (sub?.endpoint) subs.push(sub)
      }
    }
    if (subs.length === 0) {
      const legacy = await kv.get(`push_sub:${uid}`)
      if (legacy) {
        const sub = typeof legacy === 'string' ? JSON.parse(legacy) : legacy
        if (sub?.endpoint) subs.push(sub)
      }
    }
  } catch {
    /* ignore */
  }
  return subs
}

function prefAllows(kind, prefs) {
  if (!prefs.pushEnabled) return false
  const map = {
    listShared: 'listShared',
    pipelineShared: 'pipelineShared',
    pipelineLeadStage: 'pipelineLeadStage',
    pathShared: 'pathShared',
    formSubmitted: 'formSubmitted',
    teamAdded: 'teamAdded',
    taskDeadline: 'taskDeadline',
  }
  const key = map[kind]
  if (!key) return true
  return prefs[key] !== false
}

/**
 * @param {string} recipientEmail
 * @param {{ title: string, body: string, tag?: string, data?: object }} payload
 * @param {string} kind
 * @param {{ uid?: string, email?: string }} actor
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
  if (!prefAllows(kind, prefs)) return

  await appendInAppNotification(uid, {
    type: kind,
    title: payload.title,
    body: payload.body,
    data: payload.data || {},
  })

  const subs = await getPushSubscriptions(uid)
  if (!subs.length) return

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    tag: payload.tag || 'property-map',
    data: { type: kind, ...(payload.data || {}) },
  })

  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, body, {
        TTL: 60 * 60,
        urgency: 'normal',
      })
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        try {
          const remaining = subs.filter((s) => s.endpoint !== sub.endpoint)
          if (remaining.length) {
            await kv.set(
              `push_subs:${uid}`,
              remaining.map((s) => ({ id: subscriptionEndpointId(s), subscription: s, updatedAt: new Date().toISOString() }))
            )
          } else {
            await kv.del(`push_subs:${uid}`)
            await kv.del(`push_sub:${uid}`)
            await kv.del(`push_by_email:${e}`)
            await kv.del(`push_uid:${uid}`)
          }
        } catch {
          /* ignore */
        }
      } else {
        console.warn('web push send failed', err.message)
      }
    }
  }
}

export function getTeamMemberEmails(team) {
  const emails = new Set()
  const ownerEmail = (team?.ownerEmail || '').toLowerCase().trim()
  if (ownerEmail) emails.add(ownerEmail)
  for (const m of team?.members || []) {
    const em = (m?.email || '').toLowerCase().trim()
    if (em) emails.add(em)
  }
  return [...emails]
}

export async function notifyTeamResourceShare(newTeamIds, teamsIndex, { resourceType, resourceName, resourceId, actorEmail }) {
  for (const tid of newTeamIds || []) {
    const team = teamsIndex[tid]
    if (!team) continue
    const title = `${resourceType} shared with your team`
    for (const email of getTeamMemberEmails(team)) {
      await sendWebPushToEmail(
        email,
        {
          title,
          body: `${actorEmail || 'Someone'} shared "${resourceName || resourceType}" with team ${team.name || ''}`.trim(),
          tag: `team-share-${resourceType}-${resourceId}-${tid}`,
          data: { type: `${resourceType}Shared`, [`${resourceType}Id`]: resourceId, teamId: tid },
        },
        resourceType === 'list' ? 'listShared' : resourceType === 'pipeline' ? 'pipelineShared' : resourceType === 'path' ? 'pathShared' : 'listShared',
        { email: actorEmail }
      )
    }
  }
}

export async function notifyNewListShares(newEmails, { listName, listId, actorEmail }) {
  const title = 'List shared with you'
  for (const email of newEmails) {
    await sendWebPushToEmail(
      email,
      {
        title,
        body: `${actorEmail || 'Someone'} shared "${listName || 'a list'}" with you`,
        tag: `list-share-${listId || Date.now()}`,
        data: { type: 'listShared', listId },
      },
      'listShared',
      { email: actorEmail }
    )
  }
}

export async function notifyNewPipelineShares(newEmails, { pipelineTitle, pipelineId, actorEmail }) {
  const title = 'Pipeline shared with you'
  for (const email of newEmails) {
    await sendWebPushToEmail(
      email,
      {
        title,
        body: `${actorEmail || 'Someone'} shared "${pipelineTitle || 'a pipeline'}" with you`,
        tag: `pipe-share-${pipelineId || Date.now()}`,
        data: { type: 'pipelineShared', pipelineId },
      },
      'pipelineShared',
      { email: actorEmail }
    )
  }
}

export async function notifyNewPathShares(newEmails, { pathName, pathId, actorEmail }) {
  const title = 'Path shared with you'
  for (const email of newEmails) {
    await sendWebPushToEmail(
      email,
      {
        title,
        body: `${actorEmail || 'Someone'} shared "${pathName || 'a path'}" with you`,
        tag: `path-share-${pathId || Date.now()}`,
        data: { type: 'pathShared', pathId },
      },
      'pathShared',
      { email: actorEmail }
    )
  }
}

export async function notifyFormSubmitted(ownerEmail, { formName, submitterEmail, templateId, inviteId }) {
  await sendWebPushToEmail(
    ownerEmail,
    {
      title: 'Form submitted',
      body: `${submitterEmail || 'Someone'} completed "${formName || 'a form'}"`,
      tag: `form-submit-${inviteId || templateId || Date.now()}`,
      data: { type: 'formSubmitted', templateId, inviteId },
    },
    'formSubmitted',
    { email: submitterEmail }
  )
}

export async function notifyTeamMemberAdded(memberEmail, { teamName, teamId, actorEmail }) {
  await sendWebPushToEmail(
    memberEmail,
    {
      title: 'Added to a team',
      body: `${actorEmail || 'Someone'} added you to "${teamName || 'a team'}"`,
      tag: `team-add-${teamId || Date.now()}`,
      data: { type: 'teamAdded', teamId },
    },
    'teamAdded',
    { email: actorEmail }
  )
}

function columnName(columns, statusId) {
  if (!Array.isArray(columns)) return 'stage'
  const c = columns.find((x) => x.id === statusId)
  return c?.name || 'stage'
}

function leadLabel(lead) {
  const a = lead?.address || lead?.leadAddress || lead?.properties?.SITUS_ADDR || ''
  const o = lead?.owner || lead?.leadName || lead?.properties?.OWNER_NAME || ''
  return (a || o || 'Lead').slice(0, 80)
}

function dealLabel(deal) {
  return leadLabel(deal)
}

export function diffDealStatusChanges(oldDeals, newDeals) {
  const oldById = new Map()
  for (const d of oldDeals || []) {
    if (d?.id) oldById.set(d.id, d.status)
  }
  const changes = []
  for (const nd of newDeals || []) {
    if (!nd?.id) continue
    const prev = oldById.get(nd.id)
    if (prev !== undefined && prev !== nd.status) {
      changes.push({ deal: nd, oldStatus: prev, newStatus: nd.status })
    }
  }
  return changes
}

export async function notifyPipelineDealStatusChanges(
  changes,
  { pipelineTitle, pipelineId, columns, ownerEmail, sharedWith, actorEmail }
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

  for (const { deal, oldStatus, newStatus } of changes) {
    const from = columnName(columns, oldStatus)
    const to = columnName(columns, newStatus)
    const label = dealLabel(deal)
    const body = `"${label}" moved from ${from} \u2192 ${to} in ${pipelineTitle || 'pipeline'}`
    for (const email of recipients) {
      await sendWebPushToEmail(
        email,
        {
          title: 'Deal stage updated',
          body,
          tag: `deal-${deal.id}-${newStatus}`,
          data: { type: 'pipelineDealStage', pipelineId, dealId: deal.id, newStatus },
        },
        'pipelineDealStage',
        { email: actorEmail }
      )
    }
  }
}

export async function notifyPipelineLeadStatusChanges(
  changes,
  { pipelineTitle, pipelineId, columns, ownerEmail, sharedWith, actorEmail }
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
          data: { type: 'pipelineLeadStage', pipelineId, leadId: lead.id, newStatus },
        },
        'pipelineLeadStage',
        { email: actorEmail }
      )
    }
  }
}

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

export async function notifyTaskDeadline(uid, email, { taskTitle, scheduledAt, taskId }) {
  if (!uid && !email) return
  const e = (email || '').toLowerCase().trim()
  let targetUid = uid
  if (!targetUid && e) targetUid = await getSubscriptionUid(e)
  if (!targetUid) return

  const prefs = await getNotificationPrefs(targetUid)
  if (!prefs.pushEnabled || !prefs.taskDeadline) return

  const title = 'Task due soon'
  const body = `${(taskTitle || 'Task').slice(0, 80)} — ${new Date(scheduledAt).toLocaleString()}`
  const data = { type: 'taskDeadline', taskId }

  await appendInAppNotification(targetUid, { type: 'taskDeadline', title, body, data })

  if (!vapidConfigured) ensureVapid()
  if (!vapidConfigured) return

  const subs = await getPushSubscriptions(targetUid)
  const payload = JSON.stringify({ title, body, tag: `task-${taskId}`, data })

  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, payload, { TTL: 60 * 60, urgency: 'normal' })
    } catch (err) {
      console.warn('task reminder push failed', err.message)
    }
  }
}
