import { useEffect, useMemo, useState } from 'react'
import { formatAddressDetailDisplay } from '@/utils/leadAddresses'
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

function buildPickerItems(details) {
  return details.map((detail, index) => ({
    value: detail,
    detail,
    title: formatAddressDetailDisplay(detail),
    subtitle: details.length > 1 ? `Address ${index + 1}` : null,
  }))
}

export function LeadAddressActionTile({
  icon: Icon,
  label,
  addressDetails = [],
  filterDetail = () => true,
  onSelect,
  pickerTitle = 'Choose an address',
  nestedOverlay = true,
  onPickerOpenChange,
  disabledLabel,
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const list = useMemo(
    () => addressDetails.filter(filterDetail),
    [addressDetails, filterDetail],
  )
  const disabled = list.length === 0
  const primary = list[0]
  const display = primary ? formatAddressDetailDisplay(primary) : ''
  const title = list.length > 1 ? `${display} (+${list.length - 1} more)` : (display || label)

  const pickerItems = useMemo(() => buildPickerItems(list), [list])

  useEffect(() => {
    onPickerOpenChange?.(pickerOpen)
  }, [pickerOpen, onPickerOpenChange])

  const handlePickerOpenChange = (open) => {
    onPickerOpenChange?.(open)
    setPickerOpen(open)
  }

  if (list.length <= 1) {
    return (
      <LeadActionTile
        icon={Icon}
        label={label}
        value={display || (disabled ? (disabledLabel || `No ${label.toLowerCase()}`) : label)}
        disabled={disabled}
        onClick={() => primary && onSelect?.(primary)}
      />
    )
  }

  return (
    <>
      <LeadActionTile
        icon={Icon}
        label={label}
        value={title}
        onClick={() => {
          onPickerOpenChange?.(true)
          setPickerOpen(true)
        }}
      />
      <LeadContactPickerDialog
        open={pickerOpen}
        onOpenChange={handlePickerOpenChange}
        title={pickerTitle}
        icon={Icon}
        items={pickerItems}
        onSelect={(detail) => onSelect?.(detail)}
        nestedOverlay={nestedOverlay}
      />
    </>
  )
}
