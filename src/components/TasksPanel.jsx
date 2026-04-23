import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Plus, X, Square, CheckSquare, ChevronDown, ChevronRight, Eye, EyeOff, Check, MoreVertical, Pencil, Trash2, Calendar, User } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Input } from './ui/input'
import { loadLeads, getStreetAddress, getFullAddress } from '@/utils/dealPipeline'
import {
  getAllTasks,
  getPersonalTasks,
  toggleLeadTask,
  deleteLeadTask,
  removeLocalTaskById,
  formatTaskScheduledDate,
  formatTaskCompletedDate,
  groupOpenTasksByPipeline,
  groupCompletedTasksByPipeline,
  addTask,
  getPipelineForTask,
  updateTaskById
} from '@/utils/leadTasks'
import {
  addPipelineTask,
  updatePipelineTask,
  togglePipelineTask,
  removePipelineTask,
  flattenPipelineTasks,
  pipelinesContainingParcel
} from '@/utils/pipelineTasks'
import { ConvertToLeadPipelineDialog } from './ConvertToLeadPipelineDialog'
import { useUserDataSync } from '@/contexts/UserDataSyncContext'
import { showToast } from './ui/toast'

import { SchedulePicker } from './SchedulePicker'
import { cn } from '@/lib/utils'

function getLeadLabel(lead, parcelId) {
  if (!parcelId) return 'Standalone'
  return getStreetAddress(lead) || lead?.address || lead?.owner || parcelId
}

