import { useEffect, useState } from 'react'
import { Check, ChevronDown, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  createDealLineItem,
  sumDealLineItems,
  formatDealMoney,
  normalizeDealLineItems,
  parseDealAmount,
} from '@/utils/dealFinances'
import {
  FINANCES_SUMMARY_ROW,
  FINANCES_LINE_ITEM,
  FINANCES_OPTIONS_BTN,
  FinancesOptionsSpacer,
  profitValueClass,
} from './DealLineItemsSection'

export function createDraftFinanceRow(name = '', amount = '') {
  return {
    ...createDealLineItem(name, amount),
    confirmed: false,
  }
}

export function mapPrefillFinanceRows(items) {
  if (!Array.isArray(items) || items.length === 0) return [createDraftFinanceRow()]
  return items.map((item) => ({ ...item, confirmed: true }))
}

export function financeRowsForSubmit(items) {
  return normalizeDealLineItems(
    (items || []).filter((item) => item.confirmed).map(({ id, name, amount, settled }) => ({
      id,
      name,
      amount,
      settled,
    }))
  )
}

function isRowFillable(item) {
  return !!(item?.name ?? '').trim()
}

function defaultRowAmount(item) {
  const raw = item?.amount
  if (raw === '' || raw == null) return 0
  return parseDealAmount(raw)
}

const DRAFT_INPUT =
  'text-sm rounded-lg px-3 py-2 bg-white/5 border border-white/15 outline-none shadow-none ring-0 focus:ring-0 focus-visible:ring-0 placeholder:opacity-40 min-w-0'

