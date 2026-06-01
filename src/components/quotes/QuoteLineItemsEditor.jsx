import { useState, useRef } from 'react'
import { Plus, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { Button } from '../ui/button'
import { OptionsMenuDropdown, OptionsMenuItem } from '../ui/OptionsMenuDropdown'
import { cn } from '@/lib/utils'
import { QuoteCheckToggle } from './QuoteCheckToggle'
import {
  FINANCES_SUMMARY_ROW,
  profitValueClass,
} from '../DealLineItemsSection'
import {
  createQuoteLineItem,
  computeQuoteTotals,
  computeQuoteProfitSummary,
  computeLineAmounts,
  applyGlobalMarkup,
  formatQuoteMoney,
} from '@/utils/quoteMath'

const ROW = 'rounded-lg map-panel-list-item border border-white/10 bg-white/[0.06]'
const MENU_WIDTH = 160

function LineItemRow({
  item,
  readOnly,
  locked,
  editing,
  onMenuClick,
  showOptionalBadge,
}) {
  const label = item.name?.trim() || 'Untitled line item'
  return (
    <div
      className={cn(
        ROW,
        'grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-2 px-3 py-2.5 min-h-[44px] items-center'
      )}
    >
      <div className="min-w-0 col-start-1 row-start-1">
        <div className="text-sm font-medium truncate leading-5">{label}</div>
        {item.description && (
          <div className="text-xs opacity-60 truncate mt-0.5">{item.description}</div>
        )}
        {showOptionalBadge && item.isOptional && (
          <span className="text-[10px] uppercase tracking-wide text-amber-400 block mt-0.5">Optional add-on</span>
        )}
      </div>
      <span className="text-sm font-medium tabular-nums shrink-0 col-start-2 row-start-1 self-center leading-5">
        {formatQuoteMoney(item.amount || 0)}
      </span>
      {!readOnly && !locked && !editing && (
        <button
          type="button"
          className="col-start-3 row-start-1 self-center shrink-0 h-8 w-8 flex items-center justify-center rounded-md opacity-70 hover:opacity-100 hover:bg-white/10"
          aria-label="Line item options"
          onClick={(e) => onMenuClick(e, item.id)}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      )}
      {!readOnly && !locked && editing && (
        <span className="col-start-3 row-start-1 self-center text-[10px] uppercase tracking-wide opacity-50 shrink-0 leading-5">
          Editing
        </span>
      )}
    </div>
  )
}

function LineItemEditForm({ item, showOptions, onChange, onDone }) {
  const update = (patch) => onChange(item.id, patch)

  return (
    <div className={cn(ROW, 'p-3 space-y-2')}>
      <input
        className="w-full bg-white/5 border border-white/15 rounded-md px-3 py-2 text-sm"
        placeholder="Service name"
        value={item.name}
        autoFocus
        onChange={(e) => update({ name: e.target.value })}
      />
      <input
        className="w-full bg-white/5 border border-white/15 rounded-md px-3 py-2 text-sm opacity-90"
        placeholder="Description (client-visible)"
        value={item.description || ''}
        onChange={(e) => update({ description: e.target.value })}
      />
      <div className={cn('grid gap-2 text-sm', item.showCostFields !== false ? 'grid-cols-4' : 'grid-cols-2')}>
        <div>
          <span className="text-[10px] opacity-50 block mb-0.5">Qty</span>
          <input
            className="w-full bg-white/5 border border-white/15 rounded-md px-2 py-2 text-sm"
            type="number"
            min="0"
            step="1"
            value={item.quantity ?? 1}
            onChange={(e) => update({ quantity: e.target.value })}
          />
        </div>
        {item.showCostFields !== false && (
          <>
            <div>
              <span className="text-[10px] opacity-50 block mb-0.5">Cost $</span>
              <input
                className="w-full bg-white/5 border border-white/15 rounded-md px-2 py-2 text-sm"
                placeholder="0"
                value={item.unitCost ?? ''}
                onChange={(e) => update({ unitCost: e.target.value, priceOverridden: false })}
              />
            </div>
            <div>
              <span className="text-[10px] opacity-50 block mb-0.5">Markup %</span>
              <input
                className="w-full bg-white/5 border border-white/15 rounded-md px-2 py-2 text-sm"
                placeholder="0"
                value={item.markupPercent ?? ''}
                onChange={(e) => update({ markupPercent: e.target.value, priceOverridden: false })}
              />
            </div>
          </>
        )}
        <div>
          <span className="text-[10px] opacity-50 block mb-0.5">Sell $</span>
          <input
            className={cn(
              'w-full bg-white/5 border border-white/15 rounded-md px-2 py-2 text-sm',
              item.priceOverridden && 'border-amber-400/40'
            )}
            placeholder="Auto"
            value={item.unitPrice ?? ''}
            onChange={(e) => update({ unitPrice: e.target.value, priceOverridden: true })}
          />
        </div>
      </div>

      {showOptions && (
        <div className="flex flex-col gap-0.5 pt-1">
          <QuoteCheckToggle
            checked={!item.isOptional}
            onChange={(checked) => update({ isOptional: !checked })}
            label="Required line item"
          />
          <QuoteCheckToggle
            checked={!!item.hidePriceFromClient}
            onChange={(checked) => update({ hidePriceFromClient: checked })}
            label="Hide price from client"
          />
          <QuoteCheckToggle
            checked={item.showCostFields !== false}
            onChange={(checked) => update({ showCostFields: checked })}
            label="Show cost & markup fields"
          />
        </div>
      )}

      <div className="flex justify-end pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  )
}

export function QuoteLineItemsEditor({
  lineItems = [],
  taxRate = 0,
  globalMarkupPercent = null,
  onChange,
  onGlobalMarkupChange,
  readOnly = false,
  locked = false,
  showProfit = true,
  selectedOptionalIds = null,
}) {
  const [editingId, setEditingId] = useState(null)
  const [menuOpenId, setMenuOpenId] = useState(null)
  const menuTriggerRef = useRef(null)

  const totals = computeQuoteTotals(lineItems, taxRate, { selectedOptionalIds })
  const profit = showProfit ? computeQuoteProfitSummary(totals.lineItems, { selectedOptionalIds }) : null

  const emitChange = (items, rate = taxRate) => {
    onChange?.(items, rate)
  }

  const updateItem = (id, patch) => {
    const next = lineItems.map((item) => {
      if (item.id !== id) return item
      const merged = { ...item, ...patch }
      if (patch.unitPrice !== undefined && patch.priceOverridden === undefined) {
        merged.priceOverridden = true
      }
      const computed = computeLineAmounts(merged)
      return {
        ...merged,
        quantity: computed.quantity,
        unitPrice: merged.priceOverridden
          ? parseFloat(String(merged.unitPrice).replace(/[^0-9.-]/g, '')) || computed.unitPrice
          : computed.unitPrice,
        amount: merged.priceOverridden && merged.amount ? merged.amount : computed.amount,
      }
    })
    emitChange(next)
  }

  const addItem = () => {
    const item = createQuoteLineItem({
      markupPercent: globalMarkupPercent || 0,
      isOptional: false,
      showCostFields: true,
    })
    emitChange([...lineItems, item])
    setEditingId(item.id)
  }

  const removeItem = (id) => {
    emitChange(lineItems.filter((i) => i.id !== id))
    if (editingId === id) setEditingId(null)
    setMenuOpenId(null)
  }

  const setTaxRate = (value) => {
    const rate = Math.max(0, Number(String(value).replace(/[^0-9.-]/g, '')) || 0)
    emitChange(lineItems, rate)
  }

  const handleGlobalMarkup = (value) => {
    const rate = Math.max(0, Number(String(value).replace(/[^0-9.-]/g, '')) || 0)
    onGlobalMarkupChange?.(rate)
    if (!readOnly && !locked) {
      emitChange(applyGlobalMarkup(lineItems, rate))
    }
  }

  const openMenu = (e, id) => {
    menuTriggerRef.current = e.currentTarget
    setMenuOpenId(id)
  }

  const canEdit = !readOnly && !locked

  return (
    <div className="space-y-3">
      {canEdit && onGlobalMarkupChange != null && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="opacity-70">Global markup %</span>
          <input
            className="w-20 bg-white/5 border border-white/15 rounded-md px-2 py-1 text-sm text-right"
            value={globalMarkupPercent ?? ''}
            onChange={(e) => handleGlobalMarkup(e.target.value)}
          />
        </div>
      )}

      {lineItems.map((item) => {
        const editing = canEdit && editingId === item.id
        const { costTotal, margin, marginPercent } = computeLineAmounts(item)

        if (editing) {
          return (
            <LineItemEditForm
              key={item.id}
              item={item}
              showOptions
              onChange={updateItem}
              onDone={() => setEditingId(null)}
            />
          )
        }

        return (
          <div key={item.id} className="space-y-1">
            <LineItemRow
              item={item}
              readOnly={readOnly}
              locked={locked}
              editing={false}
              showOptionalBadge={readOnly || locked}
              onMenuClick={openMenu}
            />
            {showProfit && (readOnly || locked) && (
              <div className="flex justify-between text-xs opacity-60 px-1">
                <span>
                  Cost {formatQuoteMoney(costTotal)} · Margin {formatQuoteMoney(margin)} ({marginPercent}%)
                </span>
              </div>
            )}
          </div>
        )
      })}

      {canEdit && (
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={addItem}>
          <Plus className="h-4 w-4 mr-2" /> Add line item
        </Button>
      )}

      <OptionsMenuDropdown
        open={!!menuOpenId}
        onClose={() => setMenuOpenId(null)}
        triggerRef={menuTriggerRef}
        menuWidth={MENU_WIDTH}
      >
        <OptionsMenuItem
          onClick={() => {
            setEditingId(menuOpenId)
            setMenuOpenId(null)
          }}
        >
          <Pencil className="h-4 w-4" /> Edit
        </OptionsMenuItem>
        <OptionsMenuItem
          destructive
          onClick={() => removeItem(menuOpenId)}
        >
          <Trash2 className="h-4 w-4" /> Delete
        </OptionsMenuItem>
      </OptionsMenuDropdown>

      <div className={cn('space-y-1 text-sm pt-2 border-t border-white/10')}>
        <div className="flex justify-between items-center opacity-80">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatQuoteMoney(totals.subtotal)}</span>
        </div>
        {canEdit ? (
          <div className="flex justify-between items-center gap-2">
            <span className="opacity-80">Tax %</span>
            <input
              className="w-20 bg-white/5 border border-white/15 rounded-md px-2 py-1 text-sm text-right"
              value={taxRate || ''}
              onChange={(e) => setTaxRate(e.target.value)}
            />
          </div>
        ) : totals.taxRate > 0 ? (
          <div className="flex justify-between items-center opacity-80">
            <span>Tax ({totals.taxRate}%)</span>
            <span className="tabular-nums">{formatQuoteMoney(totals.taxAmount)}</span>
          </div>
        ) : null}
        <div className="flex justify-between items-center font-semibold text-base pt-1">
          <span>Total</span>
          <span className="tabular-nums">{formatQuoteMoney(totals.total)}</span>
        </div>
        {showProfit && profit && (
          <div className={cn(FINANCES_SUMMARY_ROW, 'rounded-lg border border-white/10 mt-2 items-center')}>
            <span className="text-sm font-medium flex-1">Quote profit</span>
            <span className={cn('text-sm font-medium tabular-nums shrink-0', profitValueClass(profit.profit))}>
              {formatQuoteMoney(profit.profit)}
            </span>
            <span className="text-xs opacity-60 tabular-nums shrink-0">({profit.marginPercent}%)</span>
          </div>
        )}
      </div>
    </div>
  )
}
