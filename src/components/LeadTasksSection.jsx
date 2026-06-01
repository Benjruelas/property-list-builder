import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, ChevronDown, ChevronRight } from 'lucide-react'
import { PanelHeader } from './ui/panel-header'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Input } from './ui/input'
import { displayLeadName, formatLeadAddress } from '@/utils/leads'
import {
  getAllTasks,
  getPersonalTasks,
  toggleLeadTask,
  deleteLeadTask,
  addTask,
  leadTaskKey,
  updateLeadTaskTitle,
  updateLeadTaskSchedule,
} from '@/utils/leadTasks'
import {
  addPipelineTask,
  togglePipelineTask,
  removePipelineTask,
  updatePipelineTask,
  pipelinesContainingParcel,
} from '@/utils/pipelineTasks'
import { addTeamTask, removeTeamTask, toggleTeamTask, updateTeamTask } from '@/utils/teamTasks'
import { getMembersForTeamSharedPipeline } from '@/utils/teamTaskUtils'
import { collectTasksForLead, groupLeadTasksByDeal } from '@/utils/dealTaskMatching'
import { TeamMemberAssignSection } from './TeamMemberAssignSection'
import { ConvertToLeadPipelineDialog } from './ConvertToLeadPipelineDialog'
import { TaskRow } from './TasksPanel'
import { SchedulePicker } from './SchedulePicker'
import { useUserDataSync } from '@/contexts/UserDataSyncContext'
import { showToast } from './ui/toast'

const taskGetters = { getPersonalTasks, getAllTasks }

function renderTaskRow(task, {
  displayLeads,
  teams,
  handleToggle,
  openEditTask,
  handleDeleteTask,
  onOpenScheduleAtDate,
}) {
  return (
    <TaskRow
      task={task}
      displayLeads={displayLeads}
      teams={teams}
      hideLeadLine
      onToggle={handleToggle}
      onActivate={null}
      onEdit={() => openEditTask(task)}
      onDelete={() => handleDeleteTask(task)}
      onViewOnSchedule={
        (task.scheduledAt || task.dueAt) && onOpenScheduleAtDate
          ? () => onOpenScheduleAtDate(task)
          : null
      }
      onOpenLead={null}
    />
  )
}

/**
 * Lead-scoped tasks using the same TaskRow and task dialog as Tasks / Schedule.
 */
