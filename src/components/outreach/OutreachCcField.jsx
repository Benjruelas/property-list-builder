import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Input } from '../ui/input'
import {
  filterTeamMembers,
  memberPrimaryLabel,
  memberSecondaryLabel,
} from '../pickers/entityPickerShared'
import { isValidEmailAddress, normalizeEmailAddress } from '@/utils/outreachAttachments'
import { cn } from '@/lib/utils'

function EmailChip({ email, onRemove, disabled }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 pl-2.5 pr-1 py-0.5 text-xs max-w-full">
      <span className="truncate">{email}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={onRemove}
        className="rounded-full p-0.5 hover:bg-white/15 disabled:opacity-50"
        aria-label={`Remove ${email}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}

export function OutreachCcField({
  teamMembers = [],
  ccEmails = [],
  onChangeCcEmails,
  excludeEmail = '',
  disabled = false,
}) {
  const [draft, setDraft] = useState('')
  const [focused, setFocused] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const containerRef = useRef(null)
  const exclude = normalizeEmailAddress(excludeEmail)

  const ccSet = useMemo(
    () => new Set((ccEmails || []).map(normalizeEmailAddress).filter(Boolean)),
    [ccEmails],
  )

  const availableMembers = useMemo(
    () => (teamMembers || []).filter((member) => {
      const email = normalizeEmailAddress(member.email)
      return email && email !== exclude && !ccSet.has(email)
    }),
    [teamMembers, exclude, ccSet],
  )

  const filteredMembers = useMemo(
    () => filterTeamMembers(availableMembers, draft),
    [availableMembers, draft],
  )

  const showDropdown = focused && filteredMembers.length > 0

  useEffect(() => {
    const onDoc = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setFocused(false)
        setHighlightIndex(-1)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const addEmail = (email) => {
    const normalized = normalizeEmailAddress(email)
    if (!normalized || normalized === exclude || ccSet.has(normalized)) {
      setDraft('')
      return
    }
    onChangeCcEmails?.([...(ccEmails || []), normalized])
    setDraft('')
    setHighlightIndex(-1)
  }

  const addMember = (member) => {
    addEmail(member?.email)
  }

  const removeEmail = (email) => {
    onChangeCcEmails?.((ccEmails || []).filter((item) => item !== email))
  }

  const commitDraftEmail = () => {
    const normalized = normalizeEmailAddress(draft)
    if (isValidEmailAddress(normalized)) {
      addEmail(normalized)
    }
  }

  const handleKeyDown = (event) => {
    if (showDropdown) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setHighlightIndex((index) => Math.min(index + 1, filteredMembers.length - 1))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setHighlightIndex((index) => Math.max(index - 1, -1))
        return
      }
      if (event.key === 'Enter' && highlightIndex >= 0 && filteredMembers[highlightIndex]) {
        event.preventDefault()
        addMember(filteredMembers[highlightIndex])
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setFocused(false)
        setHighlightIndex(-1)
        return
      }
    }

    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commitDraftEmail()
    }
  }

  return (
    <div ref={containerRef} className="space-y-2">
      <label className="block text-sm font-medium text-white/75 mb-1">
        CC
      </label>

      {ccEmails.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {ccEmails.map((email) => (
            <EmailChip
              key={email}
              email={email}
              disabled={disabled}
              onRemove={() => removeEmail(email)}
            />
          ))}
        </div>
      )}

      <div className="relative">
        <Input
          type="text"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            setHighlightIndex(-1)
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            window.setTimeout(() => {
              if (containerRef.current?.contains(document.activeElement)) return
              commitDraftEmail()
            }, 120)
          }}
          onKeyDown={handleKeyDown}
          placeholder="Add team member or email…"
          disabled={disabled}
          autoComplete="off"
          className="bg-white/5 border-white/15"
        />

        {showDropdown && (
          <ul
            className="absolute z-[2000] mt-1 w-full max-h-44 overflow-y-auto rounded-lg border border-white/15 bg-black/90 backdrop-blur-md shadow-lg py-1"
            role="listbox"
            aria-label="Team members"
          >
            {filteredMembers.map((member, index) => {
              const secondary = memberSecondaryLabel(member)
              return (
                <li key={member.uid} role="option" aria-selected={highlightIndex === index}>
                  <button
                    type="button"
                    disabled={disabled}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm hover:bg-white/10',
                      highlightIndex === index && 'bg-white/10',
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => addMember(member)}
                  >
                    <span className="block font-medium truncate">{memberPrimaryLabel(member)}</span>
                    {secondary ? (
                      <span className="block text-xs opacity-55 truncate">{secondary}</span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
