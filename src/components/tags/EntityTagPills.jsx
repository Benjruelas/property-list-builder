import { resolveTagMeta } from '@/utils/tags'
import { TagChip } from './TagChip'
import { cn } from '@/lib/utils'

/** Read-only tag pills for list rows. Renders nothing when the item has no tags. */
export function EntityTagPills({ entity, tagRegistry, type, className, onClick }) {
  const tags = resolveTagMeta(entity, tagRegistry, type)
  if (!tags.length) return null

  return (
    <div
      className={cn('entity-tag-pills flex flex-wrap gap-1', className)}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.(e)
      }}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onClick(e)
        }
      } : undefined}
    >
      {tags.map((tag) => (
        <TagChip key={tag.id} tag={tag} variant="crmRow" />
      ))}
    </div>
  )
}