function CreateFinancesSection({
  title,
  items = [],
  onChange,
  addMenuLabel,
  namePlaceholder,
  amountPlaceholder,
}) {
  const confirmedItems = items.filter((item) => item.confirmed)
  const draftItems = items.filter((item) => !item.confirmed)
  const total = sumDealLineItems(confirmedItems)
  const hasDrafts = draftItems.length > 0

  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (hasDrafts) setCollapsed(false)
  }, [hasDrafts])

  const canAdd = items.length > 0 && !!(items[0]?.name ?? '').trim()

  const updateItem = (id, field, value) => {
    onChange?.(items.map((item) => (item.id === id ? { ...item, [field]: value } : item)))
  }

  const confirmRow = (id) => {
    const item = items.find((i) => i.id === id)
    if (!item || !isRowFillable(item)) return
    onChange?.(
      items.map((i) =>
        i.id === id ? { ...i, confirmed: true, amount: defaultRowAmount(i) } : i
      )
    )
  }

  const deleteRow = (id) => {
    const next = items.filter((item) => item.id !== id)
    onChange?.(next.length > 0 ? next : [createDraftFinanceRow()])
  }

  const addRow = () => {
    if (!canAdd) return
    onChange?.([...items, createDraftFinanceRow()])
  }

  const expanded = !collapsed

  return (
    <div>
      <div className={FINANCES_SUMMARY_ROW}>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center justify-center shrink-0 mt-0.5"
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${title}` : `Expand ${title}`}
        >
          <ChevronDown
            className={cn(
              'h-[18px] w-[18px] opacity-50 transition-transform',
              collapsed && '-rotate-90'
            )}
          />
        </button>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="text-sm font-medium truncate text-left min-w-0 flex-1 pt-0.5"
        >
          {title}
        </button>
        <span className="text-sm font-medium tabular-nums shrink-0 pt-0.5">
          {(collapsed || confirmedItems.length === 0) ? formatDealMoney(total) : ''}
        </span>
        {expanded ? (
          <button
            type="button"
            className={cn(
              FINANCES_OPTIONS_BTN,
              !canAdd && 'opacity-30 pointer-events-none'
            )}
            onClick={addRow}
            disabled={!canAdd}
            aria-label={addMenuLabel}
            title={addMenuLabel}
          >
            <Plus className="h-[18px] w-[18px]" />
          </button>
        ) : (
          <FinancesOptionsSpacer />
        )}
      </div>

      {expanded && (
        <div className="px-3.5 pb-3 pt-2 space-y-2.5 border-t border-white/10 bg-white/[0.02]">
          {confirmedItems.length === 0 && draftItems.length === 0 && (
            <p className="text-xs opacity-40 py-0.5">No {title.toLowerCase()} yet.</p>
          )}

          {confirmedItems.length > 0 && (
            <ul className="space-y-2">
              {confirmedItems.map((item) => (
                <li key={item.id} className={FINANCES_LINE_ITEM}>
                  <span className="w-[18px] shrink-0" aria-hidden />
                  <span className="text-sm truncate min-w-0 flex-1 font-medium text-white/95">
                    {item.name || 'Untitled'}
                  </span>
                  <span className="text-sm font-medium tabular-nums shrink-0 text-white/90">
                    {formatDealMoney(item.amount)}
                  </span>
                  <button
                    type="button"
                    className={FINANCES_OPTIONS_BTN}
                    onClick={() => deleteRow(item.id)}
                    aria-label="Remove"
                    title="Remove"
                  >
                    <X className="h-[18px] w-[18px]" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {draftItems.length > 0 && (
            <ul className="space-y-2">
              {draftItems.map((item) => (
                <li key={item.id} className={cn(FINANCES_LINE_ITEM, 'gap-2')}>
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                    placeholder={namePlaceholder}
                    className={cn(DRAFT_INPUT, 'flex-1')}
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={item.amount === '' || item.amount == null ? '' : item.amount}
                    onChange={(e) => updateItem(item.id, 'amount', e.target.value)}
                    placeholder={amountPlaceholder}
                    className={cn(DRAFT_INPUT, 'w-28 shrink-0 tabular-nums text-right')}
                  />
                  <div className="flex items-center shrink-0">
                    <button
                      type="button"
                      className={cn(
                        FINANCES_OPTIONS_BTN,
                        'text-green-600 hover:text-green-500 disabled:opacity-30 disabled:pointer-events-none'
                      )}
                      onClick={() => confirmRow(item.id)}
                      disabled={!isRowFillable(item)}
                      aria-label="Accept"
                      title="Accept"
                    >
                      <Check className="h-[18px] w-[18px]" />
                    </button>
                    <button
                      type="button"
                      className={FINANCES_OPTIONS_BTN}
                      onClick={() => deleteRow(item.id)}
                      aria-label="Remove"
                      title="Remove"
                    >
                      <X className="h-[18px] w-[18px]" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {confirmedItems.length > 0 && (
            <div className="flex justify-end pr-1 pt-0.5 text-xs opacity-60 tabular-nums">
              Total: {formatDealMoney(total)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function CreateDealFinancesEditor({ payments = [], costs = [], onPaymentsChange, onCostsChange, canSeeDealAmounts = true }) {
  if (!canSeeDealAmounts) return null
  const savedPayments = financeRowsForSubmit(payments)
  const savedCosts = financeRowsForSubmit(costs)
  const paymentsTotal = sumDealLineItems(savedPayments)
  const costsTotal = sumDealLineItems(savedCosts)
  const profit = paymentsTotal - costsTotal
  const showProfit = paymentsTotal !== 0 || costsTotal !== 0

  return (
    <div className="rounded-lg border border-white/10 overflow-hidden divide-y divide-white/10 bg-white/[0.02]">
      <CreateFinancesSection
        title="Payments"
        items={payments}
        onChange={onPaymentsChange}
        addMenuLabel="Add payment"
        namePlaceholder="Payment name"
        amountPlaceholder="Amount"
      />
      <CreateFinancesSection
        title="Costs"
        items={costs}
        onChange={onCostsChange}
        addMenuLabel="Add cost"
        namePlaceholder="Cost name"
        amountPlaceholder="Amount"
      />
      {showProfit && (
        <div className={FINANCES_SUMMARY_ROW}>
          <div className="w-[18px] shrink-0 mt-0.5" aria-hidden />
          <span className="text-sm font-medium min-w-0 flex-1 pt-0.5">Profit</span>
          <span className={cn('text-sm font-medium tabular-nums shrink-0 pt-0.5', profitValueClass(profit))}>
            {formatDealMoney(profit)}
          </span>
          <FinancesOptionsSpacer />
        </div>
      )}
    </div>
  )
}

export default CreateDealFinancesEditor
