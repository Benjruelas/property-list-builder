import { Lock, Users, UserCheck, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { VISIBILITY, visibilityLabel } from '@/utils/access'

const OPTIONS = [
  { value: VISIBILITY.PRIVATE, label: 'Private', icon: Lock, desc: 'Only you can see and edit' },
  { value: VISIBILITY.TEAM, label: 'Whole team', icon: Users, desc: 'All team members can view and edit' },
  { value: VISIBILITY.MEMBERS, label: 'Specific members', icon: UserCheck, desc: 'Pick who can view and edit' },
]

/**
 * v2 share picker — private | team | specific members.
 */
export function ResourceSharePicker({
  team = null,
  visibility = VISIBILITY.PRIVATE,
  sharedMemberUids = [],
  onChange,
  disabled = false,
  allowExternalSharing = false,
  sharedWithEmails = [],
  onSharedWithChange,
  className = '',
}) {
  if (!team) {
    return (
      <div className={cn('mb-4', className)}>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Sharing</p>
        <p className="text-xs text-gray-500">Join or create a team to share with teammates.</p>
      </div>
    )
  }

  const members = (team.members || []).filter((m) => m.uid !== team.ownerId || true)
  const selected = new Set(sharedMemberUids || [])

  const setVisibility = (v) => {
    onChange?.({
      visibility: v,
      sharedMemberUids: v === VISIBILITY.MEMBERS ? sharedMemberUids : [],
    })
  }

  const toggleMember = (uid) => {
    const next = selected.has(uid)
      ? (sharedMemberUids || []).filter((id) => id !== uid)
      : [...(sharedMemberUids || []), uid]
    onChange?.({ visibility: VISIBILITY.MEMBERS, sharedMemberUids: next })
  }

  return (
    <div className={cn('mb-4', className)}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Sharing</p>
      <p className="text-xs text-gray-500 mb-2">Control who on {team.name} can access this.</p>
      <ul className="space-y-1.5 mb-3">
        {OPTIONS.map(({ value, label, icon: Icon, desc }) => {
          const on = visibility === value
          return (
            <li key={value}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setVisibility(value)}
                className={cn(
                  'w-full flex items-start gap-2 py-2 px-2.5 rounded-md border transition-colors text-left',
                  on ? 'bg-blue-500/15 border-blue-500/40' : 'bg-black/10 border-transparent hover:bg-black/15',
                  disabled && 'opacity-60 cursor-not-allowed'
                )}
              >
                <div
                  className={cn(
                    'h-4 w-4 mt-0.5 rounded border flex items-center justify-center flex-shrink-0',
                    on ? 'border-blue-400 bg-blue-500/80 text-white' : 'border-white/40'
                  )}
                >
                  {on && <Check className="h-3 w-3" strokeWidth={3} />}
                </div>
                <Icon className="h-3.5 w-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-gray-200 block">{label}</span>
                  <span className="text-[11px] text-gray-500 block">{desc}</span>
                </div>
              </button>
            </li>
          )
        })}
      </ul>

      {visibility === VISIBILITY.MEMBERS && (
        <div className="mb-3 pl-1">
          <p className="text-[11px] text-gray-500 mb-1.5">Select members</p>
          <ul className="space-y-1 max-h-40 overflow-y-auto scrollbar-hide">
            {members.map((m) => {
              const on = selected.has(m.uid)
              return (
                <li key={m.uid}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleMember(m.uid)}
                    className={cn(
                      'w-full flex items-center gap-2 py-1.5 px-2 rounded-md text-left text-sm',
                      on ? 'bg-blue-500/10 text-blue-200' : 'text-gray-300 hover:bg-black/10'
                    )}
                  >
                    <div
                      className={cn(
                        'h-3.5 w-3.5 rounded border flex items-center justify-center',
                        on ? 'border-blue-400 bg-blue-500/80' : 'border-white/30'
                      )}
                    >
                      {on && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                    </div>
                    <span className="truncate">{m.email || m.uid}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {allowExternalSharing && onSharedWithChange && (
        <div>
          <p className="text-[11px] text-gray-500 mb-1">External emails (optional)</p>
          <input
            type="text"
            disabled={disabled}
            value={(sharedWithEmails || []).join(', ')}
            onChange={(e) => {
              const emails = e.target.value
                .split(/[,;\s]+/)
                .map((s) => s.trim().toLowerCase())
                .filter(Boolean)
              onSharedWithChange(emails)
            }}
            placeholder="user@example.com"
            className="w-full text-sm rounded-lg px-3 py-2 bg-white/5 border border-white/15"
          />
        </div>
      )}
    </div>
  )
}

export function VisibilityBadge({ resource, className = '' }) {
  const label = visibilityLabel(resource)
  const r = resource || {}
  const isPrivate = !r.visibility || r.visibility === VISIBILITY.PRIVATE
  if (isPrivate && !(r.teamShares?.length)) return null
  return (
    <span
      className={cn(
        'text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-400/40 uppercase tracking-wide',
        className
      )}
    >
      {label}
    </span>
  )
}
