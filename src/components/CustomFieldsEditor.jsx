import { Input } from '@/components/ui/input'
import { InlineDropdown } from '@/components/InlineDropdown'
import { CustomDateField } from '@/components/CustomDateField'
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
          const options = (field.options || []).map((opt) => ({
            id: String(opt),
            label: String(opt),
          }))
          return (
            <div key={field.id} className="block space-y-1">
              <span className="text-xs text-white/55">{label}</span>
              <InlineDropdown
                value={value ? String(value) : ''}
                onChange={(next) => setValue(field.id, next || null)}
                options={options}
                placeholder="—"
                allowEmpty
                emptyLabel="—"
                showLabel={false}
                disabled={disabled}
                triggerClassName="h-9 min-h-9 py-1.5"
              />
            </div>
          )
        }
        if (field.type === 'date') {
          return (
            <div key={field.id} className="block space-y-1">
              <span className="text-xs text-white/55">{label}</span>
              <CustomDateField
                value={value || ''}
                disabled={disabled}
                onChange={(next) => setValue(field.id, next)}
              />
            </div>
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
