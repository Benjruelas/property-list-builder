import { createServerTask } from './serverTaskOps'

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
 * Create server tasks linked to a deal after it is persisted.
 */
export async function createTasksForDeal({
  deal,
  lead,
  pipeline,
  tasks,
  getToken,
  apiMode = false,
  leads = [],
  pipelines = [],
}) {
  const rows = taskRowsForSubmit(tasks)
  if (rows.length === 0 || !deal?.id) return { created: 0, failed: 0 }

  const pipelineId = pipeline?.id || deal.pipelineId || null
  const parcelId = deal.parcelId || lead?.parcelId || null
  const leadId = deal.leadId || lead?.id || null
  let created = 0
  let failed = 0

  for (const row of rows) {
    const trimmed = String(row.title ?? '').trim()
    if (!trimmed) continue
    if (!getToken) {
      failed += 1
      continue
    }
    try {
      await createServerTask(getToken, {
        title: trimmed,
        scheduledAt: row.scheduledAt,
        scheduledEndAt: row.scheduledEndAt,
        assignedUids: row.assignedUids,
        leadId,
        dealId: deal.id,
        deal,
        leads,
        pipelines,
        pipelineId,
        parcelId,
      })
      created += 1
    } catch {
      failed += 1
    }
  }

  return { created, failed }
}
