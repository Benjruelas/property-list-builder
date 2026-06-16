import { leadTaskKey } from './leadTasks'
import { flattenPipelineTasks } from './pipelineTasks'
import { flattenTeamTasks } from './teamTaskUtils'
import { findDealsForLead } from './deals'
import { loadDeals } from './dealPipeline'
import { buildVisibleTaskListFresh } from './taskListSync'

/** Where a task list is rendered — controls filtering. */
export const TASK_LIST_SCOPE = {
  ALL: 'all',
  LEAD: 'lead',
  DEAL: 'deal',
}

function taskHasTitle(task) {
  return !!(task?.title ?? '').toString().trim()
}

/** Open tasks first — used where completed/incomplete are in separate sections. */
export function sortTasks(a, b) {
  if (a.completed !== b.completed) return a.completed ? 1 : -1
  const aSched = a.scheduledAt ?? a.dueAt ?? 0
  const bSched = b.scheduledAt ?? b.dueAt ?? 0
  if (aSched && bSched) return aSched - bSched
  return (b.createdAt || 0) - (b.createdAt || 0)
}

/** Stable order for deal-scoped lists — toggling complete does not move rows. */
function compareTasksStable(a, b) {
  const aSched = a.scheduledAt ?? a.dueAt ?? 0
  const bSched = b.scheduledAt ?? b.dueAt ?? 0
  if (aSched && bSched && aSched !== bSched) return aSched - bSched
  if (aSched && !bSched) return -1
  if (!aSched && bSched) return 1
  const aCreated = a.createdAt || 0
  const bCreated = b.createdAt || 0
  if (aCreated !== bCreated) return aCreated - bCreated
  return String(a.id).localeCompare(String(b.id))
}

export function sortTasksStable(a, b) {
  return compareTasksStable(a, b)
}

/** All deals for a lead (API pipelines or local storage), including parcel-only deal links. */
export function resolveLeadDeals(lead, pipelines = []) {
  if (!lead?.id) return []
  if (Array.isArray(pipelines) && pipelines.length > 0) {
    const byLeadId = findDealsForLead(pipelines, lead.id)
    if (byLeadId.length > 0) return byLeadId
    if (lead.parcelId) {
      return pipelines.flatMap((p) =>
        (p.deals || [])
          .filter((d) => String(d.parcelId) === String(lead.parcelId))
          .map((d) => ({
            ...d,
            __pipelineId: p.id,
            __pipelineTitle: p.title || 'Pipes',
          }))
      )
    }
    return []
  }
  return loadDeals()
    .filter((d) => d.leadId === lead.id || (lead.parcelId && String(d.parcelId) === String(lead.parcelId)))
    .map((d) => ({ ...d, __pipelineId: d.pipelineId || null, __pipelineTitle: 'Pipes' }))
}

/** @deprecated Use resolveLeadDeals — kept for callers passing leadId only. */
export function findDealsForLeadId(leadId, pipelines = []) {
  if (!leadId) return []
  return resolveLeadDeals({ id: leadId }, pipelines)
}

/**
 * Task belongs to a specific deal when dealId matches exactly.
 */
export function taskMatchesDeal(task, deal) {
  if (!deal?.id || !task) return false
  return task.dealId === deal.id
}

/**
 * Task belongs to a lead when explicitly linked via leadId, dealId (on one of the lead's deals),
 * or parcelId (lead-level tasks with no deal).
 */
export function taskMatchesLead(task, lead, pipelines = []) {
  if (!lead?.id || !task) return false

  if (task.leadId === lead.id) return true

  if (task.dealId) {
    const deals = resolveLeadDeals(lead, pipelines)
    return deals.some((d) => d.id === task.dealId)
  }

  if (task.leadId && task.leadId !== lead.id) return false

  const key = leadTaskKey(lead)
  if (!key || task.parcelId == null) return false
  return (
    String(task.parcelId) === String(key) ||
    (lead.parcelId && String(task.parcelId) === String(lead.parcelId))
  )
}

/**
 * Filter a merged task list for the panel context.
 * - ALL: Tasks panel / schedule — every visible task
 * - LEAD: Lead detail — tasks linked to this lead
 * - DEAL: Deal detail — tasks linked to this deal
 */
export function filterTasksForScope(tasks, scope, { lead, deal, pipelines } = {}) {
  const list = (tasks || []).filter(taskHasTitle)
  if (!scope || scope === TASK_LIST_SCOPE.ALL) return list
  if (scope === TASK_LIST_SCOPE.LEAD && lead) {
    return list.filter((t) => taskMatchesLead(t, lead, pipelines))
  }
  if (scope === TASK_LIST_SCOPE.DEAL && deal) {
    return list.filter((t) => taskMatchesDeal(t, deal))
  }
  return list
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
  return filterTasksForScope(collectAllTasks(pipelines, getters), TASK_LIST_SCOPE.DEAL, { deal })
    .sort(compareTasksStable)
}

/** Fresh pipeline fetch + server tasks — use when opening deal/lead detail after Tasks panel edits. */
export async function collectTasksForDealFresh(deal, pipelines, { getToken, teams } = {}) {
  if (!deal?.id) return []
  const merged = await buildVisibleTaskListFresh({ pipelines, getToken, teams })
  return filterTasksForScope(merged, TASK_LIST_SCOPE.DEAL, { deal }).sort(compareTasksStable)
}

export async function collectTasksForLeadFresh(lead, pipelines, { getToken, teams } = {}) {
  if (!lead?.id) return []
  const merged = await buildVisibleTaskListFresh({ pipelines, getToken, teams })
  return filterTasksForScope(merged, TASK_LIST_SCOPE.LEAD, { lead, pipelines }).sort(sortTasks)
}

export function collectTasksForLead(lead, pipelines, getters) {
  if (!lead?.id) return []
  return filterTasksForScope(collectAllTasks(pipelines, getters), TASK_LIST_SCOPE.LEAD, { lead, pipelines })
    .sort(sortTasks)
}

/**
 * Group a lead's tasks under their deal. Tasks without a dealId (or with unknown dealId) go to unassigned.
 */
export function groupLeadTasksByDeal(tasks, leadId, pipelines = [], lead = null) {
  const deals = resolveLeadDeals(lead || { id: leadId }, pipelines).sort((a, b) =>
    (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)
  )
  const dealById = new Map(deals.map((d) => [d.id, d]))

  const groups = deals.map((deal) => ({
    deal,
    label: (deal.title || deal.leadName || 'Untitled deal').trim(),
    tasks: tasks.filter((t) => t.dealId === deal.id).sort(compareTasksStable),
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
      tasks: orphanTasks.sort(compareTasksStable),
    })
  }

  const unassigned = tasks
    .filter((t) => !t.dealId)
    .sort(compareTasksStable)

  return {
    groups: groups.filter((g) => g.tasks.length > 0),
    unassigned,
  }
}
