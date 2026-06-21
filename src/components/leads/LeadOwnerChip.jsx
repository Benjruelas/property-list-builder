import { User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { displayLeadOwnerLabel, isLeadOwnedByCurrentUser } from '@/utils/leadOwner'

/** Shows who owns the lead when the viewer is not the owner. */
export function LeadOwnerChip({
  lead,
  teams = [],
  currentUser = null,
  currentUserId = null,
  className,
  compact = false,
}) {
  const uid = currentUser?.uid || currentUserId
  const viewer = currentUser || (uid ? { uid } : null)
  if (viewer && isLeadOwnedByCurrentUser(lead, viewer)) return null

  const label = displayLeadOwnerLabel(lead, { teams })
  if (!label) return null

  if (compact) {
    return (
      <span
        className={cn('inline-flex items-center gap-1 min-w-0 text-[11px] text-white/45 truncate', className)}
        title={`Lead owner: ${label}`}
      >
        <User className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
        <span className="truncate">{label}</span>
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 max-w-full text-[10px] px-2 py-0.5 rounded-md border border-white/15 bg-white/[0.06] text-white/70 font-medium',
        className,
      )}
      title={`Lead owner: ${label}`}
    >
      <User className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
      <span className="truncate">Owner: {label}</span>
    </span>
  )
}
