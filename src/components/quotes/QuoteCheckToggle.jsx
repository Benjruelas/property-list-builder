import { CheckSquare, Square } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Icon toggle matching map-panel / task list checkbox style (CheckSquare + Square).
 */
export function QuoteCheckToggle({
  checked,
  onChange,
  label,
  variant = 'glass',
  className,
  iconOnly = false,
  'aria-label': ariaLabel,
}) {
  const isGlass = variant === 'glass'

  const icon = checked ? (
    <CheckSquare className="h-[18px] w-[18px] shrink-0 fill-green-600 text-green-600" />
  ) : (
    <Square className={cn('h-[18px] w-[18px] shrink-0', isGlass ? 'text-white/70' : 'text-gray-400')} />
  )

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel || (typeof label === 'string' ? label : undefined)}
      onClick={() => onChange(!checked)}
      className={cn(
        'inline-flex items-center shrink-0 transition-colors',
        iconOnly
          ? cn('p-0.5 rounded-md', isGlass ? 'hover:bg-white/10' : 'hover:bg-gray-100')
          : cn(
              'gap-2.5 w-full text-left text-sm py-1 rounded-md',
              isGlass ? 'hover:bg-white/[0.04] text-white/95' : 'hover:bg-gray-50 text-gray-900'
            ),
        className
      )}
    >
      {icon}
      {!iconOnly && label != null && <span>{label}</span>}
    </button>
  )
}
