import { leadTaskKey } from './leadTasks'
import { flattenPipelineTasks } from './pipelineTasks'
import { flattenTeamTasks } from './teamTaskUtils'
import { findDealsForLead } from './deals'
import { loadDeals } from './dealPipeline'

export function sortTasks(a, b) {
  if (a.completed !== b.completed) return a.completed ? 1 : -1
  const aSched = a.scheduledAt ?? a.dueAt ?? 0
  const bSched = b.scheduledAt ?? b.dueAt ?? 0
  if (aSched && bSched) return aSched - bSched
  return (b.createdAt || 0) - (b.createdAt || 0)
}

/** All deals for a lead (API pipelines or local storage). */
export function findDealsForLeadId(leadId, pipelines = []) {
  if (!leadId) return []
  if (Array.isArray(pipelines) && pipelines.length > 0) {
    return findDealsForLead(pipelines, leadId)
  }
  return loadDeals()
    .filter((d) => d.leadId === leadId)
    .map((d) => ({ ...d, __pipelineId: d.pipelineId || null, __pipelineTitle: 'Pipes' }))
}

/**
 * Task belongs to a specific deal when dealId matches exactly.
 */
export function taskMatchesDeal(task, deal) {
  if (!deal?.id || !task) return false
  return task.dealId === deal.id
}

export function taskMatchesLead(task, lead, pipelines = []) {
  const key = leadTaskKey(lead)
  if (!key || !task) return false

  if (task.dealId) {
    const deals = findDealsForLeadId(lead.id, pipelines)
    if (deals.some((d) => d.id === task.dealId)) return true
  }

  if (task.__source === 'team') {
    return task.leadId === lead.id || task.parcelId === key || task.parcelId === lead.parcelId
  }

  return task.parcelId === key || task.parcelId === lead.parcelId || task.parcelId === lead.id
}

export function collectAllTasks(pipelines, { getPersonalTasks, getAllTasks, flattenTeamTasksFn = flattenTeamTasks }) {
  const apiMode = Array.isArray(pipelines) && pipelines.length > 0
  if (apiMode) {
    return [...getPersonalTasks(), ...flattenPipelineTasks(pipelines), ...flattenTeamTasksFn(pipelines)]
  }
  return getAllTasks()
}

export function collectTasksForDeal(deal, pipelines, getters) {
  if (!deal?.id) return []
  return collectAllTasks(pipelines, getters)
    .filter((t) => (t.title ?? '').toString().trim() && taskMatchesDeal(t, deal))
    .sort(sortTasks)
}

export function collectTasksForLead(lead, pipelines, getters) {
  if (!lead?.id) return []
  return collectAllTasks(pipelines, getters)
    .filter((t) => (t.title ?? '').toString().trim() && taskMatchesLead(t, lead, pipelines))
    .sort(sortTasks)
}

/**
 * Group a lead's tasks under their deal. Tasks without a dealId (or with unknown dealId) go to unassigned.
 */
export function groupLeadTasksByDeal(tasks, leadId, pipelines = []) {
  const deals = findDealsForLeadId(leadId, pipelines).sort((a, b) =>
    (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)
  )
  const dealById = new Map(deals.map((d) => [d.id, d]))

  const groups = deals.map((deal) => ({
    deal,
    label: (deal.title || deal.leadName || 'Untitled deal').trim(),
    tasks: tasks.filter((t) => t.dealId === deal.id).sort(sortTasks),
  }))

  const knownDealIds = new Set(deals.map((d) => d.id))
  const orphanByDealId = new Map()

  for (const task of tasks) {
    if (!task.dealId || knownDealIds.has(task.dealId)) continue
    if (!orphanByDealId.has(task.dealId)) orphanByDealId.set(task.dealId, [])
    orphanByDealId.get(task.dealId).push(task)
  }

  for (const [dealId, orphanTasks] of orphanByDealId) {
    groups.push({
      deal: { id: dealId, title: 'Deal' },
      label: 'Deal',
      tasks: orphanTasks.sort(sortTasks),
    })
  }

  const unassigned = tasks
    .filter((t) => !t.dealId)
    .sort(sortTasks)

  return {
    groups: groups.filter((g) => g.tasks.length > 0),
    unassigned,
  }
}
