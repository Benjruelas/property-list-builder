import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function TagChip({
  tag,
  onRemove,
  onClick,
  selected = false,
  className,
  size = 'sm',
}) {
  if (!tag?.name) return null
  const color = tag.color || '#2563eb'
  const isSmall = size === 'sm'
  const interactive = Boolean(onClick)
  const Component = interactive ? 'button' : 'span'

  return (
    <Component
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={interactive ? selected : undefined}
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium max-w-full',
        isSmall ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        interactive && 'cursor-pointer transition-opacity hover:opacity-90',
        selected && 'ring-1 ring-offset-1 ring-offset-transparent',
        className
      )}
      style={{
        backgroundColor: selected ? `${color}33` : `${color}22`,
        color,
        border: `1px solid ${color}${selected ? '66' : '44'}`,
        ...(selected ? { ringColor: color } : {}),
      }}
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
