import { Input } from '../ui/input'
import { cn } from '@/lib/utils'

/**
 * Renders and edits custom field values for a lead or deal.
 */
export function CustomFieldsEditor({
  fields = [],
  values = {},
  onChange,
  disabled = false,
  className = '',
}) {
  if (!fields?.length) return null

  const setValue = (fieldId, value) => {
    onChange?.({
      ...(values && typeof values === 'object' ? values : {}),
      [fieldId]: value === '' ? null : value,
    })
  }

  return (
    <div className={cn('space-y-3', className)}>
      <p className="text-xs font-medium text-white/50 uppercase tracking-wide">Custom fields</p>
      {fields.map((field) => {
        const value = values?.[field.id] ?? ''
        const label = field.label || field.id
        if (field.type === 'select') {
          return (
            <label key={field.id} className="block space-y-1">
              <span className="text-xs text-white/55">{label}</span>
              <select
                value={value || ''}
                disabled={disabled}
                onChange={(e) => setValue(field.id, e.target.value || null)}
                className="w-full h-9 rounded-md border border-white/10 bg-black/30 px-2 text-sm text-white/90"
              >
                <option value="">—</option>
                {(field.options || []).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </label>
          )
        }
        if (field.type === 'number') {
          return (
            <label key={field.id} className="block space-y-1">
              <span className="text-xs text-white/55">{label}</span>
              <Input
                type="number"
                value={value === null || value === undefined ? '' : value}
                disabled={disabled}
                onChange={(e) => {
                  const v = e.target.value
                  setValue(field.id, v === '' ? null : Number(v))
                }}
                className="h-9 text-sm"
              />
            </label>
          )
        }
        if (field.type === 'date') {
          return (
            <label key={field.id} className="block space-y-1">
              <span className="text-xs text-white/55">{label}</span>
              <Input
                type="date"
                value={value || ''}
                disabled={disabled}
                onChange={(e) => setValue(field.id, e.target.value || null)}
                className="h-9 text-sm"
              />
            </label>
          )
        }
        return (
          <label key={field.id} className="block space-y-1">
            <span className="text-xs text-white/55">{label}</span>
            <Input
              type="text"
              value={value || ''}
              disabled={disabled}
              maxLength={2000}
              onChange={(e) => setValue(field.id, e.target.value)}
              className="h-9 text-sm"
            />
          </label>
        )
      })}
    </div>
  )
}
