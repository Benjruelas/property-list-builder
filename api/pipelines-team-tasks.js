/**
 * Vercel Serverless Function - team-scoped tasks on pipeline leads.
 *
 * Mutates `teamTasks` on a single lead in a pipeline. Using a dedicated endpoint
 * avoids replaying the whole `leads` array on every task mutation (which would
 * cause write conflicts between team members editing simultaneously).
 *
 * - POST /api/pipelines-team-tasks
 *       body: { pipelineId, leadId, action, task }
 *       actions: 'add' | 'update' | 'remove' | 'toggle-complete'
 *
 * Access: caller must have 'owner' or 'collaborator' access to the pipeline
 *         (same rules as the pipeline's own PATCH leads path).
 */

import { resolveDevBypassUser } from './lib/devBypassUsers.js'
import { getAllTeams, fullTeamsIndex, resolveAccess, verifyFirebaseToken } from './lib/teams.js'

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

const PIPELINES_KV_KEY = 'user_pipelines'
let fallbackStore = []

async function getAllPipelines() {
  if (!kvAvailable || !kv) return fallbackStore
  try {
    const data = await kv.get(PIPELINES_KV_KEY)
    const rows = typeof data === 'string' ? (data ? JSON.parse(data) : []) : data
    const result = Array.isArray(rows) ? rows : []
    fallbackStore = result
    return result
  } catch {
    return fallbackStore
  }
}

async function savePipelines(rows) {
  fallbackStore = rows
  if (!kvAvailable || !kv) return
  try {
    await kv
      .set(PIPELINES_KV_KEY, rows)
      .catch(() => kv.set(PIPELINES_KV_KEY, JSON.stringify(rows)))
  } catch (e) {
    console.warn('team-tasks save failed', e.message)
  }
}

