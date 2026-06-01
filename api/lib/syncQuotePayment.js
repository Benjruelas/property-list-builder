/**
 * Sync paid quote to linked deal payment line item in user_pipelines KV.
 */

let kv = null
let kvAvailable = false

if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  try {
    const kvModule = await import('@vercel/kv')
    kv = kvModule.kv
    kvAvailable = true
  } catch {
    kvAvailable = false
  }
} else if (process.env.REDIS_URL) {
  try {
    const { createClient } = await import('redis')
    kv = createClient({ url: process.env.REDIS_URL })
    await kv.connect()
    kvAvailable = true
  } catch {
    kvAvailable = false
  }
}

const PIPELINES_KV_KEY = 'user_pipelines'

async function getAllPipelines() {
  if (!kvAvailable || !kv) return []
  try {
    const data = await kv.get(PIPELINES_KV_KEY)
    const parsed = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function saveAllPipelines(pipelines) {
  if (!kvAvailable || !kv) return false
  try {
    await kv.set(PIPELINES_KV_KEY, pipelines).catch(() =>
      kv.set(PIPELINES_KV_KEY, JSON.stringify(pipelines))
    )
    return true
  } catch (e) {
    console.warn('syncQuotePayment pipeline save failed', e.message)
    return false
  }
}

/**
 * @param {{ pipelineId: string, dealId: string, paymentLineItemId?: string, quoteId: string, amount?: number, paidAt?: string }} params
 */
export async function syncQuotePaymentToDeal(params) {
  const { pipelineId, dealId, paymentLineItemId, quoteId, amount, paidAt } = params || {}
  if (!pipelineId || !dealId || !quoteId) return { ok: false, reason: 'missing_ids' }

  const all = await getAllPipelines()
  const pIdx = all.findIndex((p) => p.id === pipelineId)
  if (pIdx === -1) return { ok: false, reason: 'pipeline_not_found' }

  const pipeline = all[pIdx]
  const deals = Array.isArray(pipeline.deals) ? pipeline.deals : []
  const dIdx = deals.findIndex((d) => d.id === dealId)
  if (dIdx === -1) return { ok: false, reason: 'deal_not_found' }

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
  all[pIdx] = pipeline

  const saved = await saveAllPipelines(all)
  return { ok: saved, deal, payment: payments[pIdx2 >= 0 ? pIdx2 : payments.length - 1] }
}
