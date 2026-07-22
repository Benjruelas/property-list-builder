import { Plus, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AddressAutocompleteField } from '../AddressAutocompleteField'

function updateEntries(entries, index, patch) {
  return entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry))
}

function removeEntry(entries, index) {
  const next = entries.filter((_, i) => i !== index)
  return next.length
    ? next
    : [{
      value: '',
      parcelId: null,
      lat: null,
      lng: null,
      properties: null,
      primary: false,
    }]
}

export function LeadAddressFieldList({
  entries,
  onChange,
  disabled = false,
  resolvingIndex = null,
  onSelectResult,
  className,
}) {
  return (
    <div className={cn('lead-contact-field-group', className)}>
      <label className="text-xs opacity-60 mb-1.5 block">Property Address</label>
      <div className="space-y-2">
        {entries.map((entry, index) => (
          <div key={`address-${index}`} className="lead-contact-field-row">
            <span className="lead-contact-field-index" aria-hidden>
              {index + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <AddressAutocompleteField
                value={entry.value ?? ''}
                onChange={(v) => onChange(updateEntries(entries, index, {
                  value: v ?? '',
                  parcelId: null,
                  lat: null,
                  lng: null,
                  properties: null,
                }))}
                onSelectResult={(result) => onSelectResult?.(index, result)}
                disabled={disabled}
              />
              {resolvingIndex === index && (
                <p className="text-[11px] opacity-50 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Linking parcel…
                </p>
              )}
              {entry.parcelId && resolvingIndex !== index && (
                <p className="text-[11px] text-emerald-400/80">Linked to parcel on map</p>
              )}
            </div>
            {entries.length > 1 && (
              <button
                type="button"
                disabled={disabled}
                className="lead-contact-field-remove"
                aria-label={`Remove address ${index + 1}`}
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
          {
            value: '',
            parcelId: null,
            lat: null,
            lng: null,
            properties: null,
            primary: false,
          },
        ])}
      >
        <Plus className="h-3.5 w-3.5" />
        Add address
      </button>
    </div>
  )
}
