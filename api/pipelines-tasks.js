/**
 * Vercel Serverless Function - pipe-scoped tasks on pipelines.
 *
 * Mutates `pipeline.tasks` on a single pipeline document. Access is gated by
 * resolveAccess(pipeline, user, teamsIndex) — the same rule used for pipeline
 * GET and for team-tasks — so the pipe owner and anyone the pipe is shared
 * with (sharedWith email or teamShares) can create/update/delete tasks.
 *
 * Task shape mirrors the existing personal leadTasks shape so a client-side
 * one-shot migration is a straight copy (plus an optional parcelId).
 *
 *   POST /api/pipelines-tasks
 *     body: { pipelineId, action, task }
 *     actions: 'add' | 'update' | 'remove' | 'toggle-complete'
 */

import { getAllTeams, fullTeamsIndex, resolveAccess } from './_lib/teams.js'
import { getAllPipelines, mutatePipelines } from './_lib/pipelineStoreFull.js'
import { authenticate } from './_lib/auth.js'

function num(v) {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function normalizeTask(raw, user) {
  const now = Date.now()
  const createdAt = num(raw.createdAt) ?? now
  return {
    id: raw.id || `task-${now}-${Math.random().toString(36).slice(2, 9)}`,
    title: String(raw.title || '').trim(),
    completed: !!raw.completed,
    createdAt,
    completedAt: raw.completed ? (num(raw.completedAt) ?? now) : null,
    scheduledAt: num(raw.scheduledAt),
    scheduledEndAt: num(raw.scheduledEndAt),
    parcelId: raw.parcelId && String(raw.parcelId).trim() ? String(raw.parcelId) : null,
    dealId: raw.dealId && String(raw.dealId).trim() ? String(raw.dealId) : null,
    createdBy: raw.createdBy || user.uid,
    createdByEmail: raw.createdByEmail || user.email || null
  }
}

async function logPipelineTaskActivity(pipeline, user, type, task, summary) {
  try {
    const { logTeamActivity, teamIdsFromResource } = await import('./lib/activityLog.js')
    const teamIds = teamIdsFromResource(pipeline)
    if (teamIds.length === 0) return
    await logTeamActivity({
      teamIds,
      actor: user,
      type,
      summary,
      entity: { kind: 'task', taskId: task.id, pipelineId: pipeline.id, dealId: task.dealId || null },
      nav: { type: 'task', taskId: task.id, pipelineId: pipeline.id },
    })
  } catch (e) {
    console.warn('pipeline task activity', e.message)
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { user } = await authenticate(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { pipelineId, action, task = {} } = req.body || {}
  if (!pipelineId) return res.status(400).json({ error: 'pipelineId is required' })
  if (!action) return res.status(400).json({ error: 'action is required' })

  try {
    const [all, allTeams] = await Promise.all([getAllPipelines(), getAllTeams()])
    const idx = all.findIndex((p) => p.id === pipelineId)
    if (idx === -1) return res.status(404).json({ error: 'Pipeline not found' })
    const pipeline = all[idx]
    const teamsIndex = fullTeamsIndex(allTeams)
    const access = resolveAccess(pipeline, user, teamsIndex)
    if (!access) return res.status(403).json({ error: 'No access to this pipeline' })

    pipeline.tasks = Array.isArray(pipeline.tasks) ? pipeline.tasks : []
    const { actorLabel } = await import('./lib/activityLog.js')
    const actor = actorLabel(user)

    if (action === 'add') {
      if (!String(task.title || '').trim()) {
        return res.status(400).json({ error: 'Task title is required' })
      }
      if (task.dealId) {
        const dealMatch = (pipeline.deals || []).some((d) => d.id === task.dealId)
        if (!dealMatch) return res.status(400).json({ error: 'dealId not found in this pipeline' })
      }
      if (task.parcelId) {
        const match =
          (pipeline.deals || []).some(
            (d) => d.parcelId === task.parcelId || d.leadId === task.parcelId
          ) ||
          (pipeline.leads || []).some(
            (l) => l.parcelId === task.parcelId || l.id === task.parcelId
          )
        if (!match) return res.status(400).json({ error: 'parcelId not found in this pipeline' })
      }
      const normalized = normalizeTask(task, user)
      if (pipeline.tasks.some((t) => t.id === normalized.id)) {
        return res.status(200).json({ pipeline, task: normalized, alreadyExists: true })
      }
      pipeline.tasks.push(normalized)
      await logPipelineTaskActivity(pipeline, user, 'task.created', normalized, `${actor} created task "${normalized.title}"`)
    } else if (action === 'update') {
      const tIdx = pipeline.tasks.findIndex((t) => t.id === task.id)
      if (tIdx === -1) return res.status(404).json({ error: 'Task not found' })
      const prev = pipeline.tasks[tIdx]
      const next = { ...prev }
      if (task.title !== undefined) next.title = String(task.title || '').trim()
      if (task.scheduledAt !== undefined) next.scheduledAt = num(task.scheduledAt)
      if (task.scheduledEndAt !== undefined) next.scheduledEndAt = num(task.scheduledEndAt)
      if (task.completed !== undefined) {
        next.completed = !!task.completed
        next.completedAt = next.completed ? (num(task.completedAt) ?? Date.now()) : null
      }
      if (task.parcelId !== undefined) {
        const p = task.parcelId && String(task.parcelId).trim() ? String(task.parcelId) : null
        if (p) {
          const match =
            (pipeline.deals || []).some(
              (d) => d.parcelId === p || d.leadId === p
            ) ||
            (pipeline.leads || []).some(
              (l) => l.parcelId === p || l.id === p
            )
          if (!match) return res.status(400).json({ error: 'parcelId not found in this pipeline' })
        }
        next.parcelId = p
      }
      if (task.dealId !== undefined) {
        const d = task.dealId && String(task.dealId).trim() ? String(task.dealId) : null
        if (d) {
          const dealMatch = (pipeline.deals || []).some((deal) => deal.id === d)
          if (!dealMatch) return res.status(400).json({ error: 'dealId not found in this pipeline' })
        }
        next.dealId = d
      }
      pipeline.tasks[tIdx] = next
    } else if (action === 'remove') {
      const removed = pipeline.tasks.find((t) => t.id === task.id)
      const before = pipeline.tasks.length
      pipeline.tasks = pipeline.tasks.filter((t) => t.id !== task.id)
      if (pipeline.tasks.length === before) {
        return res.status(404).json({ error: 'Task not found' })
      }
      if (removed) {
        await logPipelineTaskActivity(pipeline, user, 'task.deleted', removed, `${actor} deleted task "${removed.title}"`)
      }
    } else if (action === 'toggle-complete') {
      const tIdx = pipeline.tasks.findIndex((t) => t.id === task.id)
      if (tIdx === -1) return res.status(404).json({ error: 'Task not found' })
      const cur = pipeline.tasks[tIdx]
      const completing = !cur.completed
      pipeline.tasks[tIdx] = {
        ...cur,
        completed: completing,
        completedAt: completing ? Date.now() : null
      }
      if (completing) {
        await logPipelineTaskActivity(pipeline, user, 'task.completed', pipeline.tasks[tIdx], `${actor} completed task "${cur.title}"`)
      }
    } else {
      return res.status(400).json({ error: `Unknown action: ${action}` })
    }

    pipeline.updatedAt = new Date().toISOString()
    const updated = { ...pipeline }
    await mutatePipelines((current) => {
      const at = current.findIndex((p) => p.id === pipelineId)
      if (at === -1) return undefined
      const prev = current[at]
      const next = [...current]
      next[at] = updated
      return next
    }, { changedResources: [{ resource: updated, prevResource: all[idx] }] })
    return res.status(200).json({ pipeline: updated })
  } catch (err) {
    console.error('pipelines-tasks error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
