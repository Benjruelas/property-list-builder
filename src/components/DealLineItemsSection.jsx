import { useEffect, useState, useRef } from 'react'
import { ChevronDown, CheckSquare, MoreVertical, Pencil, Plus, Square, Trash2 } from 'lucide-react'
import { Button } from './ui/button'
import { OptionsMenuDropdown, OptionsMenuItem } from './ui/OptionsMenuDropdown'
import { cn } from '@/lib/utils'
import {
  createDealLineItem,
  sumDealLineItems,
  formatDealMoney,
  dealHasFinancials,
  computeDealProfit,
  normalizeDealLineItems,
} from '@/utils/dealFinances'

const MENU_WIDTH = 180

const FINANCES_ROW =
  'flex items-center gap-3 py-2.5 px-3 min-h-[44px] bg-white/[0.04]'

/** Expanded section line item — matches task list cards in Create Deal / deal panels */
export const FINANCES_LINE_ITEM =
  'flex items-center gap-3 py-2.5 px-3 min-h-[44px] rounded-lg map-panel-list-item border border-white/10 bg-white/[0.06] hover:bg-white/[0.08] transition-colors'

/** Matches TaskRow horizontal padding and options button placement */
export const FINANCES_SUMMARY_ROW =
  'flex items-start gap-2.5 px-3 py-2.5 min-h-[44px] bg-white/[0.04]'

export const FINANCES_OPTIONS_BTN =
  'p-1.5 -m-1 rounded-md text-white/50 hover:text-white/80 hover:bg-white/10 transition-colors shrink-0'

export function FinancesOptionsSpacer() {
  return (
    <span className={cn(FINANCES_OPTIONS_BTN, 'invisible pointer-events-none')} aria-hidden>
      <MoreVertical className="h-[18px] w-[18px]" />
    </span>
  )
}

export { FINANCES_ROW }

function isLineItemValid(item) {
  return !!(item?.name ?? '').trim() && String(item?.amount ?? '').trim() !== ''
}

function cloneItems(items) {
  return (items || []).map((item) => ({ ...item }))
}

export function profitValueClass(profit) {
  if (profit > 0) return 'deal-profit-positive text-green-600'
  if (profit < 0) return 'deal-profit-negative text-red-400'
  return ''
}

