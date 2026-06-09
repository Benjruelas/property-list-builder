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
    <div className={cn('flex flex-wrap gap-1', className)}>
      <button
        type="button"
        className={cn(
          'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border transition-colors',
          allSelected
            ? 'bg-white/15 border-white/25 text-white'
            : 'bg-white/[0.04] border-white/15 text-white/50 hover:text-white/75 hover:border-white/25'
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
          selected={selectedIds.includes(tag.id)}
          onClick={() => toggle(tag.id)}
        />
      ))}
    </div>
  )
}
