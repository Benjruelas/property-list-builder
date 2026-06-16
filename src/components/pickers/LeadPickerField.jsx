import { useEffect, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  ENTITY_ROW_CLASS,
  filterLeads,
  displayLeadName,
  formatLeadAddress,
} from './entityPickerShared'

function SelectedLeadCard({ lead, onClear, readOnly }) {
  return (
    <div
      className={cn(
        'entity-picker-body entity-picker-body--selected',
        ENTITY_ROW_CLASS,
        'border-white/20 bg-white/[0.06] cursor-default flex-row items-center justify-between gap-3'
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{displayLeadName(lead)}</div>
        <div className="text-xs opacity-60 truncate" title={lead.address || undefined}>
          {formatLeadAddress(lead) || 'No address'}
        </div>
      </div>
      {!readOnly && onClear && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 opacity-60 hover:opacity-100"
          onClick={onClear}
          aria-label="Clear lead selection"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}

/**
 * Lead picker matching Create Deal — selected card or inline search + scrollable list.
 *
 * @param {string | null} value — selected lead id
 * @param {(lead: object | null) => void} onChange
 */
export function LeadPickerField({
  label = 'Lead',
  required = false,
  leads = [],
  value = null,
  onChange,
  readOnly = false,
  className = '',
}) {
  const [search, setSearch] = useState('')
  const [pickerOpen, setPickerOpen] = useState(true)
  const [highlightIndex, setHighlightIndex] = useState(-1)

  const selectedLead = value ? leads.find((l) => l.id === value) : null
  const filteredLeads = useMemo(() => filterLeads(leads, search), [leads, search])

  useEffect(() => {
    if (value && selectedLead) setPickerOpen(false)
  }, [value, selectedLead])

  const selectLead = (lead) => {
    onChange?.(lead)
    setPickerOpen(false)
    setSearch('')
    setHighlightIndex(-1)
  }

  const clearLead = () => {
    onChange?.(null)
    setPickerOpen(true)
    setSearch('')
    setHighlightIndex(-1)
  }

  const showPicker = !selectedLead || pickerOpen

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

      {selectedLead && !showPicker ? (
        <SelectedLeadCard lead={selectedLead} onClear={clearLead} readOnly={readOnly} />
      ) : readOnly && selectedLead ? (
        <SelectedLeadCard lead={selectedLead} readOnly />
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
              placeholder="Search by name, address, phone, or email…"
              className="w-full text-sm pl-9 pr-3 py-2.5 bg-transparent border-0 outline-none"
              aria-label="Search leads"
              onKeyDown={(e) => {
                if (filteredLeads.length === 0) return
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setHighlightIndex((i) => Math.min(i + 1, filteredLeads.length - 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setHighlightIndex((i) => Math.max(i - 1, -1))
                } else if (e.key === 'Enter' && highlightIndex >= 0 && filteredLeads[highlightIndex]) {
                  e.preventDefault()
                  selectLead(filteredLeads[highlightIndex])
                }
              }}
            />
          </div>

          <ul
            className="entity-picker-list max-h-52 overflow-y-auto scrollbar-hide p-1.5 space-y-1.5"
            role="listbox"
            aria-label="Leads"
          >
            {filteredLeads.length === 0 ? (
              <li className="text-sm opacity-50 py-6 px-3 text-center">
                {leads.length === 0 ? 'No leads yet.' : 'No leads match your search.'}
              </li>
            ) : (
              filteredLeads.map((l, idx) => (
                <li key={l.id} role="option" aria-selected={highlightIndex === idx}>
                  <button
                    type="button"
                    onClick={() => selectLead(l)}
                    className={cn(
                      ENTITY_ROW_CLASS,
                      highlightIndex === idx
                        ? 'border-white/40 bg-white/10'
                        : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98]'
                    )}
                  >
                    <div className="text-sm font-medium truncate">{displayLeadName(l)}</div>
                    <div className="text-xs opacity-60 truncate" title={l.address || undefined}>
                      {formatLeadAddress(l) || 'No address'}
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

export default LeadPickerField
