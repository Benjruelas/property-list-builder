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
  triggerClassName,
  disabled = false,
  hiddenWhenEmpty = false,
}) {
  const [open, setOpen] = useState(false)
  const emptyOption = { id: '', label: emptyLabel }
  const list = allowEmpty ? [emptyOption, ...options] : options
  const optionLabel = (opt) => opt.label ?? opt.title ?? opt.id ?? ''
  const selected = options.find((o) => o.id === value)
  const labelText = selected ? optionLabel(selected) : placeholder

  if (hiddenWhenEmpty && options.length === 0 && !allowEmpty) return null

  const toggle = () => {
    if (disabled) return
    setOpen((p) => !p)
  }

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
          aria-disabled={disabled || undefined}
          tabIndex={disabled ? -1 : 0}
          onClick={toggle}
          onKeyDown={(e) => {
            if (disabled) return
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
            'pipeline-dropdown-trigger w-full min-h-[44px] rounded-md pl-3 pr-4 py-2.5 text-sm text-left flex items-center justify-between gap-2 cursor-pointer',
            open && 'rounded-b-none',
            disabled && 'opacity-50 pointer-events-none cursor-not-allowed',
            triggerClassName,
          )}
        >
          <span className={cn('truncate min-w-0', !value && 'opacity-50')}>
            {labelText}
          </span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 opacity-60 transition-transform',
              open && 'rotate-180',
            )}
          />
        </div>
        {open && (
          <div
            className="pipeline-dropdown-menu absolute z-50 left-0 right-0 top-full rounded-b-md overflow-hidden max-h-48 overflow-y-auto scrollbar-hide border border-white/25 border-t-0"
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
                  className={cn(
                    'w-full px-3 py-2.5 text-sm text-left flex items-center justify-between gap-2 transition-colors pipeline-dropdown-item',
                    isSelected && 'pipeline-dropdown-item--selected',
                  )}
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
