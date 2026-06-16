import { cn } from '@/lib/utils'

export function ParcelDetailsActionTile({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  variant = 'default',
  active = false,
  className,
  children,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        'parcel-details-action-tile',
        variant !== 'default' && `parcel-details-action-tile--${variant}`,
        active && 'parcel-details-action-tile--active',
        className,
      )}
    >
      {children ?? (Icon ? <Icon className="parcel-details-action-icon" aria-hidden /> : null)}
      <span className="parcel-details-action-label">{label}</span>
    </button>
  )
}
