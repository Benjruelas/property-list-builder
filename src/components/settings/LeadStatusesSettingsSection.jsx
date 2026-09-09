import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, GripVertical, Loader2, Plus, Trash2 } from 'lucide-react'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { showToast } from '../ui/toast'
import { updateTeamSettings } from '@/utils/teams'
import {
  canRemoveLeadStatus,
  createDraftLeadStatus,
  normalizeLeadStatuses,
  PROTECTED_LEAD_STATUS_IDS,
} from '@/utils/leadStatuses'
import { cn } from '@/lib/utils'
import { StatusAutoTasksEditor } from './StatusAutoTasksEditor'
import { StatusColorPicker } from './StatusColorPicker'

function moveStatus(rows, id, toIndex) {
  const fromIndex = rows.findIndex((row) => row.id === id)
  if (fromIndex < 0 || toIndex < 0 || toIndex >= rows.length || fromIndex === toIndex) return rows
  const next = [...rows]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}

export function LeadStatusesSettingsContent({
  isOpen,
  leadStatuses,
  canEdit,
  teamMembership = null,
  teamMembers = [],
  getToken,
  onSaveUserStatuses,
  onTeamsChange,
}) {
  const [draft, setDraft] = useState(leadStatuses)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [dragId, setDragId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)

  useEffect(() => {
    if (!isOpen) {
      setDirty(false)
      setDragId(null)
      setDragOverId(null)
      return
    }
    // Don't clobber in-progress edits when parent re-renders with a new
    // leadStatuses array reference (resolveLeadStatuses is often inline).
    if (dirty) return
    setDraft(normalizeLeadStatuses(leadStatuses))
  }, [isOpen, leadStatuses, dirty])

  const updateLabel = useCallback((id, label) => {
    setDraft((rows) => rows.map((r) => (r.id === id ? { ...r, label } : r)))
    setDirty(true)
  }, [])

  const updateColor = useCallback((id, color) => {
    setDraft((rows) => rows.map((r) => (r.id === id ? { ...r, color } : r)))
    setDirty(true)
  }, [])

  const updateAutoTasks = useCallback((id, autoTasks) => {
    setDraft((rows) => rows.map((r) => (r.id === id ? { ...r, autoTasks } : r)))
    setDirty(true)
  }, [])

  const removeRow = useCallback((id) => {
    setDraft((rows) => {
      if (!canRemoveLeadStatus(id, rows)) return rows
      return rows.filter((r) => r.id !== id)
    })
    setDirty(true)
  }, [])

  const addRow = useCallback(() => {
    setDraft((rows) => {
      const label = `Status ${rows.length + 1}`
      return [...rows, createDraftLeadStatus(label, rows)]
    })
    setDirty(true)
  }, [])

  const moveRowTo = useCallback((id, toIndex) => {
    setDraft((rows) => moveStatus(rows, id, toIndex))
    setDirty(true)
  }, [])

  const moveRowBy = useCallback((id, offset) => {
    setDraft((rows) => {
      const fromIndex = rows.findIndex((row) => row.id === id)
      return moveStatus(rows, id, fromIndex + offset)
    })
    setDirty(true)
  }, [])

  const clearDrag = useCallback(() => {
    setDragId(null)
    setDragOverId(null)
  }, [])

  const handleSave = useCallback(async () => {
    const normalized = normalizeLeadStatuses(draft)
    setSaving(true)
    try {
      if (teamMembership?.teamId && teamMembership.role === 'admin') {
        await updateTeamSettings(getToken, teamMembership.teamId, { leadStatuses: normalized })
        await onTeamsChange?.()
      } else {
        onSaveUserStatuses?.(normalized)
      }
      setDraft(normalized)
      setDirty(false)
      showToast('Lead statuses saved', 'success')
    } catch (e) {
      showToast(e.message || 'Failed to save lead statuses', 'error')
    } finally {
      setSaving(false)
    }
  }, [draft, getToken, onSaveUserStatuses, onTeamsChange, teamMembership])

  const description = teamMembership
    ? (canEdit
      ? 'Team members use these statuses on all leads. You can rename labels, pick colors, reorder, and add or remove statuses; removing a status moves existing leads to New.'
      : `Statuses are set by your team admin for ${teamMembership.teamName || 'your team'}.`)
    : 'Customize labels, colors, order, and add or remove statuses for your leads.'

  return (
    <>
      <p className="text-xs opacity-50">{description}</p>

      <ul className="space-y-2">
        {draft.map((row, index) => {
          const removable = canEdit && canRemoveLeadStatus(row.id, draft)
          return (
            <li
              key={row.id}
              className={cn(
                'rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 transition-opacity',
                dragId === row.id && 'opacity-45',
                dragOverId === row.id && dragId && dragId !== row.id && 'ring-2 ring-blue-400/55 border-blue-400/40',
              )}
              onDragOver={(event) => {
                if (!canEdit || !dragId) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                if (dragOverId !== row.id) setDragOverId(row.id)
              }}
              onDrop={(event) => {
                event.preventDefault()
                const fromId = event.dataTransfer.getData('text/plain') || dragId
                if (fromId) moveRowTo(fromId, index)
                clearDrag()
              }}
            >
              <div className="flex items-center gap-2">
                {canEdit && (
                  <div className="flex items-center shrink-0 -ml-0.5">
                    <button
                      type="button"
                      draggable
                      className="p-0.5 text-white/30 hover:text-white/65 cursor-grab active:cursor-grabbing"
                      aria-label={`Drag to reorder ${row.label || 'status'}`}
                      title="Drag to reorder"
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/plain', row.id)
                        event.dataTransfer.effectAllowed = 'move'
                        setDragId(row.id)
                      }}
                      onDragEnd={clearDrag}
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                    <div className="flex flex-col">
                      <button
                        type="button"
                        className="text-white/30 hover:text-white/70 disabled:opacity-20 leading-none"
                        disabled={index === 0}
                        onClick={() => moveRowBy(row.id, -1)}
                        aria-label={`Move ${row.label || 'status'} up`}
                        title="Move up"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="text-white/30 hover:text-white/70 disabled:opacity-20 leading-none"
                        disabled={index === draft.length - 1}
                        onClick={() => moveRowBy(row.id, 1)}
                        aria-label={`Move ${row.label || 'status'} down`}
                        title="Move down"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
                <span
                  className={cn(
                    'crm-row-status-badge inline-flex shrink-0 rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wide',
                    row.color,
                  )}
                >
                  {row.label || row.id}
                </span>
                {canEdit ? (
                  <Input
                    value={row.label}
                    onChange={(e) => updateLabel(row.id, e.target.value)}
                    maxLength={40}
                    className="flex-1 min-w-0 h-8 text-sm"
                    aria-label={`Label for ${row.id} status`}
                  />
                ) : (
                  <span className="flex-1 text-sm text-white/85">{row.label}</span>
                )}
                {canEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-white/50 hover:text-red-300"
                    disabled={!removable}
                    title={
                      PROTECTED_LEAD_STATUS_IDS.has(row.id)
                        ? 'Required status'
                        : (removable ? 'Remove status' : 'Keep at least two statuses')
                    }
                    onClick={() => removeRow(row.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <StatusColorPicker
                value={row.color}
                disabled={!canEdit}
                onChange={(color) => updateColor(row.id, color)}
              />
              <StatusAutoTasksEditor
                autoTasks={row.autoTasks}
                canEdit={canEdit}
                teamMembers={teamMembers}
                onChange={(autoTasks) => updateAutoTasks(row.id, autoTasks)}
              />
            </li>
          )
        })}
      </ul>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addRow}>
            <Plus className="h-3.5 w-3.5" />
            Add status
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!dirty || saving}
            onClick={handleSave}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save statuses'}
          </Button>
        </div>
      )}
    </>
  )
}
