import { useEffect, useMemo, useState } from 'react'
import { isSkipTracedLeadContact } from '@/utils/leadContact'
import { LeadContactPickerDialog } from './LeadContactPickerDialog'

function LeadActionTile({ icon: Icon, label, value, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={value || label}
      className="lead-detail-action-tile disabled:opacity-40"
    >
      <Icon className="lead-detail-action-icon shrink-0 opacity-80" aria-hidden />
      <span className="lead-detail-action-label">{label}</span>
    </button>
  )
}

function buildPickerItems({ values, contactDetails, formatValue, contactKind }) {
  if (contactDetails?.length) {
    return contactDetails
      .filter((detail) => detail?.value)
      .map((detail, index) => {
        const kindLabel = contactKind === 'email' ? 'Email' : 'Phone'
        let subtitle = detail.callerId?.trim() || ''
        if (!subtitle && isSkipTracedLeadContact(detail)) {
          subtitle = 'Skip traced'
        }
        if (!subtitle && contactDetails.length > 1) {
          subtitle = `${kindLabel} ${index + 1}`
        }
        return {
          value: detail.value,
          detail,
          title: formatValue(detail.value),
          subtitle: subtitle || null,
        }
      })
  }

  return values
    .filter(Boolean)
    .map((value, index) => ({
      value,
      title: formatValue(value),
      subtitle: values.length > 1 ? `${contactKind === 'email' ? 'Email' : 'Phone'} ${index + 1}` : null,
    }))
}

export function LeadContactActionTile({
  icon: Icon,
  label,
  values = [],
  contactDetails = null,
  contactKind = 'phone',
  formatValue = (v) => v,
  onSelect,
  pickerTitle,
  pickerSubtitle,
  nestedOverlay = true,
  onPickerOpenChange,
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const list = values.filter(Boolean)
  const disabled = list.length === 0
  const primary = list[0]
  const display = primary ? formatValue(primary) : ''
  const title = list.length > 1 ? `${display} (+${list.length - 1} more)` : (display || label)

  const pickerItems = useMemo(
    () => buildPickerItems({ values: list, contactDetails, formatValue, contactKind }),
    [list, contactDetails, formatValue, contactKind],
  )

  useEffect(() => {
    onPickerOpenChange?.(pickerOpen)
  }, [pickerOpen, onPickerOpenChange])

  const handlePickerOpenChange = (open) => {
    setPickerOpen(open)
  }

  if (list.length <= 1) {
    return (
      <LeadActionTile
        icon={Icon}
        label={label}
        value={display || (disabled ? `No ${label.toLowerCase()}` : label)}
        disabled={disabled}
        onClick={() => primary && onSelect?.(primary)}
      />
    )
  }

  const defaultSubtitle = contactKind === 'email'
    ? 'This lead has multiple emails. Pick one to continue.'
    : 'This lead has multiple phone numbers. Pick one to continue.'

  return (
    <>
      <LeadActionTile
        icon={Icon}
        label={label}
        value={title}
        onClick={() => setPickerOpen(true)}
      />
      <LeadContactPickerDialog
        open={pickerOpen}
        onOpenChange={handlePickerOpenChange}
        title={pickerTitle || `Choose a ${contactKind === 'email' ? 'email' : 'number'}`}
        icon={Icon}
        subtitle={pickerSubtitle || defaultSubtitle}
        items={pickerItems}
        onSelect={onSelect}
        nestedOverlay={nestedOverlay}
      />
    </>
  )
}
