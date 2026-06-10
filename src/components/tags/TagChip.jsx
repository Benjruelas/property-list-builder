import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function TagChip({
  tag,
  onRemove,
  onClick,
  selected = false,
  className,
  size = 'sm',
  variant = 'pill',
}) {
  if (!tag?.name) return null
  const color = tag.color || '#2563eb'
  const isSmall = size === 'sm'
  const interactive = Boolean(onClick)
  const isFilter = variant === 'filter'
  const Component = interactive ? 'button' : 'span'

  return (
    <Component
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={interactive ? selected : undefined}
      className={cn(
        'inline-flex items-center gap-1 font-medium max-w-full',
        isFilter
          ? cn(
              'panel-filter-option cursor-pointer',
              isSmall ? 'min-h-[30px] px-2.5 py-1 text-[11px]' : 'min-h-[34px] px-3 py-1.5 text-xs',
              selected && 'panel-filter-option--status-active'
            )
          : cn(
              'rounded-full',
              isSmall ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
              interactive && 'cursor-pointer transition-opacity hover:opacity-90',
              selected && 'ring-1 ring-offset-1 ring-offset-transparent'
            ),
        className
      )}
      style={
        isFilter
          ? {
              backgroundColor: selected ? `${color}33` : `${color}18`,
              color,
              border: `1px solid ${color}${selected ? '88' : '55'}`,
              boxShadow: selected
                ? `inset 0 0 0 1px ${color}33, 0 1px 2px rgba(0,0,0,0.12)`
                : '0 1px 2px rgba(0,0,0,0.1)',
            }
          : {
              backgroundColor: selected ? `${color}33` : `${color}22`,
              color,
              border: `1px solid ${color}${selected ? '66' : '44'}`,
              ...(selected ? { ringColor: color } : {}),
            }
      }
      title={tag.name}
    >
      <span className="truncate">{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          className="shrink-0 rounded-full hover:opacity-80"
          onClick={(e) => {
            e.stopPropagation()
            onRemove(tag)
          }}
          aria-label={`Remove ${tag.name}`}
        >
          <X className={isSmall ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        </button>
      )}
    </Component>
  )
}