function PipelineDropdown({ value, onChange, pipelines }) {
  const [open, setOpen] = useState(false)
  const selected = pipelines.find((p) => p.id === value)
  const label = selected ? (selected.title || 'Pipeline') : 'None (unassigned)'

  const options = [{ id: '', title: 'None (unassigned)' }, ...pipelines]

  return (
    <div>
      <label className="text-xs font-medium block mb-1 opacity-90">Pipeline</label>
      <div
        role="listbox"
        tabIndex={0}
        onClick={() => setOpen((p) => !p)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((p) => !p) } }}
        className="w-full h-10 rounded-md px-3 py-2 text-sm text-left flex items-center justify-between gap-2 cursor-pointer"
        style={{
          border: '1px solid rgba(255,255,255,0.2)',
          background: 'rgba(255,255,255,0.06)',
          color: 'rgba(255,255,255,0.95)',
          borderRadius: open ? '0.375rem 0.375rem 0 0' : undefined,
        }}
      >
        <span className="truncate" style={{ color: value ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)' }}>
          {label}
        </span>
        <ChevronDown
          className="h-3.5 w-3.5 shrink-0 opacity-60 transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
        />
      </div>
      {open && (
        <div
          className="rounded-b-md overflow-hidden"
          style={{ border: '1px solid rgba(255,255,255,0.25)', borderTop: 'none' }}
        >
          {options.map((p) => {
            const optId = p.id || ''
            const isSelected = value === optId
            return (
              <button
                key={optId}
                type="button"
                onClick={() => { onChange(optId); setOpen(false) }}
                className="w-full px-3 py-2 text-sm text-left flex items-center justify-between gap-2 transition-colors pipeline-dropdown-item"
                style={{
                  color: isSelected ? '#fff' : 'rgba(255,255,255,0.7)',
                  background: isSelected ? 'rgba(255,255,255,0.1)' : 'transparent',
                }}
              >
                <span className="truncate">{p.title || 'Pipeline'}</span>
                {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function TasksPanel({
  isOpen,
  onClose,
  onOpenParcelDetails,
  pipelines = [],
  leads = [],
  onLeadsChange,
  activePipelineId = null,
  onOpenTaskInDealPipeline,
  onOpenScheduleAtDate,
  getToken = null,
  currentUser = null,
  onPipelinesChange
}) {
  const { scheduleSync } = useUserDataSync()
  const [allTasks, setAllTasks] = useState([])
  const [showAddTask, setShowAddTask] = useState(false)
  const [addTaskLeadId, setAddTaskLeadId] = useState('')
  const [addTaskLeadSearch, setAddTaskLeadSearch] = useState('')
  const [addTaskSuggestionsOpen, setAddTaskSuggestionsOpen] = useState(false)
  const [addTaskHighlightIndex, setAddTaskHighlightIndex] = useState(-1)
  const [addTaskTitle, setAddTaskTitle] = useState('')
  const [addTaskScheduledAt, setAddTaskScheduledAt] = useState(null)
  const [addTaskScheduledEndAt, setAddTaskScheduledEndAt] = useState(null)
  const [addTaskDateTimeExpanded, setAddTaskDateTimeExpanded] = useState(false)

  const [collapsedSections, setCollapsedSections] = useState({})
  const [showClosedTasks, setShowClosedTasks] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editScheduledAt, setEditScheduledAt] = useState(null)
  const [editScheduledEndAt, setEditScheduledEndAt] = useState(null)
  const [assignPipelineId, setAssignPipelineId] = useState('')
  const [assignParcelId, setAssignParcelId] = useState('')
  const [assignLeadSearch, setAssignLeadSearch] = useState('')
  const [assignSuggestionsOpen, setAssignSuggestionsOpen] = useState(false)
  const [assignHighlightIndex, setAssignHighlightIndex] = useState(-1)

  const apiMode = pipelines.length > 0

  const displayLeads = useMemo(() => {
    if (pipelines.length > 0) {
      return pipelines.flatMap((p) => (p.leads || []).map((l) => ({ ...l, __pipelineId: p.id, __pipelineTitle: p.title })))
    }
    return onLeadsChange ? leads : loadLeads()
  }, [pipelines, leads, onLeadsChange])

  const assignLeadsPool = useMemo(() => {
    if (!apiMode) return displayLeads
    if (!assignPipelineId) return []
    const pipe = pipelines.find((p) => p.id === assignPipelineId)
    return (pipe?.leads || []).map((l) => ({ ...l, __pipelineId: pipe.id, __pipelineTitle: pipe.title }))
  }, [apiMode, assignPipelineId, pipelines, displayLeads])

  const assignLeadSuggestions = useMemo(() => {
    const q = (assignLeadSearch || '').trim().toLowerCase()
    if (!q) return []
    const tokens = q.split(/\s+/).filter(Boolean)
    const pool = apiMode ? assignLeadsPool : displayLeads
    const results = []
    for (const lead of pool) {
      const label = (getLeadLabel(lead, lead.parcelId) || '').toLowerCase()
      const fullAddr = (getFullAddress(lead) || '').toLowerCase()
      const owner = (lead.owner || '').toLowerCase()
      const address = (lead.address || '').toLowerCase()
      const searchable = [label, fullAddr, owner, address].filter(Boolean).join(' ')
      if (!tokens.every((tok) => searchable.includes(tok))) continue
      results.push({ lead, displayValue: getLeadLabel(lead, lead.parcelId) || lead.address || lead.parcelId })
    }
    return results
  }, [assignLeadSearch, assignLeadsPool, displayLeads, apiMode])

  const [pipePickerState, setPipePickerState] = useState(null)

  const refreshTasks = useCallback(() => {
    if (apiMode) {
      setAllTasks([...getPersonalTasks(), ...flattenPipelineTasks(pipelines)])
    } else {
      setAllTasks(getAllTasks())
    }
  }, [apiMode, pipelines])

  useEffect(() => {
    if (isOpen) refreshTasks()
    else {
      setShowAddTask(false)
      setEditingTask(null)
      setShowClosedTasks(false)
    }
  }, [isOpen, refreshTasks])

  useEffect(() => {
    if (!editingTask) return
    setEditTitle(editingTask.title || '')
    setEditScheduledAt(editingTask.scheduledAt ?? null)
    setEditScheduledEndAt(editingTask.scheduledEndAt ?? null)
    setAssignPipelineId(editingTask.pipelineId || '')
    setAssignParcelId(editingTask.parcelId ? String(editingTask.parcelId) : '')
    const lead = editingTask.parcelId ? displayLeads.find((l) => l.parcelId === editingTask.parcelId) : null
    setAssignLeadSearch(
      lead ? getLeadLabel(lead, lead.parcelId) || lead.address || lead.parcelId : ''
    )
    setAssignSuggestionsOpen(false)
    setAssignHighlightIndex(-1)
  }, [editingTask, displayLeads])

  const addTaskLeadSuggestions = useMemo(() => {
    const q = (addTaskLeadSearch || '').trim().toLowerCase()
    const tokens = q ? q.split(/\s+/).filter(Boolean) : []
    const results = []
    for (const lead of displayLeads) {
      const displayValue = getLeadLabel(lead, lead.parcelId) || lead.address || lead.parcelId
      if (tokens.length) {
        const label = (getLeadLabel(lead, lead.parcelId) || '').toLowerCase()
        const fullAddr = (getFullAddress(lead) || '').toLowerCase()
        const owner = (lead.owner || '').toLowerCase()
        const address = (lead.address || '').toLowerCase()
        const searchable = [label, fullAddr, owner, address].filter(Boolean).join(' ')
        if (!tokens.every((tok) => searchable.includes(tok))) continue
      }
      results.push({ lead, displayValue })
    }
    results.sort((a, b) => (a.displayValue || '').localeCompare(b.displayValue || '', undefined, { sensitivity: 'base' }))
    return results
  }, [addTaskLeadSearch, displayLeads])

  const openAddTask = () => {
    setAddTaskLeadId('')
    setAddTaskLeadSearch('')
    setAddTaskSuggestionsOpen(false)
    setAddTaskHighlightIndex(-1)
    setAddTaskTitle('')
    setAddTaskScheduledAt(null)
    setAddTaskScheduledEndAt(null)
    setAddTaskDateTimeExpanded(false)
    setShowAddTask(true)
  }

  const finalizeTaskCreate = useCallback(async ({ pipelineId, parcelId, title, scheduledAt, scheduledEndAt }) => {
    if (pipelineId) {
      try {
        await addPipelineTask(getToken, pipelineId, {
          title,
          parcelId: parcelId || null,
          scheduledAt,
          scheduledEndAt
        })
        await onPipelinesChange?.()
        showToast('Task added', 'success')
      } catch (err) {
        showToast(err.message || 'Could not add task', 'error')
        return
      }
    } else {
      addTask({ pipelineId: null, parcelId: parcelId || null, title, scheduledAt, scheduledEndAt })
      refreshTasks()
      scheduleSync()
      showToast('Task added', 'success')
    }
    setShowAddTask(false)
  }, [getToken, onPipelinesChange, refreshTasks, scheduleSync])

  const handleCreateTask = () => {
    const trimmed = addTaskTitle.trim()
    if (!trimmed) {
      showToast('Enter a task title', 'error')
      return
    }
    const endAt = addTaskScheduledEndAt && addTaskScheduledEndAt > (addTaskScheduledAt || 0) ? addTaskScheduledEndAt : null
    if (endAt && addTaskScheduledAt && endAt <= addTaskScheduledAt) {
      showToast('End time must be after start time', 'error')
      return
    }
    const parcelId = addTaskLeadId ? String(addTaskLeadId) : null
    const payload = { title: trimmed, scheduledAt: addTaskScheduledAt, scheduledEndAt: endAt, parcelId }

    if (parcelId) {
      const lead = displayLeads.find((l) => l.parcelId === parcelId)
      if (lead?.__pipelineId) {
        finalizeTaskCreate({ ...payload, pipelineId: lead.__pipelineId })
        return
      }
      if (apiMode) {
        const owning = pipelinesContainingParcel(pipelines, parcelId)
        if (owning.length === 1) {
          finalizeTaskCreate({ ...payload, pipelineId: owning[0].id })
          return
        }
        if (owning.length > 1) {
          setPipePickerState({ open: true, eligiblePipelines: owning, allowNoPipe: false, payload })
          return
        }
      }
      finalizeTaskCreate({ ...payload, pipelineId: null })
      return
    }

    if (apiMode && pipelines.length > 0) {
      setPipePickerState({ open: true, eligiblePipelines: pipelines, allowNoPipe: true, payload })
      return
    }
    finalizeTaskCreate({ ...payload, pipelineId: null })
  }

  const { unlabeled, groups } = useMemo(
    () => groupOpenTasksByPipeline(allTasks, pipelines),
    [allTasks, pipelines]
  )

  const { unlabeled: closedUnlabeled, groups: closedGroups } = useMemo(
    () => (showClosedTasks ? groupCompletedTasksByPipeline(allTasks, pipelines) : { unlabeled: [], groups: [] }),
    [allTasks, pipelines, showClosedTasks]
  )

  const completedCount = useMemo(
    () => allTasks.filter((t) => t.completed && (t.title ?? '').toString().trim()).length,
    [allTasks]
  )

  const handleToggle = async (e, task) => {
    e.stopPropagation()
    if (task.__source === 'pipeline' && task.pipelineId) {
      try {
        await togglePipelineTask(getToken, task.pipelineId, task.id)
        await onPipelinesChange?.()
      } catch (err) {
        showToast(err.message || 'Could not update task', 'error')
      }
      return
    }
    toggleLeadTask(task.parcelId, task.id)
    refreshTasks()
    scheduleSync()
  }

  const handleDeleteTask = async (task) => {
    if (task.__source === 'pipeline' && task.pipelineId) {
      try {
        await removePipelineTask(getToken, task.pipelineId, task.id)
        await onPipelinesChange?.()
        showToast('Task deleted', 'success')
      } catch (err) {
        showToast(err.message || 'Could not delete task', 'error')
      }
      return
    }
    deleteLeadTask(task.parcelId, task.id)
    refreshTasks()
    scheduleSync()
    showToast('Task deleted', 'success')
  }

  const handleViewOnSchedule = (task) => {
    if (!task.scheduledAt || !onOpenScheduleAtDate) return
    onClose?.()
    onOpenScheduleAtDate(task.scheduledAt)
  }

  const toggleSection = (sectionId) => {
    setCollapsedSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }))
  }

  const handleRowActivate = (task, sectionKey) => {
    if (sectionKey === 'unlabeled') {
      setEditingTask(task)
      return
    }
    if (sectionKey === '__local__') {
      onOpenTaskInDealPipeline?.({
        pipelineId: null,
        parcelId: task.parcelId ?? null,
        mode: 'local'
      })
      return
    }
    const pipelineId = sectionKey
    onOpenTaskInDealPipeline?.({
      pipelineId,
      parcelId: task.parcelId ?? null,
      mode: 'api'
    })
  }

  const handleSaveEdit = async () => {
    if (!editingTask) return
    const t = editTitle.trim() || 'Task'
    const endAt = editScheduledEndAt && editScheduledEndAt > (editScheduledAt || 0) ? editScheduledEndAt : null
    if (endAt && editScheduledAt && endAt <= editScheduledAt) {
      showToast('End time must be after start time', 'error')
      return
    }
    let pipelineId = null
    let parcelId = (assignParcelId || '').trim() || null
    if (apiMode) {
      if (parcelId) {
        const lead = displayLeads.find((l) => String(l.parcelId) === String(parcelId))
        pipelineId = lead?.__pipelineId ?? (assignPipelineId || null)
      } else {
        pipelineId = assignPipelineId || null
      }
    } else {
      pipelineId = null
      if (parcelId) {
        const lead = displayLeads.find((l) => String(l.parcelId) === String(parcelId))
        if (!lead) parcelId = null
      }
    }

    const wasPipeline = editingTask.__source === 'pipeline' && editingTask.pipelineId
    const goingToPipe = !!pipelineId
    const sameTargetPipe = wasPipeline && goingToPipe && editingTask.pipelineId === pipelineId

    try {
      if (sameTargetPipe) {
        // Stay within the same pipeline — just update in place.
        await updatePipelineTask(getToken, pipelineId, {
          id: editingTask.id,
          title: t,
          scheduledAt: editScheduledAt,
          scheduledEndAt: endAt,
          parcelId
        })
        await onPipelinesChange?.()
      } else if (wasPipeline && !goingToPipe) {
        // Moved off a pipe → becomes personal. Delete from pipe, add locally.
        await removePipelineTask(getToken, editingTask.pipelineId, editingTask.id)
        addTask({
          pipelineId: null,
          parcelId: parcelId || null,
          title: t,
          scheduledAt: editScheduledAt,
          scheduledEndAt: endAt
        })
        await onPipelinesChange?.()
        scheduleSync()
      } else if (wasPipeline && goingToPipe && !sameTargetPipe) {
        // Moved to a different pipe → delete from old + add to new.
        await removePipelineTask(getToken, editingTask.pipelineId, editingTask.id)
        await addPipelineTask(getToken, pipelineId, {
          id: editingTask.id,
          title: t,
          parcelId: parcelId || null,
          scheduledAt: editScheduledAt,
          scheduledEndAt: endAt
        })
        await onPipelinesChange?.()
      } else if (!wasPipeline && goingToPipe) {
        // Personal → pipe: remove from local store, add to pipe.
        removeLocalTaskById(editingTask.id)
        await addPipelineTask(getToken, pipelineId, {
          id: editingTask.id,
          title: t,
          parcelId: parcelId || null,
          scheduledAt: editScheduledAt,
          scheduledEndAt: endAt
        })
        await onPipelinesChange?.()
        scheduleSync()
      } else {
        // Personal → personal: unchanged path.
        updateTaskById(editingTask.id, {
          title: t,
          scheduledAt: editScheduledAt,
          scheduledEndAt: endAt,
          pipelineId: null,
          parcelId
        })
        refreshTasks()
        scheduleSync()
      }
      showToast('Task updated', 'success')
      setEditingTask(null)
    } catch (err) {
      showToast(err.message || 'Could not update task', 'error')
    }
  }

  const hasOpen = unlabeled.length > 0 || groups.length > 0
  const hasClosedContent = closedUnlabeled.length > 0 || closedGroups.length > 0
  const showEmptyOpen = !hasOpen && !(showClosedTasks && hasClosedContent)

  return (
    <>
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose?.() }}>
      <DialogContent
        className="map-panel list-panel fullscreen-panel flex flex-col min-h-0"
        showCloseButton={false}
        hideOverlay
      >
        <DialogHeader
          className="px-6 pt-6 pb-4 border-b border-white/20 flex-shrink-0 text-left"
          style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }}
        >
          <DialogDescription className="sr-only">Tasks grouped by pipe</DialogDescription>
          <div className="map-panel-header-toolbar gap-2">
            <DialogTitle className="map-panel-header-title-wrap text-xl font-semibold truncate">Tasks</DialogTitle>
            <div className="map-panel-header-actions gap-1">
              {completedCount > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowClosedTasks((s) => !s)}
                  title={showClosedTasks ? 'Hide closed tasks' : 'View closed tasks'}
                  aria-pressed={showClosedTasks}
                >
                  {showClosedTasks ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={openAddTask} title="New task">
                <Plus className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose} title="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>
        <div
          className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-6 py-4"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {showEmptyOpen && (
            <p className="text-sm text-white/60 py-8 text-center">No open tasks</p>
          )}
          {unlabeled.length > 0 && (
            <section className="mb-4" aria-label="Tasks not in a pipe">
              <ul className="space-y-2">
                {unlabeled.map((task) => (
                  <li key={task.id}>
                    <TaskRow
                      task={task}
                      displayLeads={displayLeads}
                      onToggle={handleToggle}
                      onActivate={task.parcelId && task.scheduledAt ? null : () => handleRowActivate(task, 'unlabeled')}
                      onEdit={() => setEditingTask(task)}
                      onDelete={() => handleDeleteTask(task)}
                      onViewOnSchedule={task.scheduledAt && onOpenScheduleAtDate ? () => handleViewOnSchedule(task) : null}
                      onOpenLead={task.parcelId ? () => handleRowActivate(task, task.pipelineId || 'unlabeled') : null}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {groups.map(({ pipeline, tasks }) => {
            const sid = pipeline.id
            const collapsed = !!collapsedSections[sid]
            return (
              <section key={sid} className="mb-4 last:mb-0">
                <button
                  type="button"
                  onClick={() => toggleSection(sid)}
                  className="flex items-center gap-2 w-full text-left mb-2 py-1 rounded-md hover:bg-white/5 -ml-1 pl-1 pr-2"
                >
                  {collapsed ? (
                    <ChevronRight className="h-4 w-4 text-white/70 shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-white/70 shrink-0" />
                  )}
                  <span className="text-xs font-semibold text-white/80 uppercase tracking-wide truncate">
                    {pipeline.title}
                  </span>
                  <span className="text-[10px] text-white/45 ml-auto shrink-0">{tasks.length}</span>
                </button>
                {!collapsed && (
                  <ul className="space-y-2">
                    {tasks.map((task) => (
                      <li key={task.id}>
                        <TaskRow
                          task={task}
                          displayLeads={displayLeads}
                          onToggle={handleToggle}
                          onActivate={task.parcelId && task.scheduledAt ? null : () => handleRowActivate(task, sid)}
                          onEdit={() => setEditingTask(task)}
                          onDelete={() => handleDeleteTask(task)}
                          onViewOnSchedule={task.scheduledAt && onOpenScheduleAtDate ? () => handleViewOnSchedule(task) : null}
                          onOpenLead={task.parcelId ? () => handleRowActivate(task, sid) : null}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
          {showClosedTasks && hasClosedContent && (
            <div className="mt-1.5 pt-0">
              <h2 className="text-xs font-semibold text-white/55 uppercase tracking-wide mb-1.5">Closed tasks</h2>
              {closedUnlabeled.length > 0 && (
                <section className="mb-4" aria-label="Closed tasks not in a pipe">
                  <ul className="space-y-2">
                    {closedUnlabeled.map((task) => (
                      <li key={task.id}>
                        <TaskRow
                          task={task}
                          displayLeads={displayLeads}
                          onToggle={handleToggle}
                          onActivate={() => handleRowActivate(task, 'unlabeled')}
                          onEdit={() => setEditingTask(task)}
                          onDelete={() => handleDeleteTask(task)}
                          onViewOnSchedule={null}
                          onOpenLead={task.parcelId ? () => handleRowActivate(task, task.pipelineId || 'unlabeled') : null}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {closedGroups.map(({ pipeline, tasks }) => {
                const sid = `closed-${pipeline.id}`
                const collapsed = !!collapsedSections[sid]
                return (
                  <section key={sid} className="mb-4 last:mb-0">
                    <button
                      type="button"
                      onClick={() => toggleSection(sid)}
                      className="flex items-center gap-2 w-full text-left mb-2 py-1 rounded-md hover:bg-white/5 -ml-1 pl-1 pr-2"
                    >
                      {collapsed ? (
                        <ChevronRight className="h-4 w-4 text-white/70 shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-white/70 shrink-0" />
                      )}
                      <span className="text-xs font-semibold text-white/80 uppercase tracking-wide truncate">
                        {pipeline.title}
                      </span>
                      <span className="text-[10px] text-white/45 ml-auto shrink-0">{tasks.length}</span>
                    </button>
                    {!collapsed && (
                      <ul className="space-y-2">
                        {tasks.map((task) => (
                          <li key={task.id}>
                            <TaskRow
                              task={task}
                              displayLeads={displayLeads}
                              onToggle={handleToggle}
                              onActivate={() => handleRowActivate(task, pipeline.id === '__local__' ? '__local__' : pipeline.id)}
                              onEdit={() => setEditingTask(task)}
                              onDelete={() => handleDeleteTask(task)}
                              onViewOnSchedule={null}
                              onOpenLead={task.parcelId ? () => handleRowActivate(task, pipeline.id === '__local__' ? '__local__' : pipeline.id) : null}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

      <Dialog open={showAddTask} onOpenChange={setShowAddTask}>
        <DialogContent className="map-panel list-panel new-task-panel fullscreen-panel flex flex-col min-h-0 p-0" showCloseButton={false} nestedOverlay>
          <DialogHeader
            className="px-6 pt-6 pb-2 border-b border-white/20 flex-shrink-0 text-left"
            style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }}
          >
            <DialogTitle className="text-xl font-semibold">New task</DialogTitle>
            <DialogDescription className="sr-only">
              Create a task. Title is required. Date, time, and lead assignment are optional.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 py-4 flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-3 create-list-form" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
            <div>
              <label className="text-xs font-medium block mb-1 opacity-90">
                Task title{' '}
                <span className="text-red-400" aria-label="required">
                  *
                </span>
              </label>
              <Input
                value={addTaskTitle}
                onChange={(e) => setAddTaskTitle(e.target.value)}
                placeholder="e.g. Call back, Roof inspection"
                className="text-sm"
                autoFocus
                aria-required="true"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateTask()}
              />
            </div>
            <div className="relative">
              <label className="text-xs font-medium block mb-1 opacity-90">Assign to lead</label>
              <Input
                value={addTaskLeadSearch}
                onChange={(e) => {
                  setAddTaskLeadSearch(e.target.value)
                  setAddTaskLeadId('')
                  setAddTaskSuggestionsOpen(true)
                  setAddTaskHighlightIndex(-1)
                }}
                onFocus={() => setAddTaskSuggestionsOpen(true)}
                onBlur={() => setTimeout(() => setAddTaskSuggestionsOpen(false), 150)}
                placeholder="Type address or name..."
                className="text-sm"
                onKeyDown={(e) => {
                  if (!addTaskSuggestionsOpen || addTaskLeadSuggestions.length === 0) return
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setAddTaskHighlightIndex((i) => Math.min(i + 1, addTaskLeadSuggestions.length - 1))
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setAddTaskHighlightIndex((i) => Math.max(i - 1, -1))
                  } else if (e.key === 'Enter' && addTaskHighlightIndex >= 0 && addTaskLeadSuggestions[addTaskHighlightIndex]) {
                    e.preventDefault()
                    const item = addTaskLeadSuggestions[addTaskHighlightIndex]
                    setAddTaskLeadId(item.lead.parcelId)
                    setAddTaskLeadSearch(item.displayValue)
                    setAddTaskSuggestionsOpen(false)
                    setAddTaskHighlightIndex(-1)
                  } else if (e.key === 'Escape') {
                    setAddTaskSuggestionsOpen(false)
                    setAddTaskHighlightIndex(-1)
                  }
                }}
              />
              {addTaskSuggestionsOpen && addTaskLeadSuggestions.length > 0 && (
                <ul className="add-task-lead-dropdown absolute z-50 left-0 right-0 mt-0.5 max-h-40 overflow-y-auto rounded-lg border py-1 text-sm" role="listbox">
                  {addTaskLeadSuggestions.map((item, idx) => (
                    <li
                      key={item.lead.parcelId ?? item.lead.id}
                      role="option"
                      aria-selected={addTaskHighlightIndex === idx}
                      className={`px-3 py-2 cursor-pointer ${addTaskHighlightIndex === idx ? 'bg-white/10' : 'hover:bg-white/10'}`}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        setAddTaskLeadId(item.lead.parcelId)
                        setAddTaskLeadSearch(item.displayValue)
                        setAddTaskSuggestionsOpen(false)
                        setAddTaskHighlightIndex(-1)
                      }}
                    >
                      <span className="truncate font-medium block">{item.displayValue}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-lg border border-white/15 bg-white/[0.03] overflow-hidden">
              <button
                type="button"
                onClick={() => setAddTaskDateTimeExpanded((open) => !open)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-white/90 hover:bg-white/5 transition-colors"
                aria-expanded={addTaskDateTimeExpanded}
              >
                {addTaskDateTimeExpanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-white/60" aria-hidden />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-white/60" aria-hidden />
                )}
                <span>Date &amp; time</span>
              </button>
              {addTaskDateTimeExpanded && (
                <div className="border-t border-white/15 px-3 pb-3 pt-2 space-y-1">
                  <SchedulePicker
                    inline
                    hideLabel
                    value={addTaskScheduledAt}
                    onChange={setAddTaskScheduledAt}
                    endValue={addTaskScheduledEndAt}
                    onEndChange={setAddTaskScheduledEndAt}
                    minDate={Date.now()}
                  />
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" className="create-list-btn flex-1" onClick={handleCreateTask}>
                Create
              </Button>
              <Button size="sm" variant="outline" className="create-list-btn flex-1" onClick={() => setShowAddTask(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingTask} onOpenChange={(o) => { if (!o) setEditingTask(null) }}>
        <DialogContent className="map-panel list-panel new-task-panel fullscreen-panel flex flex-col min-h-0 p-0" showCloseButton={false} nestedOverlay>
          <DialogHeader
            className="px-6 pt-6 pb-2 border-b border-white/20 flex-shrink-0 text-left"
            style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }}
          >
            <DialogTitle className="text-xl font-semibold">Edit task</DialogTitle>
            <DialogDescription className="sr-only">Edit title, schedule, or assign to a pipeline and lead</DialogDescription>
          </DialogHeader>
          <div className="px-6 py-4 flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-3 create-list-form" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
            <div>
              <label className="text-xs font-medium block mb-1 opacity-90">Title</label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Task title"
                className="text-sm"
              />
            </div>
            <SchedulePicker
              inline
              value={editScheduledAt}
              onChange={setEditScheduledAt}
              endValue={editScheduledEndAt}
              onEndChange={setEditScheduledEndAt}
              minDate={Date.now()}
            />
            {apiMode && (
              <PipelineDropdown
                value={assignPipelineId}
                onChange={(val) => {
                  setAssignPipelineId(val)
                  setAssignParcelId('')
                  setAssignLeadSearch('')
                }}
                pipelines={pipelines}
              />
            )}
            <div className="relative">
              <label className="text-xs font-medium block mb-1 opacity-90">Assign to lead (optional)</label>
              <Input
                value={assignLeadSearch}
                onChange={(e) => {
                  setAssignLeadSearch(e.target.value)
                  setAssignParcelId('')
                  setAssignSuggestionsOpen(e.target.value.trim().length > 0)
                  setAssignHighlightIndex(-1)
                }}
                onBlur={() => setTimeout(() => setAssignSuggestionsOpen(false), 150)}
                placeholder={apiMode && !assignPipelineId ? 'Choose a pipeline first…' : 'Type address or name…'}
                disabled={apiMode && !assignPipelineId}
                className="text-sm"
                onKeyDown={(e) => {
                  if (!assignSuggestionsOpen || assignLeadSuggestions.length === 0) return
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setAssignHighlightIndex((i) => Math.min(i + 1, assignLeadSuggestions.length - 1))
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setAssignHighlightIndex((i) => Math.max(i - 1, -1))
                  } else if (e.key === 'Enter' && assignHighlightIndex >= 0 && assignLeadSuggestions[assignHighlightIndex]) {
                    e.preventDefault()
                    const item = assignLeadSuggestions[assignHighlightIndex]
                    setAssignParcelId(String(item.lead.parcelId))
                    setAssignLeadSearch(item.displayValue)
                    setAssignSuggestionsOpen(false)
                    setAssignHighlightIndex(-1)
                  }
                }}
              />
              {assignSuggestionsOpen && assignLeadSearch.trim() && assignLeadSuggestions.length > 0 && (
                <ul className="add-task-lead-dropdown absolute z-50 left-0 right-0 mt-0.5 max-h-40 overflow-y-auto rounded-lg border py-1 text-sm" role="listbox">
                  {assignLeadSuggestions.map((item, idx) => (
                    <li
                      key={item.lead.parcelId ?? item.lead.id}
                      role="option"
                      aria-selected={assignHighlightIndex === idx}
                      className={`px-3 py-2 cursor-pointer ${assignHighlightIndex === idx ? 'bg-white/10' : 'hover:bg-white/10'}`}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        setAssignParcelId(String(item.lead.parcelId))
                        setAssignLeadSearch(item.displayValue)
                        setAssignSuggestionsOpen(false)
                        setAssignHighlightIndex(-1)
                      }}
                    >
                      <span className="truncate font-medium block">{item.displayValue}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" className="create-list-btn flex-1" onClick={handleSaveEdit}>
                Save
              </Button>
              <Button size="sm" variant="outline" className="create-list-btn flex-1" onClick={() => setEditingTask(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConvertToLeadPipelineDialog
        open={!!pipePickerState?.open}
        onOpenChange={(o) => { if (!o) setPipePickerState(null) }}
        pipelines={pipePickerState?.eligiblePipelines ?? []}
        currentUser={currentUser}
        title="Pick a pipe for this task"
        description="Everyone the pipe is shared with will see this task."
        allowNoPipe={!!pipePickerState?.allowNoPipe}
        noPipeLabel="No pipe"
        noPipeDescription="Only you will see this task."
        onSelect={(pipelineId) => {
          const payload = pipePickerState?.payload
          setPipePickerState(null)
          if (payload) finalizeTaskCreate({ ...payload, pipelineId })
        }}
        onSelectNoPipe={() => {
          const payload = pipePickerState?.payload
          setPipePickerState(null)
          if (payload) finalizeTaskCreate({ ...payload, pipelineId: null })
        }}
      />
    </>
  )
}

function TaskRow({ task, displayLeads, onToggle, onActivate, onEdit, onDelete, onViewOnSchedule, onOpenLead }) {
  const lead = task.parcelId ? displayLeads.find((l) => l.parcelId === task.parcelId) : null
  const leadLine = task.parcelId
    ? `Lead: ${getLeadLabel(lead, task.parcelId)}`
    : null
  const isDone = task.completed
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    const handleOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', handleOutside)
    return () => document.removeEventListener('pointerdown', handleOutside)
  }, [menuOpen])

  return (
    <div
      className={cn(
        'text-sm rounded-lg p-3 border transition-colors',
        onActivate ? 'cursor-pointer' : '',
        isDone
          ? 'opacity-80 border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'
          : 'border-white/15 bg-white/[0.06] hover:bg-white/10'
      )}
      onClick={onActivate ? () => onActivate() : undefined}
      role={onActivate ? 'button' : undefined}
      tabIndex={onActivate ? 0 : undefined}
      onKeyDown={onActivate ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onActivate()
        }
      } : undefined}
    >
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          onClick={(e) => onToggle(e, task)}
          className={cn(
            'flex-shrink-0 mt-0.5',
            isDone ? 'text-green-600 hover:text-green-500' : 'text-white/70 hover:text-white'
          )}
          title={isDone ? 'Mark incomplete' : 'Mark done'}
        >
          {isDone ? (
            <CheckSquare className="h-[18px] w-[18px] text-green-600 fill-green-600" />
          ) : (
            <Square className="h-[18px] w-[18px]" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className={cn('font-medium text-white/95', isDone && 'line-through text-white/55')}>
            {task.title || '(untitled)'}
          </div>
          {leadLine && (
            <div className="text-xs text-white/55 mt-0.5 truncate" title={leadLine}>
              {leadLine}
            </div>
          )}
          {isDone && task.completedAt != null && (
            <div className="text-xs text-white/50 mt-0.5 truncate">
              Completed {formatTaskCompletedDate(task.completedAt)}
            </div>
          )}
          {!isDone && task.scheduledAt && (
            <div className={cn('text-xs mt-0.5 truncate', task.scheduledAt < Date.now() ? 'text-red-400' : 'text-white/55')}>
              {formatTaskScheduledDate(task.scheduledAt)}
            </div>
          )}
        </div>
        <div ref={menuRef} className="relative flex-shrink-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMenuOpen((p) => !p) }}
            className="p-1.5 -m-1 rounded-md text-white/50 hover:text-white/80 hover:bg-white/10 transition-colors"
            title="Options"
          >
            <MoreVertical className="h-[18px] w-[18px]" />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-1 z-[100] rounded-xl py-1 overflow-hidden shadow-xl border border-white/20 min-w-[160px]"
              style={{ background: 'rgba(30, 30, 30, 0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
            >
              {onOpenLead && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onOpenLead() }}
                  className="w-full px-3 py-2.5 text-left text-sm text-white/90 flex items-center gap-2.5 hover:bg-white/10 transition-colors"
                >
                  <User className="h-4 w-4" /> Lead
                </button>
              )}
              {onViewOnSchedule && !isDone && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onViewOnSchedule() }}
                  className="w-full px-3 py-2.5 text-left text-sm text-white/90 flex items-center gap-2.5 hover:bg-white/10 transition-colors"
                >
                  <Calendar className="h-4 w-4" /> View
                </button>
              )}
              {onEdit && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit() }}
                  className="w-full px-3 py-2.5 text-left text-sm text-white/90 flex items-center gap-2.5 hover:bg-white/10 transition-colors"
                >
                  <Pencil className="h-4 w-4" /> Edit
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete() }}
                  className="w-full px-3 py-2.5 text-left text-sm text-red-400 flex items-center gap-2.5 hover:bg-white/10 transition-colors"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