function DealFinancesGroup({
  title,
  items = [],
  onChange,
  onCommit,
  readOnly = false,
  addMenuLabel = 'Add',
  editMenuLabel = 'Edit',
  namePlaceholder = 'Name',
  amountPlaceholder = 'Amount',
  settledLabel = 'Received',
  highlightSettled = false,
}) {
  const [mode, setMode] = useState(null)
  const [draft, setDraft] = useState([])
  const [menuOpen, setMenuOpen] = useState(false)
  const menuTriggerRef = useRef(null)
  const [collapsed, setCollapsed] = useState(() => items.length > 0)

  const structureKey = items.map((item) => item.id).join(',')

  useEffect(() => {
    setMode(null)
    setDraft([])
    setMenuOpen(false)
  }, [structureKey])

  useEffect(() => {
    if (items.length === 0) setCollapsed(false)
  }, [items.length])

  const closeMenu = () => {
    setMenuOpen(false)
  }

  const openMenu = (event) => {
    event.stopPropagation()
    menuTriggerRef.current = event.currentTarget
    setMenuOpen(true)
  }

  const startAdd = () => {
    closeMenu()
    setCollapsed(false)
    setDraft([createDealLineItem()])
    setMode('add')
  }

  const startEdit = () => {
    closeMenu()
    setCollapsed(false)
    setDraft(cloneItems(items))
    setMode('edit')
  }

  const cancelEdit = () => {
    setMode(null)
    setDraft([])
  }

  const updateDraftItem = (id, field, value) => {
    setDraft((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)))
  }

  const removeDraftItem = (id) => {
    setDraft((prev) => prev.filter((item) => item.id !== id))
  }

  const save = () => {
    const existingById = new Map(items.map((item) => [item.id, item]))
    const nextRaw = mode === 'add'
      ? [...items, ...draft.filter(isLineItemValid)]
      : draft.filter(isLineItemValid)
    const next = normalizeDealLineItems(
      nextRaw.map((item) => ({
        ...item,
        settled: existingById.get(item.id)?.settled ?? !!item.settled,
      }))
    )
    onChange?.(next)
    onCommit?.(next)
    setMode(null)
    setDraft([])
    if (next.length > 0) setCollapsed(true)
  }

  const toggleSettled = (id) => {
    const next = items.map((item) => (item.id === id ? { ...item, settled: !item.settled } : item))
    onChange?.(next)
    onCommit?.(next)
  }

  const canSave = mode === 'add'
    ? draft.some(isLineItemValid)
    : draft.some(isLineItemValid) || (items.length > 0 && draft.length === 0)

  const total = sumDealLineItems(items)
  const editing = mode != null
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
          {(collapsed || items.length === 0) ? formatDealMoney(total) : ''}
        </span>
        {!readOnly && !editing ? (
          <button
            type="button"
            className={cn(FINANCES_OPTIONS_BTN, menuOpen && 'text-white/80 bg-white/10')}
            onClick={openMenu}
            title={`${title} options`}
            aria-label={`${title} options`}
          >
            <MoreVertical className="h-[18px] w-[18px]" />
          </button>
        ) : (
          <FinancesOptionsSpacer />
        )}
      </div>

      {expanded && (
        <div className="px-3.5 pb-3 pt-2 space-y-2.5 border-t border-white/10 bg-white/[0.02]">
          {!editing && items.length === 0 && (
            <p className="text-xs opacity-40 py-0.5 pl-[30px]">
              {readOnly ? 'None' : `No ${title.toLowerCase()} yet.`}
            </p>
          )}

          {!editing && items.length > 0 && (
            <ul className="space-y-2">
              {items.map((item) => {
                const valueSettledClass = highlightSettled && item.settled ? 'text-green-600' : ''
                return (
                  <li
                    key={item.id}
                    className={FINANCES_LINE_ITEM}
                  >
                    <button
                      type="button"
                      onClick={() => !readOnly && toggleSettled(item.id)}
                      disabled={readOnly}
                      className={cn(
                        'flex-shrink-0',
                        item.settled
                          ? 'text-green-600 hover:text-green-500'
                          : 'text-white/70 hover:text-white',
                        readOnly && 'cursor-default opacity-80'
                      )}
                      title={settledLabel}
                      aria-label={`${settledLabel}: ${item.name || 'Untitled'}`}
                      aria-pressed={!!item.settled}
                    >
                      {item.settled ? (
                        <CheckSquare className="h-[18px] w-[18px] text-green-600 fill-green-600" />
                      ) : (
                        <Square className="h-[18px] w-[18px]" />
                      )}
                    </button>
                    <span className="text-sm truncate min-w-0 flex-1 font-medium text-white/95">
                      {item.name || 'Untitled'}
                      {item.sourceQuoteId && (
                        <span className="ml-1 text-[10px] text-green-500/90 font-normal">via quote</span>
                      )}
                    </span>
                    <span className={cn('text-sm font-medium tabular-nums shrink-0 text-white/90', valueSettledClass)}>
                      {formatDealMoney(item.amount)}
                    </span>
                    {item.settledAt && item.settled && (
                      <span className="text-[10px] opacity-40 shrink-0 hidden sm:inline" title={item.settledAt}>
                        {new Date(item.settledAt).toLocaleDateString()}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {editing && (
            <div className="space-y-3 rounded-lg border border-white/15 bg-white/[0.03] p-3 ml-[30px]">
              <ul className="space-y-2">
                {draft.map((item) => (
                  <li key={item.id} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => updateDraftItem(item.id, 'name', e.target.value)}
                      placeholder={namePlaceholder}
                      className="flex-1 min-w-0 text-sm rounded-lg px-3 py-2 bg-white/5 border border-white/15 placeholder:opacity-40"
                      autoFocus={mode === 'add' && draft.length === 1}
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.amount === '' || item.amount == null ? '' : item.amount}
                      onChange={(e) => updateDraftItem(item.id, 'amount', e.target.value)}
                      placeholder={amountPlaceholder}
                      className="w-28 shrink-0 text-sm rounded-lg px-3 py-2 bg-white/5 border border-white/15 tabular-nums placeholder:opacity-40"
                    />
                    {mode === 'edit' && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 opacity-50 hover:opacity-100"
                        onClick={() => removeDraftItem(item.id)}
                        aria-label="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {mode === 'edit' && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setDraft((prev) => [...prev, createDealLineItem()])}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  {addMenuLabel}
                </Button>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={cancelEdit}>
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={save} disabled={!canSave}>
                  Save
                </Button>
              </div>
            </div>
          )}

          {!editing && items.length > 0 && (
            <div className="flex justify-end pr-1 pt-0.5 text-xs opacity-60 tabular-nums">
              Total: {formatDealMoney(total)}
            </div>
          )}
        </div>
      )}

      <OptionsMenuDropdown
        open={menuOpen}
        onClose={closeMenu}
        triggerRef={menuTriggerRef}
        menuWidth={MENU_WIDTH}
        dataAttr="data-deal-line-items-menu"
      >
        <OptionsMenuItem onClick={startAdd}>
          <Plus className="h-4 w-4 shrink-0" />
          {addMenuLabel}
        </OptionsMenuItem>
        {items.length > 0 && (
          <OptionsMenuItem onClick={startEdit}>
            <Pencil className="h-4 w-4 shrink-0" />
            {editMenuLabel}
          </OptionsMenuItem>
        )}
      </OptionsMenuDropdown>
    </div>
  )
}

export function DealFinancesPanel({
  payments = [],
  costs = [],
  onPaymentsChange,
  onCostsChange,
  onPaymentsCommit,
  onCostsCommit,
  readOnly = false,
}) {
  const paymentsTotal = sumDealLineItems(payments)
  const costsTotal = sumDealLineItems(costs)
  const profit = paymentsTotal - costsTotal
  const showProfit = paymentsTotal !== 0 || costsTotal !== 0

  return (
    <div className="rounded-lg border border-white/10 overflow-hidden divide-y divide-white/10 bg-white/[0.02]">
      <DealFinancesGroup
        title="Payments"
        items={payments}
        onChange={onPaymentsChange}
        onCommit={onPaymentsCommit}
        readOnly={readOnly}
        addMenuLabel="Add payment"
        editMenuLabel="Edit payments"
        namePlaceholder="Payment name"
        amountPlaceholder="Amount"
        settledLabel="Received"
        highlightSettled
      />
      <DealFinancesGroup
        title="Costs"
        items={costs}
        onChange={onCostsChange}
        onCommit={onCostsCommit}
        readOnly={readOnly}
        addMenuLabel="Add cost"
        editMenuLabel="Edit costs"
        namePlaceholder="Cost name"
        amountPlaceholder="Amount"
        settledLabel="Paid"
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

/** @deprecated Use DealFinancesPanel */
export function DealLineItemsSection(props) {
  return (
    <div className="rounded-lg border border-white/10 overflow-hidden bg-white/[0.02]">
      <DealFinancesGroup {...props} />
    </div>
  )
}

/** @deprecated Use DealFinancesPanel */
export function DealFinancesSummary({ payments = [], costs = [] }) {
  const paymentsTotal = sumDealLineItems(payments)
  const costsTotal = sumDealLineItems(costs)
  const profit = paymentsTotal - costsTotal
  const hasValues = paymentsTotal !== 0 || costsTotal !== 0
  if (!hasValues) return null
  return (
    <div className={cn(FINANCES_SUMMARY_ROW, 'rounded-lg border border-white/10')}>
      <div className="w-[18px] shrink-0 mt-0.5" aria-hidden />
      <span className="text-sm font-medium flex-1 pt-0.5">Profit</span>
      <span className={cn('text-sm font-medium tabular-nums shrink-0 pt-0.5', profitValueClass(profit))}>
        {formatDealMoney(profit)}
      </span>
      <FinancesOptionsSpacer />
    </div>
  )
}

export function DealProfitBadge({ deal, className = '' }) {
  if (!dealHasFinancials(deal)) return null
  const profit = computeDealProfit(deal)
  return (
    <span
      className={cn('inline-flex items-center font-semibold tabular-nums', profitValueClass(profit), className)}
      title="Profit (payments − costs)"
    >
      {formatDealMoney(profit)}
    </span>
  )
}

export default DealFinancesPanel
