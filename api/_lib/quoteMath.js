/**
 * Quote line items and totals (shared server + client).
 */

export function parseQuoteAmount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const n = parseFloat(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function computeLineSellUnitPrice(item) {
  const unitCost = parseQuoteAmount(item?.unitCost)
  const markup = Math.max(0, parseQuoteAmount(item?.markupPercent))
  if (item?.priceOverridden) {
    return parseQuoteAmount(item?.unitPrice)
  }
  return Math.round(unitCost * (1 + markup / 100) * 100) / 100
}

export function computeLineAmounts(item) {
  const quantity = Math.max(0, parseQuoteAmount(item?.quantity) || 1)
  const unitCost = parseQuoteAmount(item?.unitCost)
  const unitPrice = computeLineSellUnitPrice(item)
  let amount = parseQuoteAmount(item?.amount)
  if (!item?.priceOverridden || !amount) {
    amount = Math.round(quantity * unitPrice * 100) / 100
  }
  const costTotal = Math.round(quantity * unitCost * 100) / 100
  const margin = Math.round((amount - costTotal) * 100) / 100
  const marginPercent = costTotal > 0 ? Math.round((margin / costTotal) * 10000) / 100 : 0
  return { quantity, unitCost, unitPrice, amount, costTotal, margin, marginPercent }
}

export function isLineIncluded(item, selectedOptionalIds = null) {
  if (!item?.isOptional) return true
  if (selectedOptionalIds === null) return false
  return selectedOptionalIds.includes(item.id)
}

export function createQuoteLineItem(overrides = {}) {
  const base = {
    id: overrides.id || `qli_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    name: String(overrides.name || '').slice(0, 200),
    description: String(overrides.description || '').slice(0, 1000),
    quantity: Math.max(0, parseQuoteAmount(overrides.quantity) || 1),
    unitCost: parseQuoteAmount(overrides.unitCost),
    markupPercent: Math.max(0, parseQuoteAmount(overrides.markupPercent)),
    priceOverridden: !!overrides.priceOverridden,
    unitPrice: parseQuoteAmount(overrides.unitPrice),
    amount: parseQuoteAmount(overrides.amount),
    isOptional: !!overrides.isOptional,
    hidePriceFromClient: !!overrides.hidePriceFromClient,
    showCostFields: overrides.showCostFields !== false,
    dealPaymentLineItemId: overrides.dealPaymentLineItemId || null,
    dealCostLineItemId: overrides.dealCostLineItemId || null,
  }
  const computed = computeLineAmounts(base)
  return {
    ...base,
    unitPrice: base.priceOverridden ? base.unitPrice : computed.unitPrice,
    amount: computed.amount,
  }
}

export function normalizeQuoteLineItems(items) {
  if (!Array.isArray(items)) return []
  return items
    .map((item) => {
      const quantity = Math.max(0, parseQuoteAmount(item?.quantity) || 1)
      const unitCost = parseQuoteAmount(item?.unitCost)
      const markupPercent = Math.max(0, parseQuoteAmount(item?.markupPercent))
      const priceOverridden = !!item?.priceOverridden
      const draft = {
        id: item?.id || createQuoteLineItem().id,
        name: String(item?.name ?? '').trim().slice(0, 200),
        description: String(item?.description ?? '').trim().slice(0, 1000),
        quantity,
        unitCost,
        markupPercent,
        priceOverridden,
        unitPrice: parseQuoteAmount(item?.unitPrice),
        amount: parseQuoteAmount(item?.amount),
        isOptional: !!item?.isOptional,
        hidePriceFromClient: !!item?.hidePriceFromClient,
        showCostFields: item?.showCostFields !== false,
        dealPaymentLineItemId: item?.dealPaymentLineItemId || null,
        dealCostLineItemId: item?.dealCostLineItemId || null,
      }
      const computed = computeLineAmounts(draft)
      return {
        ...draft,
        unitPrice: priceOverridden ? draft.unitPrice : computed.unitPrice,
        amount: priceOverridden && draft.amount ? draft.amount : computed.amount,
      }
    })
    .filter((item) => item.name || item.amount !== 0 || item.unitCost !== 0)
}

export function applyGlobalMarkup(lineItems, markupPercent) {
  const rate = Math.max(0, parseQuoteAmount(markupPercent))
  return normalizeQuoteLineItems(
    (lineItems || []).map((item) => {
      if (item?.priceOverridden) return item
      return { ...item, markupPercent: rate }
    })
  )
}

export function computeQuoteTotals(lineItems, taxRate = 0, { selectedOptionalIds = null } = {}) {
  const items = normalizeQuoteLineItems(lineItems)
  const included = items.filter((item) => isLineIncluded(item, selectedOptionalIds))
  const subtotal = included.reduce((sum, item) => sum + parseQuoteAmount(item.amount), 0)
  const rate = Math.max(0, parseQuoteAmount(taxRate))
  const taxAmount = Math.round(subtotal * (rate / 100) * 100) / 100
  const total = Math.round((subtotal + taxAmount) * 100) / 100
  return { lineItems: items, subtotal, taxRate: rate, taxAmount, total, includedLineIds: included.map((i) => i.id) }
}

export function computeQuoteProfitSummary(lineItems, { selectedOptionalIds = null } = {}) {
  const items = normalizeQuoteLineItems(lineItems)
  let totalCost = 0
  let totalSell = 0
  for (const item of items) {
    if (!isLineIncluded(item, selectedOptionalIds)) continue
    const { costTotal, amount } = computeLineAmounts(item)
    totalCost += costTotal
    totalSell += amount
  }
  totalCost = Math.round(totalCost * 100) / 100
  totalSell = Math.round(totalSell * 100) / 100
  const profit = Math.round((totalSell - totalCost) * 100) / 100
  const marginPercent = totalCost > 0 ? Math.round((profit / totalCost) * 10000) / 100 : 0
  return { totalCost, totalSell, profit, marginPercent }
}

export function resolveAcceptedLineIds(lineItems, selectedOptionalIds = []) {
  const items = normalizeQuoteLineItems(lineItems)
  const optionalSet = new Set((selectedOptionalIds || []).filter(Boolean))
  return items
    .filter((item) => !item.isOptional || optionalSet.has(item.id))
    .map((item) => item.id)
}

export function publicQuoteLineItem(item) {
  if (!item) return null
  const base = {
    id: item.id,
    name: item.name,
    description: item.description,
    quantity: item.quantity,
    isOptional: !!item.isOptional,
  }
  if (item.hidePriceFromClient) return base
  return {
    ...base,
    unitPrice: item.unitPrice,
    amount: item.amount,
  }
}

export const QUOTE_STATUSES = new Set([
  'draft',
  'sent',
  'viewed',
  'accepted',
  'declined',
  'change_requested',
  'paid',
  'expired',
])

export function normalizeQuoteStatus(status) {
  const s = String(status || 'draft').toLowerCase()
  return QUOTE_STATUSES.has(s) ? s : 'draft'
}

export function defaultValidUntil(days = 30) {
  const d = new Date()
  d.setDate(d.getDate() + Math.max(1, parseInt(days, 10) || 30))
  return d.toISOString().slice(0, 10)
}
