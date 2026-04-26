import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Checkbox list of team members for task assignment (team-shared pipelines).
 *
 * @param {Array<{ uid: string, email: string }>} members
 * @param {string[]} selectedUids
 * @param {(uid: string) => void} onToggle
 */
export function TeamMemberAssignSection({
  members = [],
  selectedUids = [],
  onToggle,
  disabled = false,
  title = 'Assign',
  description = 'Select who is responsible (optional).',
  className = ''
}) {
  if (!Array.isArray(members) || members.length === 0) return null
  const sel = new Set(selectedUids || [])

  return (
    <div className={className}>
      <p className="text-xs font-medium block mb-1 opacity-90">{title}</p>
      <p className="text-[11px] text-white/50 mb-2">{description}</p>
      <ul className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-hide">
        {members.map((m) => {
          const on = sel.has(m.uid)
          return (
            <li key={m.uid}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onToggle?.(m.uid)}
                className={cn(
                  'w-full flex items-center gap-2 py-2 px-2.5 rounded-md border text-left text-sm transition-colors',
                  on
                    ? 'bg-blue-500/15 border-blue-500/40 text-white/95'
                    : 'bg-black/10 border-transparent hover:bg-black/15 text-white/85',
                  disabled && 'opacity-50 cursor-not-allowed'
                )}
              >
                <span
                  className={cn(
                    'h-4 w-4 rounded border flex items-center justify-center flex-shrink-0',
                    on ? 'border-blue-400 bg-blue-500/80 text-white' : 'border-white/40'
                  )}
                >
                  {on && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span className="truncate flex-1">{m.email || m.uid}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Light theme variant for LeadDetails / Deal pipeline dialogs (gray-900 text). */
export function TeamMemberAssignSectionLight({
  members = [],
  selectedUids = [],
  onToggle,
  disabled = false,
  title = 'Assign',
  description = 'Select who is responsible (optional).',
  className = ''
}) {
  if (!Array.isArray(members) || members.length === 0) return null
  const sel = new Set(selectedUids || [])

  return (
    <div className={className}>
      <p className="text-xs font-medium text-gray-600 mb-1">{title}</p>
      <p className="text-[11px] text-gray-500 mb-2">{description}</p>
      <ul className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-hide">
        {members.map((m) => {
          const on = sel.has(m.uid)
          return (
            <li key={m.uid}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onToggle?.(m.uid)}
                className={cn(
                  'w-full flex items-center gap-2 py-2 px-2.5 rounded-md border text-left text-sm transition-colors',
                  on
                    ? 'bg-blue-50 border-blue-200 text-gray-900'
                    : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-800',
                  disabled && 'opacity-50 cursor-not-allowed'
                )}
              >
                <span
                  className={cn(
                    'h-4 w-4 rounded border flex items-center justify-center flex-shrink-0',
                    on ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-300'
                  )}
                >
                  {on && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span className="truncate flex-1">{m.email || m.uid}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
