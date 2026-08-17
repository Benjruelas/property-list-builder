import { useCallback, useEffect, useState } from 'react'
import { GripVertical, Loader2, Plus, Trash2, X } from 'lucide-react'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { InlineDropdown } from '../InlineDropdown'
import { showToast } from '../ui/toast'
import { updateTeamSettings } from '@/utils/teams'
import {
  CUSTOM_FIELD_TYPES,
  createDraftCustomField,
  normalizeCustomFieldDefs,
} from '@/utils/customFields'

/**
 * Settings editor for lead or deal custom field definitions.
 */
export function CustomFieldsSettingsContent({
  isOpen,
  scope = 'leads',
  fields = [],
  canEdit = false,
  teamMembership = null,
  getToken,
  onSaveUserFields,
  onTeamsChange,
}) {
  const [draft, setDraft] = useState(() => normalizeCustomFieldDefs(fields))
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const settingsKey = scope === 'deals' ? 'dealCustomFields' : 'leadCustomFields'
  const entityLabel = scope === 'deals' ? 'deal' : 'lead'

  useEffect(() => {
    if (!isOpen) {
      setDirty(false)
      return
    }
    // Don't clobber in-progress edits when parent re-renders with a new
    // fields array reference (resolve*CustomFields is often inline).
    if (dirty) return
    setDraft(normalizeCustomFieldDefs(fields))
  }, [isOpen, fields, dirty])

  const updateField = useCallback((id, patch) => {
    setDraft((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    setDirty(true)
  }, [])

  const updateOption = useCallback((fieldId, index, value) => {
    setDraft((rows) => rows.map((r) => {
      if (r.id !== fieldId) return r
      const options = [...(r.options || [])]
      options[index] = value
      return { ...r, options }
    }))
    setDirty(true)
  }, [])

  const addOption = useCallback((fieldId) => {
    setDraft((rows) => rows.map((r) => {
      if (r.id !== fieldId) return r
      return { ...r, options: [...(r.options || []), ''] }
    }))
    setDirty(true)
  }, [])

  const removeOption = useCallback((fieldId, index) => {
    setDraft((rows) => rows.map((r) => {
      if (r.id !== fieldId) return r
      const options = [...(r.options || [])]
      if (options.length <= 1) {
        options[0] = ''
        return { ...r, options }
      }
      options.splice(index, 1)
      return { ...r, options }
    }))
    setDirty(true)
  }, [])

  const removeField = useCallback((id) => {
    setDraft((rows) => rows.filter((r) => r.id !== id))
    setDirty(true)
  }, [])

  const addField = useCallback(() => {
    setDraft((rows) => [...rows, createDraftCustomField('', rows, 'text')])
    setDirty(true)
  }, [])

  const moveField = useCallback((id, dir) => {
    setDraft((rows) => {
      const idx = rows.findIndex((r) => r.id === id)
      if (idx < 0) return rows
      const next = idx + dir
      if (next < 0 || next >= rows.length) return rows
      const copy = [...rows]
      const [item] = copy.splice(idx, 1)
      copy.splice(next, 0, item)
      return copy
    })
    setDirty(true)
  }, [])

  const handleSave = useCallback(async () => {
    const normalized = normalizeCustomFieldDefs(draft)
    setSaving(true)
    try {
      if (teamMembership?.teamId && teamMembership.role === 'admin') {
        await updateTeamSettings(getToken, teamMembership.teamId, { [settingsKey]: normalized })
        await onTeamsChange?.()
      } else {
        onSaveUserFields?.(normalized)
      }
      setDraft(normalized)
      setDirty(false)
      showToast(`${entityLabel[0].toUpperCase()}${entityLabel.slice(1)} fields saved`, 'success')
    } catch (e) {
      showToast(e.message || `Failed to save ${entityLabel} fields`, 'error')
    } finally {
      setSaving(false)
    }
  }, [draft, entityLabel, getToken, onSaveUserFields, onTeamsChange, settingsKey, teamMembership])

  const description = teamMembership
    ? (canEdit
      ? `Add custom fields shown on every ${entityLabel}. Team members can fill them in; only admins can change the field list.`
      : `Custom fields are set by your team admin for ${teamMembership.teamName || 'your team'}.`)
    : `Add custom fields shown on your ${entityLabel}s.`

  return (
    <>
      <p className="text-xs opacity-50 mb-2">{description}</p>

      <ul className="space-y-2">
        {draft.map((row, index) => (
          <li
            key={row.id}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2 space-y-2"
          >
            <div className="flex items-center gap-2">
              {canEdit && (
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    type="button"
                    className="text-white/30 hover:text-white/60 disabled:opacity-20"
                    disabled={index === 0}
                    onClick={() => moveField(row.id, -1)}
                    aria-label="Move up"
                  >
                    <GripVertical className="h-3.5 w-3.5 rotate-90" />
                  </button>
                </div>
              )}
              {canEdit ? (
                <Input
                  value={row.label}
                  onChange={(e) => updateField(row.id, { label: e.target.value })}
                  maxLength={60}
                  placeholder="Field label"
                  className="flex-1 min-w-0 h-8 text-sm"
                  aria-label="Field label"
                />
              ) : (
                <span className="flex-1 text-sm text-white/85">{row.label}</span>
              )}
              {canEdit ? (
                <InlineDropdown
                  value={row.type}
                  onChange={(type) => {
                    if (type === 'select') {
                      updateField(row.id, {
                        type,
                        options: row.options?.length ? row.options : [''],
                      })
                    } else {
                      updateField(row.id, { type, options: undefined })
                    }
                  }}
                  options={CUSTOM_FIELD_TYPES}
                  showLabel={false}
                  className="w-[8.5rem] shrink-0"
                  triggerClassName="h-8 min-h-8 py-1 px-2 text-xs"
                />
              ) : (
                <span className="text-xs text-white/45 capitalize">{row.type}</span>
              )}
              {canEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-white/50 hover:text-red-300"
                  onClick={() => removeField(row.id)}
                  title="Remove field"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            {row.type === 'select' && (
              <div className="space-y-1.5 pl-1">
                {canEdit ? (
                  <>
                    {(row.options?.length ? row.options : ['']).map((opt, optIndex) => (
                      <div key={optIndex} className="flex items-center gap-1.5">
                        <Input
                          value={opt}
                          onChange={(e) => updateOption(row.id, optIndex, e.target.value)}
                          maxLength={80}
                          placeholder="Option"
                          className="flex-1 min-w-0 h-8 text-sm"
                          aria-label={`Option ${optIndex + 1}`}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-white/45 hover:text-red-300"
                          onClick={() => removeOption(row.id, optIndex)}
                          title="Remove option"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-white/55 hover:text-white/80 gap-1"
                      onClick={() => addOption(row.id)}
                    >
                      <Plus className="h-3 w-3" />
                      Add option
                    </Button>
                  </>
                ) : (
                  <p className="text-xs text-white/45">{(row.options || []).join(' · ')}</p>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {draft.length === 0 && (
        <p className="text-xs text-white/35 py-1">No custom fields yet.</p>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addField}>
            <Plus className="h-3.5 w-3.5" />
            Add field
          </Button>
          <Button type="button" size="sm" disabled={!dirty || saving} onClick={handleSave}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save fields'}
          </Button>
        </div>
      )}
    </>
  )
}
