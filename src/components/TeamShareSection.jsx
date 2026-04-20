import { UsersRound, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Compact multi-select team picker for share dialogs. Shows every team the
 * user owns or is a member of, with a checkmark when selected. Calls
 * onToggle(teamId) when the user taps a row.
 *
 * Read-only fallback (when saving=true) prevents accidental double-toggles.
 */
export function TeamShareSection({
  teams = [],
  selectedTeamIds = [],
  onToggle,
  disabled = false,
  title = 'Share with a team',
  description = 'All members of the selected team(s) will gain access.'
}) {
  if (!Array.isArray(teams) || teams.length === 0) {
    return (
      <div className="mb-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{title}</p>
        <p className="text-xs text-gray-500">
          You're not in any teams yet. Open the Teams menu to create or join one.
        </p>
      </div>
    )
  }

  const selected = new Set(selectedTeamIds || [])

  return (
    <div className="mb-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{title}</p>
      <p className="text-xs text-gray-500 mb-2">{description}</p>
      <ul className="space-y-1.5">
        {teams.map((team) => {
          const on = selected.has(team.id)
          const memberCount = (team.members || []).length
          return (
            <li key={team.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onToggle?.(team.id)}
                className={cn(
                  'w-full flex items-center gap-2 py-2 px-2.5 rounded-md border transition-colors text-left',
                  on
                    ? 'bg-blue-500/15 border-blue-500/40'
                    : 'bg-black/10 border-transparent hover:bg-black/15',
                  disabled && 'opacity-60 cursor-not-allowed'
                )}
              >
                <div
                  className={cn(
                    'h-4 w-4 rounded border flex items-center justify-center flex-shrink-0',
                    on ? 'border-blue-400 bg-blue-500/80 text-white' : 'border-white/40'
                  )}
                >
                  {on && <Check className="h-3 w-3" strokeWidth={3} />}
                </div>
                <UsersRound className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                <span className="text-sm text-gray-200 truncate flex-1">{team.name}</span>
                <span className="text-[10px] text-gray-500">
                  {memberCount} member{memberCount === 1 ? '' : 's'}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * Compact badge rendered on a resource row, like "Team: Acme".
 */
export function TeamBadge({ teamIds = [], teams = [], className = '' }) {
  if (!teamIds || teamIds.length === 0 || !teams || teams.length === 0) return null
  const names = teamIds
    .map((id) => teams.find((t) => t.id === id))
    .filter(Boolean)
    .map((t) => t.name)
  if (names.length === 0) return null
  const label = names.length === 1 ? `Team: ${names[0]}` : `Teams: ${names.length}`
  return (
    <span
      className={cn(
        'text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-400/40 uppercase tracking-wide flex items-center gap-1',
        className
      )}
      title={names.join(', ')}
    >
      <UsersRound className="h-2.5 w-2.5" />
      {label}
    </span>
  )
}
