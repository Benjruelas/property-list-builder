/**
 * Deal payments, costs, and profit helpers.
 * Each line item: { id, name, amount, settled } where amount is a number (USD).
 * `settled` = received (payments) or paid (costs).
 */

export function parseDealAmount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const n = parseFloat(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function formatDealMoney(amount) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(parseDealAmount(amount))
}

export function createDealLineItem(name = '', amount = '') {
  return {
    id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    name,
    amount,
    settled: false,
  }
}

export function normalizeDealLineItems(items) {
  if (!Array.isArray(items)) return []
  return items
    .map((item) => {
      const settled = !!item?.settled
      const out = {
        id: item?.id || createDealLineItem().id,
        name: (item?.name ?? '').toString().trim(),
        amount: parseDealAmount(item?.amount),
        settled,
      }
      if (item?.settledAt) out.settledAt = String(item.settledAt)
      if (item?.sourceQuoteId) out.sourceQuoteId = String(item.sourceQuoteId)
      return out
    })
    .filter((item) => item.name || item.amount !== 0)
}

export function sumDealLineItems(items) {
  return (items || []).reduce((sum, item) => sum + parseDealAmount(item?.amount), 0)
}

export function computeDealProfit(deal) {
  return sumDealLineItems(deal?.payments) - sumDealLineItems(deal?.costs)
}

export function dealHasFinancials(deal) {
  return (deal?.payments?.length || 0) > 0 || (deal?.costs?.length || 0) > 0
}
