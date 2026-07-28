/**
 * Migrate pipeline.tasks and lead.teamTasks into user_tasks (idempotent).
 */

import { authenticate } from './_lib/auth.js'
import { getAllTeams } from './_lib/teams.js'
import { buildAccessContext, getResourceAccess, canEdit } from './_lib/resourceContext.js'
import { getAllPipelines, mutatePipelines } from './_lib/pipelineStoreFull.js'
import { getAllTasks, saveAllTasks } from './_lib/taskStore.js'
import { userHasTeamMembership } from './_lib/access.js'

function numToIso(v) {
  if (v == null) return null
  if (typeof v === 'string' && v.includes('T')) return v
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return new Date(n).toISOString()
}

function serverTaskFromPipelineTask(task, pipeline, user, membership) {
  const teamId = membership?.id || pipeline.teamId || null
  return {
    id: task.id,
    title: String(task.title || '').trim(),
    ownerId: task.createdBy || user.uid,
    ownerEmail: task.createdByEmail || user.email,
    teamId,
    visibility: teamId && (pipeline.teamShares || []).length ? 'team' : 'private',
    sharedMemberUids: [],
    assignedUids: [],
    scheduledAt: numToIso(task.scheduledAt),
    scheduledEndAt: numToIso(task.scheduledEndAt),
    completed: !!task.completed,
    completedAt: task.completed ? numToIso(task.completedAt) : null,
    leadId: null,
    dealId: task.dealId || null,
    pipelineId: pipeline.id,
    parcelId: task.parcelId || null,
    notes: task.notes ? String(task.notes) : null,
    createdAt: numToIso(task.createdAt) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    migratedFrom: 'pipeline',
  }
}

function serverTaskFromTeamTask(task, pipeline, lead, user, membership) {
  const teamId = membership?.id || pipeline.teamId || null
  return {
    id: task.id,
    title: String(task.title || '').trim(),
    ownerId: task.createdBy || user.uid,
    ownerEmail: user.email,
    teamId,
    visibility: teamId ? 'team' : 'private',
    sharedMemberUids: [],
    assignedUids: Array.isArray(task.assignedUids) ? task.assignedUids.filter(Boolean) : [],
    scheduledAt: numToIso(task.dueAt ?? task.scheduledAt),
    scheduledEndAt: null,
    completed: !!task.completedAt,
    completedAt: task.completedAt ? numToIso(task.completedAt) : null,
    leadId: lead.id,
    dealId: task.dealId || null,
    pipelineId: pipeline.id,
    parcelId: lead.parcelId || null,
    notes: task.notes ? String(task.notes) : null,
    createdAt: numToIso(task.createdAt) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    migratedFrom: 'team',
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

  try {
    const [pipelines, allTeams, existingTasks] = await Promise.all([
      getAllPipelines(),
      getAllTeams(),
      getAllTasks(),
    ])
    const ctx = buildAccessContext(allTeams, user)
    const membership = userHasTeamMembership(allTeams, user.uid)
    const byId = new Map(existingTasks.map((t) => [t.id, t]))
    let added = 0
    let clearedPipeline = 0
    let clearedTeam = 0

    for (const pipeline of pipelines) {
      const access = getResourceAccess(pipeline, user, ctx)
      if (!canEdit(access)) continue

      for (const task of pipeline.tasks || []) {
        if (!task?.id || !(task.title ?? '').toString().trim()) continue
        if (!byId.has(task.id)) {
          byId.set(task.id, serverTaskFromPipelineTask(task, pipeline, user, membership))
          added += 1
        }
      }
      if ((pipeline.tasks || []).length) {
        pipeline.tasks = []
        clearedPipeline += 1
      }

      for (const lead of pipeline.leads || []) {
        if (!lead?.teamTasks?.length) continue
        for (const task of lead.teamTasks) {
          if (!task?.id || !(task.title ?? '').toString().trim()) continue
          if (!byId.has(task.id)) {
            byId.set(task.id, serverTaskFromTeamTask(task, pipeline, lead, user, membership))
            added += 1
          }
        }
        lead.teamTasks = []
        clearedTeam += 1
      }
    }

    await saveAllTasks([...byId.values()])
    await mutatePipelines(async (all) => {
      const byId = new Map(pipelines.map((p) => [p.id, p]))
      return all.map((p) => (byId.has(p.id) ? byId.get(p.id) : p))
    })

    return res.status(200).json({
      added,
      clearedPipeline,
      clearedTeam,
      total: byId.size,
    })
  } catch (err) {
    console.error('migrate-embedded-tasks error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
