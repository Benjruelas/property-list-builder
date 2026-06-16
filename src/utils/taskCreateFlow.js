/**
 * Shared helpers for creating tasks with optional lead, deal, and team assignees.
 */

import { findDealInPipelines } from './deals'
import { createTeamTask } from './tasks'
import { leadTaskKey } from './leadTasks'

/** Find a lead by parcel id or lead id stored on a task. */
export function findLeadByTaskKey(leads, key) {
  if (!key || !Array.isArray(leads)) return null
  const k = String(key)
  return leads.find((l) => String(l.parcelId) === k || String(l.id) === k) || null
}

export function resolveTaskContext({
  leadId = null,
  dealId = null,
  deal = null,
  leads = [],
  pipelines = [],
}) {
  let resolvedLeadId = leadId || deal?.leadId || null
  let lead = resolvedLeadId ? (leads || []).find((l) => l.id === resolvedLeadId) : null
  if (!resolvedLeadId && deal?.parcelId) {
    lead = findLeadByTaskKey(leads, deal.parcelId)
    if (lead?.id) resolvedLeadId = lead.id
  }
  const resolvedDealId = dealId || deal?.id || null
  const parcelId = deal?.parcelId
    ? String(deal.parcelId)
    : (lead ? leadTaskKey(lead) : null)

  let pipelineId = deal?.__pipelineId || null
  if (!pipelineId && resolvedDealId && pipelines?.length) {
    pipelineId = findDealInPipelines(pipelines, resolvedDealId).pipeline?.id || null
  }

  return {
    leadId: resolvedLeadId,
    dealId: resolvedDealId,
    parcelId: parcelId ? String(parcelId) : null,
    pipelineId,
    lead,
    deal,
  }
}

/** Resolve lead/deal picker values when opening edit from an existing task. */
export function resolveTaskFormIdsFromTask(task, leads = [], deals = []) {
  if (!task) return { leadId: null, dealId: null }

  let dealId = task.dealId || null
  let leadId = task.leadId || null

  if (!leadId && task.parcelId) {
    const match = findLeadByTaskKey(leads, task.parcelId)
    if (match?.id) leadId = match.id
  }

  if (dealId) {
    const deal = (deals || []).find((d) => d.id === dealId)
    if (deal) {
      if (!leadId && deal.leadId) leadId = deal.leadId
      if (!leadId && deal.parcelId) {
        const match = findLeadByTaskKey(leads, deal.parcelId)
        if (match?.id) leadId = match.id
      }
    }
  }

  return { leadId: leadId || null, dealId: dealId || null }
}

export function normalizeServerTask(task) {
  if (!task) return null
  const completedAtRaw = task.completedAt
  const completedAt = completedAtRaw
    ? (typeof completedAtRaw === 'number' ? completedAtRaw : new Date(completedAtRaw).getTime())
    : null
  return {
    ...task,
    scheduledAt: task.scheduledAt ?? null,
    scheduledEndAt: task.scheduledEndAt ?? null,
    completed: !!task.completed,
    completedAt,
    __source: 'server',
    assignedUids: Array.isArray(task.assignedUids) ? task.assignedUids.filter(Boolean) : [],
  }
}

/** Create a server-backed team task when assignees are selected. */
export async function createServerAssignedTask(getToken, {
  title,
  scheduledAt = null,
  scheduledEndAt = null,
  assignedUids = [],
  leadId = null,
  dealId = null,
  deal = null,
  leads = [],
  pipelines = [],
  pipelineId = null,
  notes = null,
}) {
  if (!getToken || !assignedUids?.length) return null
  const ctx = resolveTaskContext({ leadId, dealId, deal, leads, pipelines })
  return createTeamTask(getToken, {
    title,
    assignedUids,
    leadId: ctx.leadId,
    dealId: ctx.dealId,
    pipelineId: pipelineId || ctx.pipelineId,
    parcelId: ctx.parcelId,
    scheduledAt,
    scheduledEndAt,
    notes,
  })
}
