import { useCallback, useEffect, useState } from 'react'
import { GripVertical, Loader2, Plus, Trash2 } from 'lucide-react'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
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
    if (isOpen) {
      setDraft(normalizeCustomFieldDefs(fields))
      setDirty(false)
    }
  }, [isOpen, fields])

  const updateField = useCallback((id, patch) => {
    setDraft((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    setDirty(true)
  }, [])

  const removeField = useCallback((id) => {
    setDraft((rows) => rows.filter((r) => r.id !== id))
    setDirty(true)
  }, [])

  const addField = useCallback(() => {
    setDraft((rows) => [...rows, createDraftCustomField(`Field ${rows.length + 1}`, rows, 'text')])
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
                  className="flex-1 min-w-0 h-8 text-sm"
                  aria-label="Field label"
                />
              ) : (
                <span className="flex-1 text-sm text-white/85">{row.label}</span>
              )}
              {canEdit ? (
                <select
                  value={row.type}
                  onChange={(e) => {
                    const type = e.target.value
                    if (type === 'select') {
                      updateField(row.id, {
                        type,
                        options: row.options?.length ? row.options : ['Option 1'],
                      })
                    } else {
                      updateField(row.id, { type, options: undefined })
                    }
                  }}
                  className="h-8 rounded-md border border-white/10 bg-black/30 px-2 text-xs text-white/80"
                  aria-label="Field type"
                >
                  {CUSTOM_FIELD_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
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
              <div className="pl-1">
                {canEdit ? (
                  <Input
                    value={(row.options || []).join(', ')}
                    onChange={(e) => {
                      const options = e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean)
                      updateField(row.id, { options })
                    }}
                    placeholder="Options, comma-separated"
                    className="h-8 text-sm"
                    aria-label="Select options"
                  />
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
