import { useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronRight, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  filterTeamMembers,
  memberInitials,
  memberPrimaryLabel,
  memberSecondaryLabel,
} from './entityPickerShared'

const ROW_CLASS =
  'flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-all cursor-pointer'

function MemberAvatar({ member, selected = false, size = 'md', className = '' }) {
  const sizeClass = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs'
  return (
    <span
      className={cn(
        'rounded-full flex items-center justify-center font-semibold shrink-0',
        sizeClass,
        selected ? 'bg-blue-500/35 text-white ring-1 ring-blue-400/40' : 'bg-white/12 text-white/85',
        className
      )}
      aria-hidden
    >
      {memberInitials(member)}
    </span>
  )
}

function SelectedMemberChip({ member, onRemove, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onRemove}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-blue-500/35 bg-blue-500/12',
        'pl-1 pr-2 py-0.5 text-xs text-white/90 max-w-full hover:bg-blue-500/20 transition-colors',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
      aria-label={`Remove ${memberPrimaryLabel(member)}`}
    >
      <MemberAvatar member={member} selected size="sm" />
      <span className="truncate">{memberPrimaryLabel(member)}</span>
      <X className="h-3 w-3 shrink-0 opacity-55" aria-hidden />
    </button>
  )
}

function AssignSummary({ members, maxAvatars = 3 }) {
  if (members.length === 0) return null
  if (members.length === 1) {
    return (
      <span className="ml-auto flex items-center gap-1.5 min-w-0">
        <MemberAvatar member={members[0]} selected size="sm" />
        <span className="text-xs font-normal text-white/60 truncate">
          {memberPrimaryLabel(members[0])}
        </span>
      </span>
    )
  }
  return (
    <span className="ml-auto flex items-center gap-1 shrink-0">
      {members.slice(0, maxAvatars).map((member, idx) => (
        <MemberAvatar
          key={member.uid}
          member={member}
          selected
          size="sm"
          className={idx > 0 ? '-ml-2 ring-2 ring-[#1a1a1a]' : ''}
        />
      ))}
      <span className="text-xs font-normal text-white/55 pl-0.5">
        {members.length} assigned
      </span>
    </span>
  )
}

/**
 * Team member multi-select — searchable list with avatars and optional collapsible section.
 */
export function TeamMemberPickerField({
  label = 'Assign to',
  members = [],
  selectedUids = [],
  onToggle,
  onClearAll,
  disabled = false,
  description = '',
  collapsible = false,
  defaultExpanded = false,
  className = '',
}) {
  const [search, setSearch] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const [sectionExpanded, setSectionExpanded] = useState(defaultExpanded)

  const selected = useMemo(() => new Set(selectedUids || []), [selectedUids])
  const selectedMembers = useMemo(
    () => (members || []).filter((m) => selected.has(m.uid)),
    [members, selected]
  )
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

  const handleClearAll = () => {
    if (onClearAll) {
      onClearAll()
      return
    }
    for (const uid of selectedUids || []) onToggle?.(uid)
  }

  const pickerContent = (
    <div className="space-y-2">
      {selectedMembers.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {selectedMembers.map((member) => (
            <SelectedMemberChip
              key={member.uid}
              member={member}
              disabled={disabled}
              onRemove={() => onToggle?.(member.uid)}
            />
          ))}
          {selectedMembers.length > 1 && (
            <button
              type="button"
              disabled={disabled}
              onClick={handleClearAll}
              className="text-[11px] text-white/45 hover:text-white/70 px-1 py-0.5 transition-colors disabled:opacity-50"
            >
              Clear all
            </button>
          )}
        </div>
      )}

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
            className="w-full text-sm pl-9 pr-3 py-2 bg-transparent border-0 outline-none"
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
          className="entity-picker-list max-h-44 overflow-y-auto scrollbar-hide p-1.5 space-y-1"
          role="listbox"
          aria-label="Team members"
          aria-multiselectable="true"
        >
          {filteredMembers.length === 0 ? (
            <li className="text-sm opacity-50 py-5 px-3 text-center">
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
                      ROW_CLASS,
                      on
                        ? 'border-blue-500/40 bg-blue-500/10'
                        : highlightIndex === idx
                          ? 'border-white/35 bg-white/10'
                          : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.99]'
                    )}
                  >
                    <MemberAvatar member={member} selected={on} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium truncate">{primary}</span>
                      {secondary ? (
                        <span className="block text-xs opacity-55 truncate" title={secondary}>
                          {secondary}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        'h-4 w-4 rounded border flex items-center justify-center shrink-0',
                        on ? 'border-blue-400 bg-blue-500/80 text-white' : 'border-white/30'
                      )}
                      aria-hidden
                    >
                      {on && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                    </span>
                  </button>
                </li>
              )
            })
          )}
        </ul>
      </div>
    </div>
  )

  const normalizedLabel = (label || 'Assign to').replace(/:+\s*$/, '')

  if (collapsible) {
    return (
      <div className={cn('entity-picker-field', className)}>
        <div className="rounded-lg border border-white/15 bg-white/[0.03] overflow-hidden">
          <button
            type="button"
            onClick={() => setSectionExpanded((v) => !v)}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-white/90 hover:bg-white/5 transition-colors min-w-0"
            aria-expanded={sectionExpanded}
          >
            {sectionExpanded ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-white/60" aria-hidden />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-white/60" aria-hidden />
            )}
            <span className="shrink-0">{normalizedLabel}</span>
            {!sectionExpanded && <AssignSummary members={selectedMembers} />}
          </button>
          {sectionExpanded && (
            <div className="border-t border-white/15 px-3 pb-3 pt-2 space-y-1.5">
              {description ? (
                <p className="text-[11px] text-white/50 leading-snug">{description}</p>
              ) : null}
              {pickerContent}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('entity-picker-field', className)}>
      <label className="text-xs font-medium block mb-1 opacity-90">{normalizedLabel}</label>
      {description ? <p className="text-[11px] text-white/50 mb-1.5">{description}</p> : null}
      {pickerContent}
    </div>
  )
}

export default TeamMemberPickerField
