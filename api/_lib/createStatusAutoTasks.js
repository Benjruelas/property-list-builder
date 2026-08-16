/**
 * Create tasks from status auto-task templates (append-only).
 */

import { mutateTasks } from './taskStore.js'
import { logTeamActivity, actorLabel } from './activityLog.js'

function buildTaskRow({
  template,
  user,
  teamId,
  leadId,
  dealId,
  pipelineId,
  parcelId,
  nowIso,
}) {
  return {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    title: template.title,
    ownerId: user.uid,
    ownerEmail: user.email,
    teamId: teamId || null,
    visibility: teamId ? 'team' : 'private',
    sharedMemberUids: [],
    assignedUids: Array.isArray(template.assignedUids) ? template.assignedUids : [],
    scheduledAt: template.scheduledAt || null,
    scheduledEndAt: template.scheduledEndAt || null,
    completed: false,
    completedAt: null,
    leadId: leadId || null,
    dealId: dealId || null,
    pipelineId: pipelineId || null,
    parcelId: parcelId || null,
    notes: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    source: 'status_auto_task',
    autoTaskTemplateId: template.templateId || null,
  }
}

/**
 * Best-effort create of auto-tasks. Never throws to the caller for individual failures.
 * Returns { created, failed }.
 */
export async function createTasksFromAutoTaskPlan({
  plan,
  user,
  teamId = null,
  leadId = null,
  dealId = null,
  pipelineId = null,
  parcelId = null,
} = {}) {
  if (!plan?.shouldFire || !Array.isArray(plan.tasksToCreate) || plan.tasksToCreate.length === 0) {
    return { created: 0, failed: 0 }
  }

  const nowIso = new Date().toISOString()
  const createdTasks = []
  let failed = 0

  try {
    await mutateTasks((all) => {
      const next = [...all]
      for (const template of plan.tasksToCreate) {
        try {
          const task = buildTaskRow({
            template,
            user,
            teamId,
            leadId,
            dealId,
            pipelineId,
            parcelId,
            nowIso,
          })
          next.push(task)
          createdTasks.push(task)
        } catch {
          failed += 1
        }
      }
      return next
    })
  } catch (e) {
    console.warn('status auto-task batch create failed', e?.message || e)
    return { created: 0, failed: plan.tasksToCreate.length }
  }

  if (teamId && createdTasks.length) {
    const label = actorLabel(user)
    for (const task of createdTasks) {
      try {
        await logTeamActivity({
          teamIds: [teamId],
          actor: user,
          type: 'task.created',
          summary: `${label} created task "${task.title}"`,
          entity: { kind: 'task', taskId: task.id },
          nav: { type: 'task', taskId: task.id },
          audience: 'resource_viewers',
        })
      } catch {
        /* ignore */
      }
    }
  }

  return { created: createdTasks.length, failed }
}
