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

/** Legacy pipe columns used `col-N`; canonical pipes use deal status ids (`open`, …). */
export function isLegacyDealColumnId(statusId) {
  return /^col-\d+$/.test(String(statusId || ''))
}

/**
 * First-stage status for a new deal. Prefer deal-status registry, then pipeline columns.
 * Never falls back to legacy `col-0` (rejected by the pipelines API).
 */
export function resolveInitialDealStatus(columns = [], dealStatuses = []) {
  const fromStatuses = dealStatuses?.[0]?.id
  if (fromStatuses && !isLegacyDealColumnId(fromStatuses)) return fromStatuses
  const fromColumns = columns?.[0]?.id
  if (fromColumns && !isLegacyDealColumnId(fromColumns)) return fromColumns
  return 'open'
}

/** Remap deals whose status is missing or a legacy col-N id onto an allowed first stage. */
export function sanitizeDealStatuses(deals, columns = [], dealStatuses = []) {
  const allowed = new Set(
    (dealStatuses?.length ? dealStatuses : columns || [])
      .map((row) => row?.id)
      .filter((id) => id && !isLegacyDealColumnId(id)),
  )
  if (allowed.size === 0) allowed.add('open')
  const fallback = resolveInitialDealStatus(columns, dealStatuses)
  const now = Date.now()
  return (deals || []).map((deal) => {
    const status = String(deal?.status || '')
    if (allowed.has(status)) return deal
    return {
      ...deal,
      status: fallback,
      statusEnteredAt: now,
      cumulativeTimeByStatus: {},
      updatedAt: now,
    }
  })
}

export function buildDealFromLead(lead, columns, pipelineId = null, overrides = {}) {
  if (!lead?.id) return null
  const status = overrides.status || resolveInitialDealStatus(columns, overrides.dealStatuses)
  const now = Date.now()
  const leadName = displayLeadName(lead)
  const leadAddress = lead.address || ''
  const defaultTitle = `${leadName} · ${leadAddress}`.slice(0, 120)

  return {
    id: `deal_${now}_${Math.random().toString(36).slice(2, 9)}`,
    leadId: lead.id,
    title: (overrides.title ?? '').trim() || defaultTitle,
    status,
    statusEnteredAt: now,
    cumulativeTimeByStatus: {},
    notes: (overrides.notes ?? '').trim(),
    payments: normalizeDealLineItems(overrides.payments),
    costs: normalizeDealLineItems(overrides.costs),
    tasks: [],
    files: [],
    photos: [],
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

/** O(deals) map for lead list rendering — avoids per-lead pipeline scans. */
export function buildDealCountByLeadId(pipelines) {
  const counts = new Map()
  for (const p of pipelines || []) {
    for (const d of p.deals || []) {
      if (!d?.leadId) continue
      counts.set(d.leadId, (counts.get(d.leadId) || 0) + 1)
    }
  }
  return counts
}

export function findDealInPipelines(pipelines, dealId) {
  if (dealId == null || dealId === '') return { deal: null, pipeline: null }
  const want = String(dealId)
  for (const p of pipelines || []) {
    const deal = (p.deals || []).find((d) => String(d.id) === want)
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
