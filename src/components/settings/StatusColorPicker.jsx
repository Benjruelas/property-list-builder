import { STATUS_COLOR_SWATCHES } from '@/utils/statusColorPalette'
import { cn } from '@/lib/utils'

/**
 * Compact palette swatches for status color selection (mirrors parcel boundary swatches).
 */
export function StatusColorPicker({ value, onChange, disabled = false }) {
  if (disabled) return null

  return (
    <div className="flex flex-wrap gap-1.5 pt-1.5" role="group" aria-label="Status color">
      {STATUS_COLOR_SWATCHES.map((swatch) => {
        const active = value === swatch.color
        return (
          <div
            key={swatch.color}
            tabIndex={0}
            title={swatch.label}
            role="button"
            aria-label={swatch.label}
            aria-pressed={active}
            onClick={() => onChange?.(swatch.color)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onChange?.(swatch.color)
              }
            }}
            className={cn(
              'color-swatch h-6 w-6 rounded-full cursor-pointer transition-transform duration-150 flex-shrink-0',
              active
                ? 'scale-110 ring-2 ring-white/40 border-2 border-white'
                : 'border-2 border-white/25 hover:scale-105 hover:border-white/50',
            )}
            style={{ '--swatch-bg': swatch.hex }}
          />
        )
      })}
    </div>
  )
}
