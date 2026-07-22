import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PanelSearchInput({
  value,
  onChange,
  placeholder,
  'aria-label': ariaLabel,
  className,
}) {
  const hasValue = Boolean(value)

  return (
    <div className={cn('relative flex-1 min-w-0', className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-40 pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full text-sm rounded-lg pl-9 pr-9 py-2 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
        aria-label={ariaLabel}
      />
      {hasValue && (
        <button
          type="button"
          onClick={() => onChange({ target: { value: '' } })}
          className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-md opacity-50 hover:opacity-90 hover:bg-white/10 transition-opacity"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
