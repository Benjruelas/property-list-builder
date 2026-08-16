import { useState } from 'react'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { cn } from '@/lib/utils'
import { createDraftAutoTask, normalizeAutoTaskTemplates } from '@/utils/statusAutoTasks'

/**
 * Inline editor for automatic tasks attached to a single status row.
 */
export function StatusAutoTasksEditor({
  autoTasks = [],
  canEdit = false,
  teamMembers = [],
  onChange,
}) {
  const [expanded, setExpanded] = useState(() => (autoTasks?.length || 0) > 0)
  const rows = normalizeAutoTaskTemplates(autoTasks)

  const updateRows = (next) => {
    onChange?.(normalizeAutoTaskTemplates(next))
  }

  const updateRow = (id, patch) => {
    updateRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const removeRow = (id) => {
    updateRows(rows.filter((r) => r.id !== id))
  }

  const addRow = () => {
    setExpanded(true)
    updateRows([...rows, createDraftAutoTask('Follow up')])
  }

  const countLabel = rows.length === 1 ? '1 auto task' : `${rows.length} auto tasks`

  return (
    <div className="w-full border-t border-white/5 pt-2 mt-1">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 text-left text-[11px] uppercase tracking-wide text-white/45 hover:text-white/70"
        onClick={() => setExpanded((v) => !v)}
      >
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !expanded && '-rotate-90')} />
        Automatic tasks
        <span className="ml-auto font-normal normal-case tracking-normal text-white/35">{countLabel}</span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] text-white/40">
            When a record first enters this status, create these tasks. Returning later will not recreate them.
          </p>
          {rows.map((row) => (
            <div
              key={row.id}
              className="rounded-md border border-white/10 bg-black/20 px-2 py-2 space-y-1.5"
            >
              {canEdit ? (
                <>
                  <Input
                    value={row.title}
                    onChange={(e) => updateRow(row.id, { title: e.target.value })}
                    placeholder="Task title"
                    maxLength={200}
                    className="h-8 text-sm"
                    aria-label="Auto task title"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-white/55">
                      Due in
                      <Input
                        type="number"
                        min={0}
                        max={3650}
                        value={row.dueDaysOffset ?? ''}
                        onChange={(e) => {
                          const v = e.target.value
                          updateRow(row.id, {
                            dueDaysOffset: v === '' ? null : Math.max(0, Math.floor(Number(v) || 0)),
                          })
                        }}
                        placeholder="—"
                        className="h-7 w-16 text-sm"
                        aria-label="Due days offset"
                      />
                      days
                    </label>
                    {canEdit && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 ml-auto text-white/45 hover:text-red-300"
                        onClick={() => removeRow(row.id)}
                        title="Remove auto task"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  {teamMembers.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[11px] text-white/40">Assignees (optional)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {teamMembers.map((m) => {
                          const uid = m.uid
                          const selected = (row.assignedUids || []).includes(uid)
                          const label = m.email || m.displayName || uid
                          return (
                            <button
                              key={uid}
                              type="button"
                              disabled={!canEdit}
                              onClick={() => {
                                const set = new Set(row.assignedUids || [])
                                if (selected) set.delete(uid)
                                else set.add(uid)
                                updateRow(row.id, { assignedUids: [...set] })
                              }}
                              className={cn(
                                'rounded-md border px-2 py-0.5 text-[11px] transition-colors',
                                selected
                                  ? 'border-blue-400/40 bg-blue-500/20 text-blue-100'
                                  : 'border-white/10 bg-white/[0.03] text-white/55 hover:text-white/80',
                              )}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm text-white/80">
                  <p>{row.title}</p>
                  <p className="text-xs text-white/45 mt-0.5">
                    {row.dueDaysOffset != null ? `Due in ${row.dueDaysOffset} day(s)` : 'No due date'}
                    {(row.assignedUids || []).length > 0
                      ? ` · ${row.assignedUids.length} assignee(s)`
                      : ''}
                  </p>
                </div>
              )}
            </div>
          ))}
          {canEdit && (
            <Button type="button" variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={addRow}>
              <Plus className="h-3 w-3" />
              Add auto task
            </Button>
          )}
          {!canEdit && rows.length === 0 && (
            <p className="text-xs text-white/35">No automatic tasks for this status.</p>
          )}
        </div>
      )}
    </div>
  )
}
