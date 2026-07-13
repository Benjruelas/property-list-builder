/**
 * Sync paid quote to linked deal payment line item in user_pipelines KV.
 *
 * Writes go through the shared, lockable pipeline store so they don't race with
 * concurrent pipeline edits or the Stripe webhook.
 */

import { mutatePipelines } from './pipelineStoreFull.js'

/**
 * @param {{ pipelineId: string, dealId: string, paymentLineItemId?: string, quoteId: string, amount?: number, paidAt?: string }} params
 */
export async function syncQuotePaymentToDeal(params) {
  const { pipelineId, dealId, paymentLineItemId, quoteId, amount, paidAt } = params || {}
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
    const payments = Array.isArray(deal.payments) ? deal.payments.map((p) => ({ ...p })) : []
    const now = paidAt || new Date().toISOString()

    let pIdx2 = -1
    if (paymentLineItemId) {
      pIdx2 = payments.findIndex((p) => p.id === paymentLineItemId)
    }
    if (pIdx2 === -1 && amount != null) {
      pIdx2 = payments.findIndex((p) => Math.abs(Number(p.amount) - Number(amount)) < 0.01)
    }
    if (pIdx2 === -1 && payments.length === 1) {
      pIdx2 = 0
    }

    if (pIdx2 >= 0) {
      payments[pIdx2] = {
        ...payments[pIdx2],
        settled: true,
        settledAt: now,
        sourceQuoteId: quoteId,
      }
    } else {
      payments.push({
        id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        name: 'Quote payment',
        amount: amount || 0,
        settled: true,
        settledAt: now,
        sourceQuoteId: quoteId,
      })
    }

    deal.payments = payments
    deal.updatedAt = Date.now()
    deals[dIdx] = deal
    pipeline.deals = deals
    pipeline.updatedAt = new Date().toISOString()
    const next = [...all]
    next[pIdx] = pipeline
    outcome = { ok: true, deal, payment: payments[pIdx2 >= 0 ? pIdx2 : payments.length - 1] }
    return next
  })
  return outcome
}
