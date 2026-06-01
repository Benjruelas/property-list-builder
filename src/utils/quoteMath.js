/**
 * Quote line items and totals (client-side).
 */

export function parseQuoteAmount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const n = parseFloat(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function formatQuoteMoney(amount) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(parseQuoteAmount(amount))
}

export function profitValueClass(profit) {
  if (profit > 0) return 'deal-profit-positive text-green-600'
  if (profit < 0) return 'deal-profit-negative text-red-400'
  return ''
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
    name: String(overrides.name || ''),
    description: String(overrides.description || ''),
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
        name: String(item?.name ?? '').trim(),
        description: String(item?.description ?? '').trim(),
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

export function defaultValidUntil(days = 30) {
  const d = new Date()
  d.setDate(d.getDate() + Math.max(1, parseInt(days, 10) || 30))
  return d.toISOString().slice(0, 10)
}

export const QUOTE_STATUS_LABELS = {
  draft: 'Draft',
  sent: 'Sent',
  viewed: 'Viewed',
  accepted: 'Accepted',
  declined: 'Declined',
  change_requested: 'Changes requested',
  paid: 'Paid',
  expired: 'Expired',
}

export function quoteStatusClass(status) {
  switch (status) {
    case 'paid':
    case 'accepted':
      return 'quote-status quote-status-success'
    case 'viewed':
    case 'sent':
      return 'quote-status quote-status-info'
    case 'declined':
      return 'quote-status quote-status-danger'
    case 'change_requested':
      return 'quote-status quote-status-warning'
    default:
      return 'quote-status quote-status-muted'
  }
}

export const DEFAULT_QUOTE_TEMPLATE = {
  name: 'Roofing Service Quote',
  title: 'Roofing Service Quote',
  description: 'Standard roofing services quote template',
  lineItems: [
    { name: 'Roof Inspection', description: 'Full property inspection and photo documentation', quantity: 1, unitCost: 150, markupPercent: 67, unitPrice: 250, amount: 250 },
    { name: 'Repair Services', description: 'Labor and materials for identified repairs', quantity: 1, unitCost: 900, markupPercent: 67, unitPrice: 1500, amount: 1500 },
    { name: 'Materials', description: 'Shingles, underlayment, and fasteners', quantity: 1, unitCost: 500, markupPercent: 60, unitPrice: 800, amount: 800 },
  ],
  terms: 'This quote is valid for 30 days from the date issued. Payment is due upon completion unless otherwise agreed in writing. Work will be scheduled after acceptance.',
  notes: '',
  defaultValidDays: 30,
  taxRate: 0,
}
