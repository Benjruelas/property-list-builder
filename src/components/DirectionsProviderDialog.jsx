import { Navigation } from 'lucide-react'
import { LeadContactPickerDialog } from './leads/LeadContactPickerDialog'
import { AppleMapsIcon, GoogleMapsIcon } from './directionsProviderIcons'

function openDirections(lat, lng, provider) {
  const url = provider === 'apple'
    ? `https://maps.apple.com/?daddr=${lat},${lng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${lat}%2C${lng}`
  window.open(url, '_blank')
}

export function DirectionsProviderDialog({
  open,
  onOpenChange,
  lat,
  lng,
  nestedOverlay = true,
}) {
  const disabled = lat == null || lng == null

  const handleSelect = (provider) => {
    if (disabled) return
    openDirections(lat, lng, provider)
  }

  return (
    <LeadContactPickerDialog
      open={open && !disabled}
      onOpenChange={onOpenChange}
      title="Directions"
      icon={Navigation}
      nestedOverlay={nestedOverlay}
      items={[
        { value: 'google', title: 'Google Maps', icon: GoogleMapsIcon },
        { value: 'apple', title: 'Apple Maps', icon: AppleMapsIcon },
      ]}
      onSelect={handleSelect}
    />
  )
}
