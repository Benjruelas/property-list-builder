import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, Loader2 } from 'lucide-react'
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

  useEffect(() => {
    if (!isOpen) {
      setDirty(false)
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
      ? 'Team members use these statuses on all leads. Renaming updates labels everywhere; removing a status moves existing leads to New.'
      : `Statuses are set by your team admin for ${teamMembership.teamName || 'your team'}.`)
    : 'Customize labels and add or remove statuses for your leads.'

  return (
    <>
      <p className="text-xs opacity-50">{description}</p>

      <ul className="space-y-2">
        {draft.map((row) => {
          const removable = canEdit && canRemoveLeadStatus(row.id, draft)
          return (
            <li
              key={row.id}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5"
            >
              <div className="flex items-center gap-2">
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
