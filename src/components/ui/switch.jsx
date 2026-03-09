/**
 * Switch toggle - vertically centered thumb, clear on/off states.
 * Optimized for map-panel (dark glass) context.
 */

import { cn } from '@/lib/utils'

export function Switch({ checked, onChange, disabled, className, ...props }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-all duration-200',
        'border-2',
        checked
          ? 'border-amber-500 bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.4)]'
          : 'border-white/25 bg-white/10',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      {...props}
    >
      <span
        className={cn(
          'absolute left-0.5 top-1/2 inline-block h-4 w-4 rounded-full bg-white shadow-md transition-transform duration-200',
          '-translate-y-1/2',
          checked ? 'translate-x-5' : 'translate-x-0'
        )}
      />
    </button>
  )
}
