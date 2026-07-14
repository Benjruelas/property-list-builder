import { useMemo, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAllTeamMembers } from '@/utils/teamTaskUtils'
import { memberPrimaryLabel, memberSecondaryLabel } from '@/components/pickers/entityPickerShared'
import { getSenderDisplayName } from '@/utils/profile'

/**
 * Select who appears as the sender on a client-facing quote/report.
 * Defaults to the current user; teammates from shared teams are selectable.
 */
export function SendAsField({
  currentUser,
  teams = [],
  senderUid = null,
  onChangeSenderUid,
  disabled = false,
  label = 'Send as',
  hint = null,
}) {
  const [open, setOpen] = useState(false)
  const teamMembers = useMemo(() => getAllTeamMembers(teams), [teams])

  const options = useMemo(() => {
    const me = {
      uid: currentUser?.uid || '',
      email: currentUser?.email || '',
      displayName: getSenderDisplayName(currentUser),
      isSelf: true,
    }
    const others = teamMembers
      .filter((m) => m.uid && m.uid !== currentUser?.uid)
      .map((m) => ({ ...m, isSelf: false }))
    return [me, ...others].filter((m) => m.uid)
  }, [currentUser, teamMembers])

  const selected = options.find((m) => m.uid === (senderUid || currentUser?.uid)) || options[0]
  const canPick = options.length > 1

  if (!canPick) {
    return (
      <div className="space-y-1">
        <label className="block text-sm font-medium text-white/75">{label}</label>
        <p className="text-sm text-white/70 px-1 py-2">
          {selected ? memberPrimaryLabel(selected) : getSenderDisplayName(currentUser)}
          {selected?.email ? (
            <span className="text-white/45"> · {selected.email}</span>
          ) : null}
        </p>
        {hint ? <p className="text-xs text-white/45 px-1">{hint}</p> : null}
      </div>
    )
  }

  return (
    <div className="space-y-1 relative">
      <label className="block text-sm font-medium text-white/75">{label}</label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'w-full min-h-[44px] px-3 py-2 rounded-lg border border-white/15 bg-white/5',
          'flex items-center gap-2 text-left text-sm text-white/90',
          'hover:bg-white/10 disabled:opacity-50',
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex-1 min-w-0 truncate">
          {memberPrimaryLabel(selected)}
          {selected?.isSelf ? ' (you)' : ''}
          {selected?.email ? (
            <span className="text-white/45"> · {selected.email}</span>
          ) : null}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
      </button>
      {hint ? <p className="text-xs text-white/45 px-1">{hint}</p> : null}

      {open && (
        <ul
          className="absolute z-[2000] mt-1 w-full max-h-52 overflow-y-auto rounded-lg border border-white/15 bg-black/90 backdrop-blur-md shadow-lg py-1"
          role="listbox"
          aria-label="Send as team member"
        >
          {options.map((member) => {
            const active = member.uid === selected?.uid
            const secondary = memberSecondaryLabel(member)
            return (
              <li key={member.uid}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/10',
                    active && 'bg-white/5',
                  )}
                  onClick={() => {
                    onChangeSenderUid?.(member.isSelf ? null : member.uid)
                    setOpen(false)
                  }}
                >
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-white/90">
                      {memberPrimaryLabel(member)}
                      {member.isSelf ? ' (you)' : ''}
                    </span>
                    {secondary ? (
                      <span className="block truncate text-xs text-white/45">{secondary}</span>
                    ) : null}
                  </span>
                  {active && <Check className="h-4 w-4 shrink-0 opacity-70" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
