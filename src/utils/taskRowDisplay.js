import { displayLeadName } from './leads'
import {
  formatTaskCompletedDate,
  formatTaskScheduledDate,
  getTaskDueTimestamp,
} from './leadTasks'

export { getTaskDueTimestamp }

export function taskHasLeadLink(task) {
  return !!(task?.parcelId || task?.leadId)
}

export function taskHasDealLink(task) {
  return !!task?.dealId
}

export function isSharedTask(task) {
  return task?.__source === 'team' || task?.__source === 'server'
}

export function resolveTaskLeadLabel(task, displayLeads = []) {
  if (!taskHasLeadLink(task)) return null
  const lead = task.parcelId
    ? displayLeads.find((l) => l.parcelId === task.parcelId || l.id === task.parcelId)
    : (task.leadId ? displayLeads.find((l) => l.id === task.leadId) : null)
  if (lead) return displayLeadName(lead) || lead.address || null
  return task.leadId || task.parcelId || null
}

export function resolveTaskDealLabel(task, allDeals = []) {
  if (!task?.dealId) return null
  const deal = allDeals.find((d) => d.id === task.dealId)
  return (deal?.title || deal?.leadName || deal?.leadAddress || 'Deal').trim()
}

export function formatTaskDueLabel(task) {
  const dueAt = getTaskDueTimestamp(task)
  if (dueAt == null) return null
  return formatTaskScheduledDate(dueAt)
}

export function formatTaskCompletedLabel(task) {
  if (task?.completedAt == null) return null
  return `Completed ${formatTaskCompletedDate(task.completedAt)}`
}

/**
 * Which secondary fields to show under the task title.
 * @param {TaskRowContext} context
 */
export function getTaskRowDisplayFields(task, context, { displayLeads = [], allDeals = [] } = {}) {
  const leadLabel = resolveTaskLeadLabel(task, displayLeads)
  const dealLabel = resolveTaskDealLabel(task, allDeals)
  const shared = isSharedTask(task)
  const dueLabel = task?.completed ? formatTaskCompletedLabel(task) : formatTaskDueLabel(task)
  const dueAt = getTaskDueTimestamp(task)
  const overdue = !task?.completed && dueAt != null && dueAt < Date.now()

  if (context === 'minimal') {
    return { showShared: false, leadLabel: null, dealLabel: null, dueLabel, overdue }
  }

  if (context === 'lead') {
    return {
      showShared: false,
      leadLabel: null,
      dealLabel: taskHasDealLink(task) ? dealLabel : null,
      dueLabel,
      overdue,
    }
  }

  if (context === 'deal') {
    return {
      showShared: false,
      leadLabel: !taskHasDealLink(task) && taskHasLeadLink(task) ? leadLabel : null,
      dealLabel: null,
      dueLabel,
      overdue,
    }
  }

  return {
    showShared: shared,
    leadLabel: taskHasLeadLink(task) ? leadLabel : null,
    dealLabel: taskHasDealLink(task) ? dealLabel : null,
    dueLabel,
    overdue,
  }
}