function num(v) {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function collectAllowedMemberUids(pipeline, allTeams, user) {
  const allowed = new Set()
  const shareIds = Array.isArray(pipeline.teamShares) ? pipeline.teamShares : []
  for (const tid of shareIds) {
    const team = allTeams.find((t) => t.id === tid)
    if (!team || !Array.isArray(team.members)) continue
    for (const m of team.members) {
      if (m && m.uid) allowed.add(String(m.uid))
    }
  }
  if (user?.uid) {
    for (const team of allTeams) {
      const isMember =
        team?.ownerId === user.uid ||
        (Array.isArray(team.members) && team.members.some((m) => m?.uid === user.uid))
      if (!isMember) continue
      for (const m of team.members || []) {
        if (m?.uid) allowed.add(String(m.uid))
      }
    }
  }
  return allowed
}

function filterAssignedUids(raw, allowed) {
  if (!Array.isArray(raw)) return []
  return raw.map((u) => String(u)).filter((u) => allowed.has(u))
}

function normalizeTask(raw, user, allowedUids) {
  const now = new Date().toISOString()
  const dueN = num(raw.dueAt)
  return {
    id: raw.id || `ttask_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    title: String(raw.title || '').trim(),
    notes: raw.notes ? String(raw.notes) : '',
    dueAt: dueN,
    assignedUids: filterAssignedUids(raw.assignedUids, allowedUids),
    createdAt: raw.createdAt || now,
    createdBy: raw.createdBy || user.uid,
    createdByEmail: raw.createdByEmail || user.email,
    completedAt: raw.completedAt || null,
    completedBy: raw.completedBy || null,
    dealId: raw.dealId && String(raw.dealId).trim() ? String(raw.dealId).trim() : null,
    scope: 'team'
  }
}

async function logTeamTaskActivity(pipeline, user, type, task, summary) {
  try {
    const { logTeamActivity, teamIdsFromResource } = await import('./lib/activityLog.js')
    const teamIds = teamIdsFromResource(pipeline)
    if (teamIds.length === 0) return
    await logTeamActivity({
      teamIds,
      actor: user,
      type,
      summary,
      entity: { kind: 'task', taskId: task.id, pipelineId: pipeline.id, leadId: task.leadId || null },
      nav: { type: 'task', taskId: task.id, pipelineId: pipeline.id },
    })
  } catch (e) {
    console.warn('team task activity', e.message)
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const authHeader = req.headers.authorization
  const idToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  const host = req.headers.host || req.headers['x-forwarded-host'] || ''
  const origin = req.headers.origin || ''
  const isLocalhost =
    /localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0/.test(host) ||
    /localhost|127\.0\.0\.1|\[::1\]/.test(origin)
  const allowDevBypass = isLocalhost || process.env.ENABLE_DEV_BYPASS === 'true'
  let user = allowDevBypass ? resolveDevBypassUser(idToken) : null
  if (!user) user = await verifyFirebaseToken(idToken)
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { pipelineId, leadId, action, task = {} } = req.body || {}
  if (!pipelineId) return res.status(400).json({ error: 'pipelineId is required' })
  if (!leadId) return res.status(400).json({ error: 'leadId is required' })
  if (!action) return res.status(400).json({ error: 'action is required' })

  try {
    const [all, allTeams] = await Promise.all([getAllPipelines(), getAllTeams()])
    const idx = all.findIndex((p) => p.id === pipelineId)
    if (idx === -1) return res.status(404).json({ error: 'Pipeline not found' })
    const pipeline = all[idx]
    const teamsIndex = fullTeamsIndex(allTeams)
    const access = resolveAccess(pipeline, user, teamsIndex)
    if (!access) return res.status(403).json({ error: 'No access to this pipeline' })

    const allowedMemberUids = collectAllowedMemberUids(pipeline, allTeams, user)

    let leadIdx = (pipeline.leads || []).findIndex(
      (l) => l.id === leadId || l.parcelId === leadId
    )
    if (leadIdx === -1) {
      const deal = (pipeline.deals || []).find((d) => d.leadId === leadId)
      if (!deal) return res.status(404).json({ error: 'Lead not found' })
      pipeline.leads = Array.isArray(pipeline.leads) ? pipeline.leads : []
      leadIdx = pipeline.leads.findIndex((l) => l.id === leadId)
      if (leadIdx === -1) {
        pipeline.leads.push({
          id: leadId,
          parcelId: deal.parcelId || null,
          teamTasks: [],
        })
        leadIdx = pipeline.leads.length - 1
      }
    }
    const lead = pipeline.leads[leadIdx]
    lead.teamTasks = Array.isArray(lead.teamTasks) ? lead.teamTasks : []
    const { actorLabel } = await import('./lib/activityLog.js')
    const actor = actorLabel(user)

    if (action === 'add') {
      if (!String(task.title || '').trim()) {
        return res.status(400).json({ error: 'Task title is required' })
      }
      const normalized = normalizeTask(task, user, allowedMemberUids)
      lead.teamTasks.push(normalized)
      await logTeamTaskActivity(pipeline, user, 'task.created', { ...normalized, leadId }, `${actor} created task "${normalized.title}"`)
      const newAssignees = normalized.assignedUids.filter((uid) => uid !== user.uid)
      if (newAssignees.length) {
        try {
          const { notifyTaskAssigned } = await import('./push-utils.js')
          await notifyTaskAssigned(newAssignees, {
            taskTitle: normalized.title,
            taskId: normalized.id,
            actorEmail: user.email,
          }, teamsIndex)
        } catch {
          /* ignore */
        }
      }
    } else if (action === 'update') {
      const tIdx = lead.teamTasks.findIndex((t) => t.id === task.id)
      if (tIdx === -1) return res.status(404).json({ error: 'Task not found' })
      const prevAssigned = new Set(lead.teamTasks[tIdx].assignedUids || [])
      lead.teamTasks[tIdx] = {
        ...lead.teamTasks[tIdx],
        ...(task.title !== undefined ? { title: String(task.title).trim() } : {}),
        ...(task.notes !== undefined ? { notes: String(task.notes) } : {}),
        ...(task.dueAt !== undefined ? { dueAt: num(task.dueAt) } : {}),
        ...(task.assignedUids !== undefined
          ? { assignedUids: filterAssignedUids(task.assignedUids, allowedMemberUids) }
          : {}),
        ...(task.dealId !== undefined
          ? { dealId: task.dealId && String(task.dealId).trim() ? String(task.dealId).trim() : null }
          : {})
      }
      if (task.assignedUids !== undefined) {
        const updated = lead.teamTasks[tIdx]
        const newlyAssigned = (updated.assignedUids || []).filter(
          (uid) => uid !== user.uid && !prevAssigned.has(uid)
        )
        if (newlyAssigned.length) {
          try {
            const { notifyTaskAssigned } = await import('./push-utils.js')
            await notifyTaskAssigned(newlyAssigned, {
              taskTitle: updated.title,
              taskId: updated.id,
              actorEmail: user.email,
            }, teamsIndex)
          } catch {
            /* ignore */
          }
        }
      }
    } else if (action === 'remove') {
      const removed = lead.teamTasks.find((t) => t.id === task.id)
      const before = lead.teamTasks.length
      lead.teamTasks = lead.teamTasks.filter((t) => t.id !== task.id)
      if (lead.teamTasks.length === before) {
        return res.status(404).json({ error: 'Task not found' })
      }
      if (removed) {
        await logTeamTaskActivity(pipeline, user, 'task.deleted', { ...removed, leadId }, `${actor} deleted task "${removed.title}"`)
      }
    } else if (action === 'toggle-complete') {
      const tIdx = lead.teamTasks.findIndex((t) => t.id === task.id)
      if (tIdx === -1) return res.status(404).json({ error: 'Task not found' })
      const cur = lead.teamTasks[tIdx]
      const completing = !cur.completedAt
      lead.teamTasks[tIdx] = {
        ...cur,
        completedAt: completing ? new Date().toISOString() : null,
        completedBy: completing ? user.uid : null
      }
      if (completing) {
        await logTeamTaskActivity(pipeline, user, 'task.completed', { ...cur, leadId }, `${actor} completed task "${cur.title}"`)
      }
    } else {
      return res.status(400).json({ error: `Unknown action: ${action}` })
    }

    pipeline.leads[leadIdx] = lead
    pipeline.updatedAt = new Date().toISOString()
    all[idx] = pipeline
    await savePipelines(all)
    return res.status(200).json({ lead })
  } catch (err) {
    console.error('team-tasks error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
