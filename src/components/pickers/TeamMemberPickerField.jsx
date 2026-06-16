import { useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ENTITY_ROW_CLASS, filterTeamMembers, memberPrimaryLabel } from './entityPickerShared'

function memberSecondaryLabel(member) {
  const primary = memberPrimaryLabel(member)
  const email = (member?.email || '').trim()
  const name = (member?.displayName || member?.name || '').trim()
  if (name && name !== primary) return name
  if (email && email !== primary) return email
  return 'Team member'
}

/**
 * Team member multi-select — same box UX as DealPickerField / LeadPickerField.
 */
export function TeamMemberPickerField({
  label = 'Assign to',
  members = [],
  selectedUids = [],
  onToggle,
  disabled = false,
  description = '',
  className = '',
}) {
  const [search, setSearch] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(-1)

  const selected = useMemo(() => new Set(selectedUids || []), [selectedUids])
  const filteredMembers = useMemo(() => {
    const list = filterTeamMembers(members, search)
    return [...list].sort((a, b) => {
      const aSel = selected.has(a.uid) ? 0 : 1
      const bSel = selected.has(b.uid) ? 0 : 1
      if (aSel !== bSel) return aSel - bSel
      return memberPrimaryLabel(a).localeCompare(memberPrimaryLabel(b))
    })
  }, [members, search, selected])

  if (!Array.isArray(members) || members.length === 0) return null

  return (
    <div className={cn('entity-picker-field', className)}>
      <label className="text-xs font-medium block mb-1 opacity-90">{label}</label>
      {description ? <p className="text-[11px] text-white/50 mb-1">{description}</p> : null}

      <div className="entity-picker-body entity-picker-body--list rounded-lg border border-white/15 bg-white/[0.03] overflow-hidden flex flex-col min-h-0">
        <div className="relative border-b border-white/10 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-40 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setHighlightIndex(-1)
            }}
            placeholder="Search by name or email…"
            className="w-full text-sm pl-9 pr-3 py-2.5 bg-transparent border-0 outline-none"
            aria-label="Search team members"
            onKeyDown={(e) => {
              if (filteredMembers.length === 0) return
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setHighlightIndex((i) => Math.min(i + 1, filteredMembers.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setHighlightIndex((i) => Math.max(i - 1, -1))
              } else if (e.key === 'Enter' && highlightIndex >= 0 && filteredMembers[highlightIndex]) {
                e.preventDefault()
                onToggle?.(filteredMembers[highlightIndex].uid)
              }
            }}
          />
        </div>

        <ul
          className="entity-picker-list max-h-52 overflow-y-auto scrollbar-hide p-1.5 space-y-1.5"
          role="listbox"
          aria-label="Team members"
          aria-multiselectable="true"
        >
          {filteredMembers.length === 0 ? (
            <li className="text-sm opacity-50 py-6 px-3 text-center">
              {members.length === 0 ? 'No team members.' : 'No members match your search.'}
            </li>
          ) : (
            filteredMembers.map((member, idx) => {
              const on = selected.has(member.uid)
              const primary = memberPrimaryLabel(member)
              const secondary = memberSecondaryLabel(member)
              return (
                <li key={member.uid} role="option" aria-selected={on}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onToggle?.(member.uid)}
                    className={cn(
                      ENTITY_ROW_CLASS,
                      'relative',
                      on
                        ? 'border-white/35 bg-white/[0.12]'
                        : highlightIndex === idx
                          ? 'border-white/40 bg-white/10'
                          : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98]'
                    )}
                  >
                    <div className="text-sm font-medium truncate pr-6">{primary}</div>
                    <div className="text-xs opacity-60 truncate" title={secondary}>
                      {secondary}
                    </div>
                    {on && (
                      <Check
                        className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/90"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                    )}
                  </button>
                </li>
              )
            })
          )}
        </ul>
      </div>
    </div>
  )
}

export default TeamMemberPickerField