export function LeadTasksSection({
  lead,
  leads = [],
  pipelines = [],
  teams = [],
  getToken,
  onPipelinesChange,
  onOpenScheduleAtDate,
  refreshKey = 0,
}) {
  const { scheduleSync } = useUserDataSync()
  const [tasks, setTasks] = useState([])
  const [showAddTask, setShowAddTask] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [addTaskTitle, setAddTaskTitle] = useState('')
  const [addTaskScheduledAt, setAddTaskScheduledAt] = useState(null)
  const [addTaskScheduledEndAt, setAddTaskScheduledEndAt] = useState(null)
  const [addTaskDateTimeExpanded, setAddTaskDateTimeExpanded] = useState(false)
  const [addTaskTeamAssignUids, setAddTaskTeamAssignUids] = useState([])
  const [pipePickerState, setPipePickerState] = useState(null)

  const showTaskDialog = showAddTask || !!editingTask
  const isEditMode = !!editingTask

  const apiMode = pipelines.length > 0
  const displayLeads = useMemo(() => leads, [leads])
  const parcelKey = leadTaskKey(lead)

  const refreshTasks = useCallback(() => {
    if (!lead) {
      setTasks([])
      return
    }
    setTasks(collectTasksForLead(lead, pipelines, taskGetters))
  }, [lead, pipelines])

  const taskGroups = useMemo(
    () => (lead ? groupLeadTasksByDeal(tasks, lead.id, pipelines) : { groups: [], unassigned: [] }),
    [tasks, lead, pipelines]
  )

  useEffect(() => {
    refreshTasks()
  }, [refreshTasks, refreshKey])

  useEffect(() => {
    setShowAddTask(false)
    setEditingTask(null)
    setAddTaskTitle('')
    setAddTaskScheduledAt(null)
    setAddTaskScheduledEndAt(null)
    setAddTaskDateTimeExpanded(false)
    setAddTaskTeamAssignUids([])
  }, [lead?.id])

  const resetTaskForm = () => {
    setAddTaskTitle('')
    setAddTaskScheduledAt(null)
    setAddTaskScheduledEndAt(null)
    setAddTaskDateTimeExpanded(false)
    setAddTaskTeamAssignUids([])
  }

  const closeTaskDialog = () => {
    setShowAddTask(false)
    setEditingTask(null)
    resetTaskForm()
  }

  const newTaskPipelineForAssign = useMemo(() => {
    if (!parcelKey) return null
    const owning = pipelinesContainingParcel(pipelines, parcelKey)
    if (owning.length === 1) return owning[0]
    return null
  }, [parcelKey, pipelines])

  const newTaskMemberList = useMemo(
    () => (newTaskPipelineForAssign ? getMembersForTeamSharedPipeline(newTaskPipelineForAssign, teams) : []),
    [newTaskPipelineForAssign, teams]
  )
  const newTaskIsTeamContext = !isEditMode && newTaskMemberList.length > 0

  const editTaskPipeline = useMemo(() => {
    if (!editingTask?.pipelineId) return null
    return pipelines.find((p) => p.id === editingTask.pipelineId) || null
  }, [editingTask, pipelines])

  const editTaskMemberList = useMemo(
    () => (editTaskPipeline ? getMembersForTeamSharedPipeline(editTaskPipeline, teams) : []),
    [editTaskPipeline, teams]
  )
  const editIsTeamContext = isEditMode && editingTask?.__source === 'team' && editTaskMemberList.length > 0
  const showTeamAssign = newTaskIsTeamContext || editIsTeamContext
  const teamMemberList = editIsTeamContext ? editTaskMemberList : newTaskMemberList
  const teamContextActive = editIsTeamContext || newTaskIsTeamContext

  const finalizeTaskCreate = useCallback(
    async ({ pipelineId, parcelId, title, scheduledAt, scheduledEndAt, assignedUids = [] }) => {
      if (pipelineId) {
        const pipe = pipelines.find((p) => p.id === pipelineId)
        const isTeamPipe = pipe && Array.isArray(pipe.teamShares) && pipe.teamShares.length > 0
        if (isTeamPipe && parcelId) {
          const pipeLead = (pipe?.leads || []).find((l) => String(l.parcelId) === String(parcelId))
          const teamLeadId = pipeLead?.id || lead?.id
          if (teamLeadId) {
            try {
              await addTeamTask(getToken, pipelineId, teamLeadId, {
                title,
                dueAt: scheduledAt,
                assignedUids,
              })
              await onPipelinesChange?.()
              showToast('Team task added', 'success')
            } catch (err) {
              showToast(err.message || 'Could not add team task', 'error')
              return
            }
            setShowAddTask(false)
            setAddTaskTeamAssignUids([])
            refreshTasks()
            return
          }
        }
        try {
          await addPipelineTask(getToken, pipelineId, {
            title,
            parcelId: parcelId || null,
            scheduledAt,
            scheduledEndAt,
          })
          await onPipelinesChange?.()
          showToast('Task added', 'success')
        } catch (err) {
          showToast(err.message || 'Could not add task', 'error')
          return
        }
      } else {
        addTask({ pipelineId: null, parcelId: parcelId || null, title, scheduledAt, scheduledEndAt })
        scheduleSync()
        showToast('Task added', 'success')
      }
      setShowAddTask(false)
      setAddTaskTeamAssignUids([])
      refreshTasks()
    },
    [getToken, onPipelinesChange, refreshTasks, scheduleSync, pipelines, lead?.id]
  )

  const handleCreateTask = () => {
    const trimmed = addTaskTitle.trim()
    if (!trimmed) {
      showToast('Enter a task title', 'error')
      return
    }
    if (!parcelKey) {
      showToast('Save this lead before adding tasks', 'error')
      return
    }
    const endAt = addTaskScheduledEndAt && addTaskScheduledEndAt > (addTaskScheduledAt || 0) ? addTaskScheduledEndAt : null
    if (!newTaskIsTeamContext && endAt && addTaskScheduledAt && endAt <= addTaskScheduledAt) {
      showToast('End time must be after start time', 'error')
      return
    }
    const payload = {
      title: trimmed,
      scheduledAt: addTaskScheduledAt,
      scheduledEndAt: endAt,
      parcelId: String(parcelKey),
      assignedUids: addTaskTeamAssignUids,
    }
    if (apiMode) {
      const owning = pipelinesContainingParcel(pipelines, parcelKey)
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
  }

  const handleSaveEdit = async () => {
    const trimmed = addTaskTitle.trim()
    if (!trimmed || !editingTask) return
    const endAt = addTaskScheduledEndAt && addTaskScheduledEndAt > (addTaskScheduledAt || 0) ? addTaskScheduledEndAt : null
    if (!editIsTeamContext && endAt && addTaskScheduledAt && endAt <= addTaskScheduledAt) {
      showToast('End time must be after start time', 'error')
      return
    }

    const task = editingTask
    try {
      if (task.__source === 'team' && task.pipelineId && task.leadId) {
        await updateTeamTask(getToken, task.pipelineId, task.leadId, {
          id: task.id,
          title: trimmed,
          dueAt: addTaskScheduledAt,
          assignedUids: addTaskTeamAssignUids,
        })
        await onPipelinesChange?.()
      } else if (task.__source === 'pipeline' && task.pipelineId) {
        await updatePipelineTask(getToken, task.pipelineId, {
          id: task.id,
          title: trimmed,
          scheduledAt: addTaskScheduledAt,
          scheduledEndAt: endAt,
        })
        await onPipelinesChange?.()
      } else {
        updateLeadTaskTitle(task.parcelId, task.id, trimmed)
        updateLeadTaskSchedule(task.parcelId, task.id, addTaskScheduledAt, endAt)
        scheduleSync()
      }
      showToast('Task updated', 'success')
      closeTaskDialog()
      refreshTasks()
    } catch (err) {
      showToast(err.message || 'Could not update task', 'error')
    }
  }

  const handleSaveTask = () => {
    if (isEditMode) handleSaveEdit()
    else handleCreateTask()
  }

  const handleToggle = async (e, task) => {
    e.stopPropagation()
    if (task.__source === 'team' && task.pipelineId && task.leadId) {
      try {
        await toggleTeamTask(getToken, task.pipelineId, task.leadId, task.id)
        await onPipelinesChange?.()
      } catch (err) {
        showToast(err.message || 'Could not update task', 'error')
      }
      refreshTasks()
      return
    }
    if (task.__source === 'pipeline' && task.pipelineId) {
      try {
        await togglePipelineTask(getToken, task.pipelineId, task.id)
        await onPipelinesChange?.()
      } catch (err) {
        showToast(err.message || 'Could not update task', 'error')
      }
      refreshTasks()
      return
    }
    toggleLeadTask(task.parcelId, task.id)
    scheduleSync()
    refreshTasks()
  }

  const handleDeleteTask = async (task) => {
    if (task.__source === 'team' && task.pipelineId && task.leadId) {
      try {
        await removeTeamTask(getToken, task.pipelineId, task.leadId, task.id)
        await onPipelinesChange?.()
        showToast('Task deleted', 'success')
      } catch (err) {
        showToast(err.message || 'Could not delete task', 'error')
      }
      refreshTasks()
      return
    }
    if (task.__source === 'pipeline' && task.pipelineId) {
      try {
        await removePipelineTask(getToken, task.pipelineId, task.id)
        await onPipelinesChange?.()
        showToast('Task deleted', 'success')
      } catch (err) {
        showToast(err.message || 'Could not delete task', 'error')
      }
      refreshTasks()
      return
    }
    deleteLeadTask(task.parcelId, task.id)
    scheduleSync()
    refreshTasks()
    showToast('Task deleted', 'success')
  }

  const handleViewOnSchedule = (task) => {
    const at = task.scheduledAt || task.dueAt
    if (!at || !onOpenScheduleAtDate) return
    closeTaskDialog()
    onOpenScheduleAtDate(at)
  }

  const openAddTask = () => {
    setEditingTask(null)
    resetTaskForm()
    setShowAddTask(true)
  }

  const openEditTask = (task) => {
    setShowAddTask(false)
    setEditingTask(task)
    setAddTaskTitle(task.title || '')
    setAddTaskScheduledAt(
      task.__source === 'team' ? (task.dueAt ?? task.scheduledAt ?? null) : (task.scheduledAt ?? null)
    )
    setAddTaskScheduledEndAt(task.__source === 'team' ? null : (task.scheduledEndAt ?? null))
    setAddTaskDateTimeExpanded(!!(task.scheduledAt || task.dueAt))
    setAddTaskTeamAssignUids(
      task.__source === 'team' && Array.isArray(task.assignedUids) ? [...task.assignedUids] : []
    )
  }

  if (!lead) return null

  const leadLabel = displayLeadName(lead)
  const leadAddress = formatLeadAddress(lead)

  const taskRowProps = {
    displayLeads,
    teams,
    handleToggle,
    openEditTask,
    handleDeleteTask,
    onOpenScheduleAtDate: handleViewOnSchedule,
  }

  return (
    <>
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase opacity-50">Tasks</h3>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-7 w-7"
            onClick={openAddTask}
            title="New task"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        {tasks.length === 0 ? (
          <p className="text-xs opacity-40 py-2">No tasks yet.</p>
        ) : (
          <div className="space-y-4">
            {taskGroups.groups.map(({ deal, label, tasks: dealTasks }) => (
              <div key={deal.id}>
                <h4 className="text-[10px] font-semibold uppercase tracking-wide opacity-45 mb-2 px-0.5 truncate">
                  {label}
                </h4>
                <ul className="space-y-2">
                  {dealTasks.map((task) => (
                    <li key={`${task.id}-${task.__source || 'p'}`}>
                      {renderTaskRow(task, taskRowProps)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {taskGroups.unassigned.length > 0 && (
              <div>
                <h4 className="text-[10px] font-semibold uppercase tracking-wide opacity-45 mb-2 px-0.5">
                  General
                </h4>
                <ul className="space-y-2">
                  {taskGroups.unassigned.map((task) => (
                    <li key={`${task.id}-${task.__source || 'p'}`}>
                      {renderTaskRow(task, taskRowProps)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <Dialog open={showTaskDialog} onOpenChange={(open) => { if (!open) closeTaskDialog() }}>
        <DialogContent className="map-panel list-panel new-task-panel fullscreen-panel flex flex-col min-h-0 p-0" showCloseButton={false} nestedOverlay topLayer>
          <DialogHeader
            className="px-6 pt-6 pb-2 border-b border-white/20 flex-shrink-0 text-left"
            style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }}
          >
          <PanelHeader
            onBack={closeTaskDialog}
            title={isEditMode ? 'Edit task' : 'New task'}
          />
          <DialogDescription className="sr-only">
            {isEditMode ? 'Edit task for this lead' : 'Create a task for this lead'}
          </DialogDescription>
          </DialogHeader>
          <div className="px-6 py-4 flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-3 create-list-form" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
            <div className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2.5">
              <div className="text-sm font-medium truncate">{leadLabel}</div>
              {leadAddress && <div className="text-xs opacity-60 truncate mt-0.5">{leadAddress}</div>}
            </div>
            <div>
              <label className="text-xs font-medium block mb-1 opacity-90">
                Task title{' '}
                <span className="text-red-400" aria-label="required">*</span>
              </label>
              <Input
                value={addTaskTitle}
                onChange={(e) => setAddTaskTitle(e.target.value)}
                placeholder="e.g. Call back, Roof inspection"
                className="text-sm"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleSaveTask()}
              />
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
                    endValue={teamContextActive ? null : addTaskScheduledEndAt}
                    onEndChange={teamContextActive ? undefined : setAddTaskScheduledEndAt}
                    minDate={Date.now()}
                    leadName={leadLabel}
                    leadAddress={leadAddress}
                  />
                </div>
              )}
            </div>
            {showTeamAssign && (
              <TeamMemberAssignSection
                members={teamMemberList}
                selectedUids={addTaskTeamAssignUids}
                onToggle={(uid) => {
                  setAddTaskTeamAssignUids((prev) =>
                    prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid]
                  )
                }}
              />
            )}
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" className="create-list-btn flex-1" onClick={handleSaveTask}>
                {isEditMode ? 'Save' : 'Create'}
              </Button>
              <Button size="sm" variant="outline" className="create-list-btn flex-1" onClick={closeTaskDialog}>
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

export default LeadTasksSection
