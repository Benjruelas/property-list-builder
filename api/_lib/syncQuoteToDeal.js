/**
 * Sync accepted quote lines to linked deal payments + costs in user_pipelines KV.
 *
 * All writes go through the shared, lockable pipeline store (mutatePipelines) so
 * they don't race with pipeline CRUD, team-task updates, or the Stripe webhook.
 */

import { mutatePipelines } from './pipelineStoreFull.js'

function upsertLineItem(rows, { id, name, amount, settled, sourceQuoteId, lineItemId }) {
  const list = Array.isArray(rows) ? rows.map((r) => ({ ...r })) : []
  const idx = lineItemId ? list.findIndex((r) => r.id === lineItemId) : -1
  const entry = {
    id: lineItemId || id || `item_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    name: String(name || 'Line item').slice(0, 200),
    amount: Number(amount) || 0,
    settled: !!settled,
  }
  if (sourceQuoteId) entry.sourceQuoteId = sourceQuoteId
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...entry, settled: list[idx].settled && settled ? list[idx].settled : settled }
    if (list[idx].settledAt) entry.settledAt = list[idx].settledAt
    list[idx] = { ...list[idx], ...entry }
  } else {
    list.push(entry)
  }
  return list
}

/**
 * Mirror accepted quote lines to deal on client accept.
 * @param {object} quote — must include acceptedLineIds
 */
export async function syncQuoteToDealOnAccept(quote) {
  const { pipelineId, dealId, id: quoteId, acceptedLineIds = [], lineItems = [] } = quote || {}
  if (!pipelineId || !dealId || !quoteId) return { ok: false, reason: 'missing_ids' }

  const acceptedSet = new Set(acceptedLineIds)
  const acceptedLines = (lineItems || []).filter((l) => acceptedSet.has(l.id))
  if (!acceptedLines.length) return { ok: false, reason: 'no_accepted_lines' }

  let outcome = { ok: false, reason: 'pipeline_not_found' }
  await mutatePipelines((all) => {
    const pIdx = all.findIndex((p) => p.id === pipelineId)
    if (pIdx === -1) { outcome = { ok: false, reason: 'pipeline_not_found' }; return undefined }

    const pipeline = { ...all[pIdx] }
    const deals = Array.isArray(pipeline.deals) ? pipeline.deals.map((d) => ({ ...d })) : []
    const dIdx = deals.findIndex((d) => d.id === dealId)
    if (dIdx === -1) { outcome = { ok: false, reason: 'deal_not_found' }; return undefined }

    const deal = { ...deals[dIdx] }
    let payments = (deal.payments || []).filter((p) => p?.sourceQuoteId !== quoteId)
    let costs = (deal.costs || []).filter((c) => c?.sourceQuoteId !== quoteId)

    for (const line of acceptedLines) {
      const qty = Math.max(0, Number(line.quantity) || 1)
      const sell = Number(line.amount) || 0
      const cost = Math.round(qty * (Number(line.unitCost) || 0) * 100) / 100
      const label = line.name || 'Service'

      payments = upsertLineItem(payments, {
        lineItemId: line.dealPaymentLineItemId,
        name: label,
        amount: sell,
        settled: false,
        sourceQuoteId: quoteId,
      })
      costs = upsertLineItem(costs, {
        lineItemId: line.dealCostLineItemId,
        name: `${label} (cost)`,
        amount: cost,
        settled: false,
        sourceQuoteId: quoteId,
      })
    }

    deal.payments = payments
    deal.costs = costs
    deal.updatedAt = Date.now()
    deals[dIdx] = deal
    pipeline.deals = deals
    pipeline.updatedAt = new Date().toISOString()
    const next = [...all]
    next[pIdx] = pipeline
    outcome = { ok: true, deal }
    return next
  })
  return outcome
}

/**
 * Mark payment rows settled when quote is paid.
 */
export async function syncQuotePaymentOnPaid(quote) {
  const { pipelineId, dealId, id: quoteId, acceptedLineIds = [] } = quote || {}
  if (!pipelineId || !dealId || !quoteId) return { ok: false, reason: 'missing_ids' }

  let outcome = { ok: false, reason: 'pipeline_not_found' }
  await mutatePipelines((all) => {
    const pIdx = all.findIndex((p) => p.id === pipelineId)
    if (pIdx === -1) { outcome = { ok: false, reason: 'pipeline_not_found' }; return undefined }

    const pipeline = { ...all[pIdx] }
    const deals = Array.isArray(pipeline.deals) ? pipeline.deals.map((d) => ({ ...d })) : []
    const dIdx = deals.findIndex((d) => d.id === dealId)
    if (dIdx === -1) { outcome = { ok: false, reason: 'deal_not_found' }; return undefined }

    const deal = { ...deals[dIdx] }
    const now = quote.paidAt || new Date().toISOString()
    deal.payments = (deal.payments || []).map((p) => {
      if (p?.sourceQuoteId === quoteId) {
        return { ...p, settled: true, settledAt: now, sourceQuoteId: quoteId }
      }
      return p
    })
    deal.updatedAt = Date.now()
    deals[dIdx] = deal
    pipeline.deals = deals
    pipeline.updatedAt = new Date().toISOString()
    const next = [...all]
    next[pIdx] = pipeline
    outcome = { ok: true, deal }
    return next
  })
  return outcome
}

/** @deprecated use syncQuotePaymentOnPaid */
export async function syncQuotePaymentToDeal(params) {
  return syncQuotePaymentOnPaid({
    pipelineId: params.pipelineId,
    dealId: params.dealId,
    id: params.quoteId,
    paidAt: params.paidAt,
    acceptedLineIds: [],
  })
}
