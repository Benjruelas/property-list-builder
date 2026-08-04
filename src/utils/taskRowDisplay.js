import { displayLeadName } from './leads'
import {
  formatTaskCompletedDate,
  formatTaskScheduledDate,
  getTaskDueTimestamp,
} from './leadTasks'

export { getTaskDueTimestamp }

function sameId(a, b) {
  if (a == null || b == null) return false
  return String(a) === String(b)
}

function findDealForTask(task, allDeals = []) {
  if (!task?.dealId) return null
  return allDeals.find((d) => sameId(d.id, task.dealId)) || null
}

function humanDealLabel(deal) {
  if (!deal) return null
  const title = (deal.title || '').trim()
  // Prefer a real title; ignore titles that are just the backend id.
  if (title && !sameId(title, deal.id)) return title
  const leadName = (deal.leadName || '').trim()
  if (leadName) return leadName
  const leadAddress = (deal.leadAddress || '').trim()
  if (leadAddress) return leadAddress
  return null
}

export function taskHasLeadLink(task) {
  return !!(task?.parcelId || task?.leadId)
}

export function taskHasDealLink(task) {
  return !!task?.dealId
}

export function isSharedTask(task) {
  return task?.__source === 'team' || task?.__source === 'server'
}

export function resolveTaskLeadLabel(task, displayLeads = [], allDeals = []) {
  if (!taskHasLeadLink(task) && !taskHasDealLink(task)) return null

  const lead = task.parcelId
    ? displayLeads.find((l) => sameId(l.parcelId, task.parcelId) || sameId(l.id, task.parcelId))
    : (task.leadId ? displayLeads.find((l) => sameId(l.id, task.leadId)) : null)
  if (lead) {
    const name = (displayLeadName(lead) || lead.address || '').trim()
    if (name && name !== 'Unknown') return name
  }

  // When the lead record isn't loaded, use denormalized deal fields — never raw ids.
  const deal = findDealForTask(task, allDeals)
  const fromDeal = (deal?.leadName || deal?.leadAddress || '').trim()
  return fromDeal || null
}

export function resolveTaskDealLabel(task, allDeals = []) {
  if (!task?.dealId) return null
  return humanDealLabel(findDealForTask(task, allDeals))
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
  const leadLabel = resolveTaskLeadLabel(task, displayLeads, allDeals)
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

  // Panel: Lead + Deal icons only — hide the shared Users icon when entity links are present.
  const hasEntityLink = taskHasLeadLink(task) || taskHasDealLink(task)
  return {
    showShared: shared && !hasEntityLink,
    leadLabel: taskHasLeadLink(task) || taskHasDealLink(task) ? leadLabel : null,
    dealLabel: taskHasDealLink(task) ? dealLabel : null,
    dueLabel,
    overdue,
  }
}

/** Compact title + lead/deal line for schedule calendar cells. */
export function getScheduleTaskDisplay(task, { displayLeads = [], allDeals = [] } = {}) {
  const { leadLabel, dealLabel, showShared } = getTaskRowDisplayFields(task, 'panel', {
    displayLeads,
    allDeals,
  })
  const title = (task?.title || '').trim() || '(untitled)'
  const contextParts = []
  if (leadLabel) contextParts.push(leadLabel)
  if (dealLabel) contextParts.push(dealLabel)
  const contextLabel = contextParts.length > 0 ? contextParts.join(' · ') : (showShared ? 'Team task' : null)
  const tooltip = contextLabel ? `${title} · ${contextLabel}` : title
  return { title, contextLabel, tooltip }
}
