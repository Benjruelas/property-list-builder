/**
 * Deal helpers — create deals, flatten from pipelines, local storage.
 */

import { displayLeadName } from './leads'
import { normalizeDealLineItems } from './dealFinances'

/** Accepts a pipeline id string or a pipeline object from DealDetails callbacks. */
export function resolvePipelineId(pipelineOrId) {
  if (pipelineOrId == null || pipelineOrId === '') return null
  if (typeof pipelineOrId === 'string') return pipelineOrId
  if (typeof pipelineOrId === 'object' && pipelineOrId.id) return pipelineOrId.id
  return null
}

export function buildDealFromLead(lead, columns, pipelineId = null, overrides = {}) {
  if (!lead?.id) return null
  const firstColId = columns?.[0]?.id || 'col-0'
  const now = Date.now()
  const leadName = displayLeadName(lead)
  const leadAddress = lead.address || ''
  const defaultTitle = `${leadName} · ${leadAddress}`.slice(0, 120)

  return {
    id: `deal_${now}_${Math.random().toString(36).slice(2, 9)}`,
    leadId: lead.id,
    title: (overrides.title ?? '').trim() || defaultTitle,
    status: firstColId,
    statusEnteredAt: now,
    cumulativeTimeByStatus: {},
    notes: (overrides.notes ?? '').trim(),
    payments: normalizeDealLineItems(overrides.payments),
    costs: normalizeDealLineItems(overrides.costs),
    tasks: [],
    files: [],
    leadName,
    leadAddress,
    parcelId: lead.parcelId || null,
    createdAt: now,
    updatedAt: now,
    pipelineId: pipelineId || null,
  }
}

export function flattenDealsFromPipelines(pipelines) {
  const out = []
  for (const p of pipelines || []) {
    for (const d of p.deals || []) {
      out.push({
        ...d,
        __pipelineId: p.id,
        __pipelineTitle: p.title || 'Pipes',
        __columns: p.columns || [],
      })
    }
  }
  return out
}

export function findDealsForLead(pipelines, leadId) {
  return flattenDealsFromPipelines(pipelines).filter((d) => d.leadId === leadId)
}

export function findDealInPipelines(pipelines, dealId) {
  for (const p of pipelines || []) {
    const deal = (p.deals || []).find((d) => d.id === dealId)
    if (deal) {
      return { deal, pipeline: p }
    }
  }
  return { deal: null, pipeline: null }
}

export function updateDealInPipeline(deals, dealId, updates) {
  return deals.map((d) => (d.id === dealId ? { ...d, ...updates, updatedAt: Date.now() } : d))
}

export function moveDealStatus(deal, newStatus) {
  const now = Date.now()
  const cum = { ...(deal.cumulativeTimeByStatus || {}) }
  const oldStatus = deal.status
  if (oldStatus && oldStatus !== newStatus) {
    const entered = deal.statusEnteredAt ?? deal.createdAt
    const stint = entered ? Math.max(0, now - entered) : 0
    cum[oldStatus] = (cum[oldStatus] || 0) + stint
  }
  return {
    ...deal,
    status: newStatus,
    statusEnteredAt: now,
    cumulativeTimeByStatus: cum,
    updatedAt: now,
  }
}
