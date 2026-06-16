import { useEffect, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  ENTITY_ROW_CLASS,
  filterDeals,
  dealPrimaryLabel,
  dealSecondaryLabel,
  dealPipelineLabel,
} from './entityPickerShared'

function SelectedDealCard({ deal, onClear }) {
  const secondary = dealSecondaryLabel(deal)
  return (
    <div
      className={cn(
        'entity-picker-body entity-picker-body--selected',
        ENTITY_ROW_CLASS,
        'border-white/20 bg-white/[0.06] cursor-default flex-row items-center justify-between gap-3'
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{dealPrimaryLabel(deal)}</div>
        {secondary && (
          <div className="text-xs opacity-60 truncate" title={secondary}>
            {secondary}
          </div>
        )}
      </div>
      {onClear && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 opacity-60 hover:opacity-100"
          onClick={onClear}
          aria-label="Clear deal selection"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}

/**
 * Deal picker — same UX as LeadPickerField / Create Deal lead select.
 *
 * @param {string | null} value — selected deal id
 * @param {(deal: object | null) => void} onChange
 */
export function DealPickerField({
  label = 'Deal',
  required = false,
  deals = [],
  value = null,
  onChange,
  disableClear = false,
  className = '',
}) {
  const [search, setSearch] = useState('')
  const [pickerOpen, setPickerOpen] = useState(true)
  const [highlightIndex, setHighlightIndex] = useState(-1)

  const selectedDeal = value ? deals.find((d) => d.id === value) : null
  const filteredDeals = useMemo(() => filterDeals(deals, search), [deals, search])

  useEffect(() => {
    if (value && selectedDeal) setPickerOpen(false)
  }, [value, selectedDeal])

  const selectDeal = (deal) => {
    onChange?.(deal)
    setPickerOpen(false)
    setSearch('')
    setHighlightIndex(-1)
  }

  const clearDeal = () => {
    onChange?.(null)
    setPickerOpen(true)
    setSearch('')
    setHighlightIndex(-1)
  }

  const showPicker = !selectedDeal || pickerOpen

  return (
    <div className={cn('entity-picker-field', className)}>
      <label className="text-xs font-medium block mb-1 opacity-90">
        {label}
        {required && (
          <>
            {' '}
            <span className="text-red-400" aria-label="required">
              *
            </span>
          </>
        )}
      </label>

      {selectedDeal && !showPicker ? (
        <SelectedDealCard deal={selectedDeal} onClear={disableClear ? undefined : clearDeal} />
      ) : (
        <div className="entity-picker-body entity-picker-body--list rounded-lg border border-white/15 bg-white/[0.03] overflow-hidden flex flex-col min-h-0">
          <div className="relative border-b border-white/10">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-40 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setHighlightIndex(-1)
              }}
              placeholder="Search by deal name, lead, or address…"
              className="w-full text-sm pl-9 pr-3 py-2.5 bg-transparent border-0 outline-none"
              aria-label="Search deals"
              onKeyDown={(e) => {
                if (filteredDeals.length === 0) return
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setHighlightIndex((i) => Math.min(i + 1, filteredDeals.length - 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setHighlightIndex((i) => Math.max(i - 1, -1))
                } else if (e.key === 'Enter' && highlightIndex >= 0 && filteredDeals[highlightIndex]) {
                  e.preventDefault()
                  selectDeal(filteredDeals[highlightIndex])
                }
              }}
            />
          </div>

          <ul
            className="entity-picker-list max-h-52 overflow-y-auto scrollbar-hide p-1.5 space-y-1.5"
            role="listbox"
            aria-label="Deals"
          >
            {filteredDeals.length === 0 ? (
              <li className="text-sm opacity-50 py-6 px-3 text-center">
                {deals.length === 0 ? 'No deals yet.' : 'No deals match your search.'}
              </li>
            ) : (
              filteredDeals.map((d, idx) => {
                const secondary = dealSecondaryLabel(d)
                const pipeline = dealPipelineLabel(d)
                return (
                  <li key={d.id} role="option" aria-selected={highlightIndex === idx}>
                    <button
                      type="button"
                      onClick={() => selectDeal(d)}
                      className={cn(
                        ENTITY_ROW_CLASS,
                        highlightIndex === idx
                          ? 'border-white/40 bg-white/10'
                          : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98]'
                      )}
                    >
                      <div className="text-sm font-medium truncate">{dealPrimaryLabel(d)}</div>
                      {secondary && (
                        <div className="text-xs opacity-60 truncate" title={secondary}>
                          {secondary}
                        </div>
                      )}
                      {pipeline && (
                        <div className="text-[11px] opacity-45 truncate" title={pipeline}>
                          Pipe: {pipeline}
                        </div>
                      )}
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

export default DealPickerField
