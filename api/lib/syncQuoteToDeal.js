/**
 * Sync accepted quote lines to linked deal payments + costs in user_pipelines KV.
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
    console.warn('syncQuoteToDeal pipeline save failed', e.message)
    return false
  }
}

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

  const all = await getAllPipelines()
  const pIdx = all.findIndex((p) => p.id === pipelineId)
  if (pIdx === -1) return { ok: false, reason: 'pipeline_not_found' }

  const pipeline = { ...all[pIdx] }
  const deals = Array.isArray(pipeline.deals) ? pipeline.deals.map((d) => ({ ...d })) : []
  const dIdx = deals.findIndex((d) => d.id === dealId)
  if (dIdx === -1) return { ok: false, reason: 'deal_not_found' }

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
  all[pIdx] = pipeline

  const saved = await saveAllPipelines(all)
  return { ok: saved, deal }
}

/**
 * Mark payment rows settled when quote is paid.
 */
export async function syncQuotePaymentOnPaid(quote) {
  const { pipelineId, dealId, id: quoteId, acceptedLineIds = [] } = quote || {}
  if (!pipelineId || !dealId || !quoteId) return { ok: false, reason: 'missing_ids' }

  const all = await getAllPipelines()
  const pIdx = all.findIndex((p) => p.id === pipelineId)
  if (pIdx === -1) return { ok: false, reason: 'pipeline_not_found' }

  const pipeline = { ...all[pIdx] }
  const deals = Array.isArray(pipeline.deals) ? pipeline.deals.map((d) => ({ ...d })) : []
  const dIdx = deals.findIndex((d) => d.id === dealId)
  if (dIdx === -1) return { ok: false, reason: 'deal_not_found' }

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
  all[pIdx] = pipeline

  const saved = await saveAllPipelines(all)
  return { ok: saved, deal }
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
