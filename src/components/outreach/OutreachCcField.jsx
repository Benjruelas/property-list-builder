import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { TeamMemberPickerField } from '../pickers/TeamMemberPickerField'
import { isValidEmailAddress, normalizeEmailAddress } from '@/utils/outreachAttachments'

function EmailChip({ email, onRemove, disabled }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-gray-50 pl-2.5 pr-1 py-0.5 text-xs text-gray-700 max-w-full">
      <span className="truncate">{email}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={onRemove}
        className="rounded-full p-0.5 hover:bg-gray-200 disabled:opacity-50"
        aria-label={`Remove ${email}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}

export function OutreachCcField({
  teamMembers = [],
  selectedMemberUids = [],
  onToggleMember,
  externalEmails = [],
  onAddExternalEmail,
  onRemoveExternalEmail,
  excludeEmail = '',
  disabled = false,
}) {
  const [draftEmail, setDraftEmail] = useState('')
  const exclude = normalizeEmailAddress(excludeEmail)

  const memberCcEmails = useMemo(() => {
    const selected = new Set(selectedMemberUids || [])
    return (teamMembers || [])
      .filter((m) => selected.has(m.uid))
      .map((m) => normalizeEmailAddress(m.email))
      .filter(Boolean)
  }, [teamMembers, selectedMemberUids])

  const handleAddExternal = () => {
    const email = normalizeEmailAddress(draftEmail)
    if (!isValidEmailAddress(email)) return
    if (email === exclude) return
    if (memberCcEmails.includes(email) || externalEmails.includes(email)) {
      setDraftEmail('')
      return
    }
    onAddExternalEmail?.(email)
    setDraftEmail('')
  }

  return (
    <div className="space-y-3">
      {externalEmails.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {externalEmails.map((email) => (
            <EmailChip
              key={`external-${email}`}
              email={email}
              disabled={disabled}
              onRemove={() => onRemoveExternalEmail?.(email)}
            />
          ))}
        </div>
      )}

      {teamMembers.length > 0 && (
        <TeamMemberPickerField
          label="CC team members"
          members={teamMembers}
          selectedUids={selectedMemberUids}
          onToggle={onToggleMember}
          disabled={disabled}
          collapsible
          defaultExpanded={selectedMemberUids.length > 0}
        />
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          CC other emails
        </label>
        <div className="flex gap-2">
          <Input
            type="email"
            value={draftEmail}
            onChange={(e) => setDraftEmail(e.target.value)}
            placeholder="name@example.com"
            disabled={disabled}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAddExternal()
              }
            }}
          />
          <Button type="button" variant="outline" onClick={handleAddExternal} disabled={disabled}>
            Add
          </Button>
        </div>
      </div>
    </div>
  )
}
