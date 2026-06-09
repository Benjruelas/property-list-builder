import { Lock, Users, UserCheck, Check, ChevronDown } from 'lucide-react'
import { useState } from 'react'
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
  collapsible = false,
  defaultExpanded = false,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  if (!team) {
    return (
      <div className={cn('share-picker', className)}>
        <p className="share-picker-section-label">Sharing</p>
        <p className="share-picker-empty">Join or create a team to share with teammates.</p>
      </div>
    )
  }

  const members = (team.members || []).filter((m) => m.uid !== team.ownerId || true)
  const selected = new Set(sharedMemberUids || [])
  const shareSummary = visibilityLabel({
    visibility,
    sharedMemberUids,
    teamShares: visibility === VISIBILITY.TEAM ? [team.id] : [],
  })

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

  const pickerBody = (
    <>
      <p className="share-picker-hint">Control who on {team.name} can access this.</p>
      <ul className="share-picker-options" role="radiogroup" aria-label="Sharing visibility">
        {OPTIONS.map(({ value, label, icon: Icon, desc }) => {
          const on = visibility === value
          return (
            <li key={value}>
              <button
                type="button"
                role="radio"
                aria-checked={on}
                disabled={disabled}
                onClick={() => setVisibility(value)}
                className={cn('share-picker-option', on && 'share-picker-option--selected')}
              >
                <span className={cn('share-picker-radio', on && 'share-picker-radio--on')} aria-hidden>
                  {on && <span className="share-picker-radio-dot" />}
                </span>
                <Icon className="share-picker-option-icon" aria-hidden />
                <span className="share-picker-option-text">
                  <span className="share-picker-option-label">{label}</span>
                  <span className="share-picker-option-desc">{desc}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {visibility === VISIBILITY.MEMBERS && (
        <div className="share-picker-members">
          <p className="share-picker-members-label">Select members</p>
          <ul className="share-picker-members-list">
            {members.map((m) => {
              const on = selected.has(m.uid)
              return (
                <li key={m.uid}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleMember(m.uid)}
                    className={cn('share-picker-member', on && 'share-picker-member--selected')}
                  >
                    <span className={cn('share-picker-member-check', on && 'share-picker-member-check--on')}>
                      {on && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                    </span>
                    <span className="truncate">{m.email || m.uid}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {allowExternalSharing && onSharedWithChange && (
        <div className="share-picker-external">
          <p className="share-picker-members-label">External emails (optional)</p>
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
            className="share-dialog-input"
          />
        </div>
      )}
    </>
  )

  return (
    <div className={cn('share-picker', className)}>
      {collapsible ? (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="share-picker-collapse-trigger"
            aria-expanded={expanded}
          >
            <div className="min-w-0">
              <p className="share-picker-section-label">Sharing</p>
              <p className="share-picker-summary">{shareSummary}</p>
            </div>
            <ChevronDown className={cn('share-picker-chevron', expanded && 'share-picker-chevron--open')} />
          </button>
          {expanded && <div className="share-picker-collapse-body">{pickerBody}</div>}
        </>
      ) : (
        <>
          <p className="share-picker-section-label">Sharing</p>
          {pickerBody}
        </>
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
