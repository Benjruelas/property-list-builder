import { addTask } from './leadTasks'
import { addPipelineTask } from './pipelineTasks'
import { addTeamTask } from './teamTasks'

export function normalizePendingDealTask(item) {
  return {
    id: item?.id || `pending_task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    title: (item?.title ?? '').toString(),
    scheduledAt: item?.scheduledAt ?? null,
    scheduledEndAt: item?.scheduledEndAt ?? null,
    assignedUids: Array.isArray(item?.assignedUids) ? item.assignedUids.filter(Boolean) : [],
    completed: !!item?.completed,
    completedAt: item?.completed ? (item?.completedAt ?? Date.now()) : null,
    createdAt: item?.createdAt ?? Date.now(),
    confirmed: true,
  }
}

export function createPendingDealTask({
  title = '',
  scheduledAt = null,
  scheduledEndAt = null,
  assignedUids = [],
} = {}) {
  return normalizePendingDealTask({ title, scheduledAt, scheduledEndAt, assignedUids })
}

export function mapPrefillTaskRows(items) {
  if (!Array.isArray(items) || items.length === 0) return []
  return items.map((item) => normalizePendingDealTask(item))
}

export function taskRowsForSubmit(items) {
  return (items || [])
    .filter((item) => String(item.title ?? '').trim())
    .map((item) => ({
      title: String(item.title).trim(),
      scheduledAt: item.scheduledAt ?? null,
      scheduledEndAt: item.scheduledEndAt ?? null,
      assignedUids: Array.isArray(item.assignedUids) ? item.assignedUids.filter(Boolean) : [],
      completed: !!item.completed,
      completedAt: item.completed ? (item.completedAt ?? Date.now()) : null,
    }))
}

/**
 * Create pipeline / personal tasks linked to a deal after it is persisted.
 */
export async function createTasksForDeal({
  deal,
  lead,
  pipeline,
  tasks,
  getToken,
  apiMode = false,
}) {
  const rows = taskRowsForSubmit(tasks)
  if (rows.length === 0 || !deal?.id) return { created: 0, failed: 0 }

  const pipelineId = pipeline?.id || deal.pipelineId || null
  const isTeamPipe = Array.isArray(pipeline?.teamShares) && pipeline.teamShares.length > 0
  const parcelId = deal.parcelId || lead?.parcelId || null
  const leadId = deal.leadId || lead?.id || null
  let created = 0
  let failed = 0

  for (const row of rows) {
    const trimmed = String(row.title ?? '').trim()
    if (!trimmed) continue
    try {
      if (apiMode && pipelineId && getToken) {
        if (isTeamPipe && leadId) {
          try {
            await addTeamTask(getToken, pipelineId, leadId, {
              title: trimmed,
              dueAt: row.scheduledAt,
              assignedUids: row.assignedUids,
              dealId: deal.id,
            })
            created += 1
            continue
          } catch {
            // fall back to pipeline-scoped task
          }
        }
        await addPipelineTask(getToken, pipelineId, {
          title: trimmed,
          parcelId,
          dealId: deal.id,
          scheduledAt: row.scheduledAt,
          scheduledEndAt: row.scheduledEndAt,
          completed: row.completed,
          completedAt: row.completed ? row.completedAt : null,
        })
        created += 1
      } else {
        addTask({
          pipelineId: pipelineId || null,
          parcelId: parcelId || leadId || null,
          dealId: deal.id,
          title: trimmed,
          scheduledAt: row.scheduledAt,
          scheduledEndAt: row.scheduledEndAt,
          completed: row.completed,
          completedAt: row.completed ? row.completedAt : null,
        })
        created += 1
      }
    } catch {
      failed += 1
    }
  }

  return { created, failed }
}
