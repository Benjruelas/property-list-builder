import { cn } from '@/lib/utils'
import { TagChip } from './TagChip'

export function TagFilterBar({ tags = [], selectedIds = [], onChange, className }) {
  if (!tags.length) return null

  const toggle = (id) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id]
    onChange?.(next)
  }

  const allSelected = selectedIds.length === 0

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      <button
        type="button"
        className={cn(
          'panel-filter-option',
          allSelected && 'panel-filter-option--active'
        )}
        onClick={() => onChange?.([])}
        aria-pressed={allSelected}
      >
        All
      </button>
      {tags.map((tag) => (
        <TagChip
          key={tag.id}
          tag={tag}
          size="sm"
          variant="filter"
          selected={selectedIds.includes(tag.id)}
          onClick={() => toggle(tag.id)}
        />
      ))}
    </div>
  )
}
