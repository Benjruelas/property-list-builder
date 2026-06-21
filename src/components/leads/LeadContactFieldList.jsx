import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatPhoneAsYouType } from '@/utils/phoneFormat'
import { CONTACT_SOURCE_USER } from '@/utils/leadContact'
import { LeadContactSourceIcon } from './LeadContactSourceIcon'

function updateEntries(entries, index, patch) {
  return entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry))
}

function removeEntry(entries, index) {
  const next = entries.filter((_, i) => i !== index)
  return next.length
    ? next
    : [{ value: '', source: CONTACT_SOURCE_USER, callerId: '', primary: false }]
}

export function LeadContactFieldList({
  kind,
  entries,
  onChange,
  disabled = false,
  className,
}) {
  const isPhone = kind === 'phone'
  const label = isPhone ? 'Phone' : 'Email'
  const addLabel = isPhone ? 'Add phone' : 'Add email'

  return (
    <div className={cn('lead-contact-field-group', className)}>
      <label className="text-xs opacity-60 mb-1.5 block">{label}</label>
      <div className="space-y-2">
        {entries.map((entry, index) => (
          <div key={`${kind}-${index}`} className="lead-contact-field-row">
            <span className="lead-contact-field-index" aria-hidden>
              {index + 1}
            </span>
            <span className="lead-contact-source-slot" aria-hidden>
              <LeadContactSourceIcon detail={entry} className="h-3.5 w-3.5 opacity-70" />
            </span>
            <input
              type={isPhone ? 'tel' : 'email'}
              value={entry.value ?? ''}
              onChange={(e) => {
                const nextValue = isPhone ? formatPhoneAsYouType(e.target.value) : e.target.value
                onChange(updateEntries(entries, index, {
                  value: nextValue,
                  source: CONTACT_SOURCE_USER,
                }))
              }}
              disabled={disabled}
              autoComplete={isPhone ? 'tel' : 'email'}
              placeholder={isPhone ? '(555) 555-5555' : 'name@example.com'}
              className="lead-contact-field-input w-full text-sm rounded-lg px-3 py-2 bg-white/5 border border-white/15"
            />
            {entries.length > 1 && (
              <button
                type="button"
                disabled={disabled}
                className="lead-contact-field-remove"
                aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
                onClick={() => onChange(removeEntry(entries, index))}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={disabled}
        className="lead-contact-field-add"
        onClick={() => onChange([
          ...entries,
          { value: '', source: CONTACT_SOURCE_USER, callerId: '', primary: false },
        ])}
      >
        <Plus className="h-3.5 w-3.5" />
        {addLabel}
      </button>
    </div>
  )
}
