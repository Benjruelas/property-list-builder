import { useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Inline option picker — expands below trigger (no native select; safe inside transformed dialogs).
 *
 * @param {{ id: string, label?: string, title?: string }[]} options
 */
export function InlineDropdown({
  value,
  onChange,
  options = [],
  placeholder = 'Select…',
  allowEmpty = false,
  emptyLabel = 'None',
  showLabel = true,
  label = '',
  className,
  hiddenWhenEmpty = false,
}) {
  const [open, setOpen] = useState(false)
  const emptyOption = { id: '', label: emptyLabel }
  const list = allowEmpty ? [emptyOption, ...options] : options
  const optionLabel = (opt) => opt.label ?? opt.title ?? opt.id ?? ''
  const selected = options.find((o) => o.id === value)
  const labelText = selected ? optionLabel(selected) : placeholder

  if (hiddenWhenEmpty && options.length === 0 && !allowEmpty) return null

  return (
    <div className={className}>
      {showLabel && label && (
        <label className="text-xs font-medium block mb-1 opacity-90">{label}</label>
      )}
      <div className="relative">
        <div
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          tabIndex={0}
          onClick={() => setOpen((p) => !p)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setOpen((p) => !p)
            } else if (e.key === 'Escape') {
              setOpen(false)
            }
          }}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) {
              setTimeout(() => setOpen(false), 100)
            }
          }}
          className={cn(
            'pipeline-dropdown-trigger w-full min-h-[44px] rounded-md px-3 py-2.5 text-sm text-left flex items-center justify-between gap-2 cursor-pointer',
            open && 'rounded-b-none'
          )}
        >
          <span
            className="truncate"
            style={{ color: value ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)' }}
          >
            {labelText}
          </span>
          <ChevronDown
            className="h-3.5 w-3.5 shrink-0 opacity-60 transition-transform"
            style={{ transform: open ? 'rotate(180deg)' : undefined }}
          />
        </div>
        {open && (
          <div
            className="pipeline-dropdown-menu absolute z-50 left-0 right-0 top-full rounded-b-md overflow-hidden max-h-48 overflow-y-auto scrollbar-hide"
            style={{ border: '1px solid rgba(255,255,255,0.25)', borderTop: 'none' }}
            role="listbox"
          >
            {list.map((opt) => {
              const optId = opt.id || ''
              const isSelected = value === optId
              return (
                <button
                  key={optId || '__empty__'}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(optId)
                    setOpen(false)
                  }}
                  className="w-full px-3 py-2.5 text-sm text-left flex items-center justify-between gap-2 transition-colors pipeline-dropdown-item"
                  style={{
                    color: isSelected ? '#fff' : 'rgba(255,255,255,0.7)',
                    background: isSelected ? 'rgba(255,255,255,0.12)' : undefined,
                  }}
                  role="option"
                  aria-selected={isSelected}
                >
                  <span className="truncate">{optionLabel(opt)}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default InlineDropdown
