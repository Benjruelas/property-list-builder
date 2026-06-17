import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus } from 'lucide-react'
import { Button } from './ui/button'
import { CompletedTasksToggleButton } from './CompletedTasksToggleButton'
import { TaskListLoading } from './ui/PanelListLoadingShell'
import { splitOpenAndCompletedTasks } from '@/utils/taskListDisplay'
import { cn } from '@/lib/utils'
import { displayLeadName, formatLeadAddress } from '@/utils/leads'
import {
  deleteLeadTask,
  addTask,
  leadTaskKey,
  updateLeadTaskTitle,
  updateLeadTaskSchedule,
} from '@/utils/leadTasks'
import {
  addPipelineTask,
  removePipelineTask,
  updatePipelineTask,
  pipelinesContainingParcel,
} from '@/utils/pipelineTasks'
import { addTeamTask, removeTeamTask, updateTeamTask } from '@/utils/teamTasks'
import { createOptimisticTaskToggleHandler, setTasksWithPendingMerge } from '@/utils/taskToggle'
import { getAllTeamMembers, getMembersForTeamSharedPipeline, shouldStoreAsTeamTask } from '@/utils/teamTaskUtils'
import { findDealsForLead } from '@/utils/deals'
import { createServerAssignedTask, resolveTaskContext } from '@/utils/taskCreateFlow'
import { collectTasksForLeadFresh, groupLeadTasksByDeal } from '@/utils/dealTaskMatching'
import { ConvertToLeadPipelineDialog } from './ConvertToLeadPipelineDialog'
import { NewTaskDialog } from './NewTaskDialog'
import { TaskRow } from './TasksPanel'
import { useUserDataSync } from '@/contexts/UserDataSyncContext'
import { showToast } from './ui/toast'

function renderTaskGroups(taskGroups, taskRowProps) {
  const { groups, unassigned } = taskGroups
  const hasGroups = groups.length > 0 || unassigned.length > 0
  if (!hasGroups) return null

  return (
    <div className="space-y-4">
      {groups.map(({ deal, label, tasks: dealTasks }) => (
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
      {unassigned.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wide opacity-45 mb-2 px-0.5">
            General
          </h4>
          <ul className="space-y-2">
            {unassigned.map((task) => (
              <li key={`${task.id}-${task.__source || 'p'}`}>
                {renderTaskRow(task, taskRowProps)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function renderTaskRow(task, {
  displayLeads,
  allDeals,
  handleToggle,
  openEditTask,
  handleDeleteTask,
  onOpenScheduleAtDate,
}) {
  return (
    <TaskRow
      task={task}
      displayLeads={displayLeads}
      allDeals={allDeals}
      context="lead"
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
  className,
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
  const [tasksLoading, setTasksLoading] = useState(false)
  const [showCompletedTasks, setShowCompletedTasks] = useState(false)
  const [showAddTask, setShowAddTask] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [pipePickerState, setPipePickerState] = useState(null)

  const showTaskDialog = showAddTask || !!editingTask
  const isEditMode = !!editingTask

  const apiMode = pipelines.length > 0
  const displayLeads = useMemo(() => leads, [leads])
  const parcelKey = leadTaskKey(lead)

  const refreshTasks = useCallback(async () => {
    if (!lead) {
      setTasks([])
      return
    }
    setTasksLoading(true)
    try {
      // Lead detail — only tasks linked to this lead (TASK_LIST_SCOPE.LEAD).
      const list = await collectTasksForLeadFresh(lead, pipelines, { getToken, teams })
      setTasksWithPendingMerge(setTasks, list)
    } finally {
      setTasksLoading(false)
    }
  }, [lead, pipelines, getToken, teams])

  const { open: openTasks, completed: completedTasks } = useMemo(
    () => splitOpenAndCompletedTasks(tasks),
    [tasks]
  )

  const openTaskGroups = useMemo(
    () => (lead ? groupLeadTasksByDeal(openTasks, lead.id, pipelines, lead) : { groups: [], unassigned: [] }),
    [openTasks, lead, pipelines]
  )

  const completedTaskGroups = useMemo(
    () => (lead ? groupLeadTasksByDeal(completedTasks, lead.id, pipelines, lead) : { groups: [], unassigned: [] }),
    [completedTasks, lead, pipelines]
  )

  useEffect(() => {
    refreshTasks()
  }, [refreshTasks, refreshKey])

  useEffect(() => {
    setShowAddTask(false)
    setEditingTask(null)
    setShowCompletedTasks(false)
  }, [lead?.id])

  const closeTaskDialog = () => {
    setShowAddTask(false)
    setEditingTask(null)
  }

  const newTaskMemberList = useMemo(() => getAllTeamMembers(teams), [teams])
  const leadDeals = useMemo(() => {
    if (!lead) return []
    if (lead.id) {
      const byLeadId = findDealsForLead(pipelines, lead.id)
      if (byLeadId.length > 0) return byLeadId
    }
    if (!lead.parcelId) return []
    return pipelines.flatMap((p) => p.deals || []).filter(
      (d) => String(d.parcelId) === String(lead.parcelId)
    )
  }, [lead, pipelines])

  const allDeals = useMemo(() => {
    const fromPipelines = pipelines.flatMap((p) =>
      (p.deals || []).map((d) => ({
        ...d,
        __pipelineId: p.id,
        __pipelineTitle: p.title || 'Pipes',
      }))
    )
    if (fromPipelines.length > 0) return fromPipelines
    return leadDeals
  }, [pipelines, leadDeals])

  const editTaskPipeline = useMemo(() => {
    if (!editingTask?.pipelineId) return null
    return pipelines.find((p) => p.id === editingTask.pipelineId) || null
  }, [editingTask, pipelines])

  const editTaskMemberList = useMemo(
    () => (editTaskPipeline ? getMembersForTeamSharedPipeline(editTaskPipeline, teams) : []),
    [editTaskPipeline, teams]
  )
  const editIsTeamContext = isEditMode && editingTask?.__source === 'team' && editTaskMemberList.length > 0
  const showTeamAssign = newTaskMemberList.length > 0 || editIsTeamContext
  const teamMemberList = editIsTeamContext ? editTaskMemberList : newTaskMemberList
  const teamContextActive = editIsTeamContext

  const finalizeTaskCreate = useCallback(
    async ({ pipelineId, parcelId, dealId, title, scheduledAt, scheduledEndAt, assignedUids = [], leadId = null, deal = null }) => {
      if (assignedUids.length > 0 && getToken) {
        try {
          await createServerAssignedTask(getToken, {
            title,
            scheduledAt,
            scheduledEndAt,
            assignedUids,
            leadId: leadId || lead?.id || null,
            dealId,
            deal,
            leads: displayLeads,
            pipelines,
            pipelineId,
          })
          showToast('Task added', 'success')
          setShowAddTask(false)
          refreshTasks()
          return
        } catch (err) {
          showToast(err.message || 'Could not add task', 'error')
          return
        }
      }
      if (pipelineId) {
        const pipe = pipelines.find((p) => p.id === pipelineId)
        const teamLeadId = lead?.id || null
        if (shouldStoreAsTeamTask(pipe, { assignedUids, leadId: teamLeadId })) {
          try {
            await addTeamTask(getToken, pipelineId, teamLeadId, {
              title,
              dueAt: scheduledAt,
              assignedUids,
              dealId: dealId || null,
            })
            await onPipelinesChange?.()
            showToast('Task added', 'success')
          } catch (err) {
            showToast(err.message || 'Could not add task', 'error')
            return
          }
          setShowAddTask(false)
          refreshTasks()
          return
        }
        try {
          await addPipelineTask(getToken, pipelineId, {
            title,
            parcelId: parcelId || null,
            dealId: dealId || null,
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
        addTask({ pipelineId: null, parcelId: parcelId || null, dealId: dealId || null, title, scheduledAt, scheduledEndAt })
        scheduleSync()
        showToast('Task added', 'success')
      }
      setShowAddTask(false)
      refreshTasks()
    },
    [getToken, onPipelinesChange, refreshTasks, scheduleSync, pipelines, lead?.id, displayLeads]
  )

  const handleDialogSubmit = ({
    title,
    scheduledAt,
    scheduledEndAt,
    assignedUids = [],
    dealId = null,
    leadId: addTaskLeadId = null,
  }) => {
    if (isEditMode) {
      handleSaveEdit({ title, scheduledAt, scheduledEndAt, assignedUids })
      return
    }
    const trimmed = title.trim()
    if (!trimmed) {
      showToast('Enter a task title', 'error')
      return
    }
    if (!parcelKey) {
      showToast('Save this lead before adding tasks', 'error')
      return
    }
    const newTaskUsesTeamStorage = assignedUids.length > 0
    const endAt = scheduledEndAt && scheduledEndAt > (scheduledAt || 0) ? scheduledEndAt : null
    if (!newTaskUsesTeamStorage && endAt && scheduledAt && endAt <= scheduledAt) {
      showToast('End time must be after start time', 'error')
      return
    }
    const deal = dealId ? leadDeals.find((d) => d.id === dealId) : null
    const ctx = resolveTaskContext({
      leadId: addTaskLeadId || lead?.id || null,
      dealId,
      deal,
      leads: displayLeads,
      pipelines,
    })
    const payload = {
      title: trimmed,
      scheduledAt,
      scheduledEndAt: endAt,
      parcelId: ctx.parcelId || String(parcelKey),
      dealId: ctx.dealId,
      leadId: ctx.leadId,
      deal,
      assignedUids,
    }

    if (assignedUids.length > 0 && getToken) {
      finalizeTaskCreate({ ...payload, pipelineId: ctx.pipelineId || lead?.__pipelineId || null })
      return
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

  const handleSaveEdit = async ({ title, scheduledAt, scheduledEndAt, assignedUids = [] }) => {
    const trimmed = title.trim()
    if (!trimmed || !editingTask) return
    const endAt = scheduledEndAt && scheduledEndAt > (scheduledAt || 0) ? scheduledEndAt : null
    if (!editIsTeamContext && endAt && scheduledAt && endAt <= scheduledAt) {
      showToast('End time must be after start time', 'error')
      return
    }

    const task = editingTask
    try {
      if (task.__source === 'team' && task.pipelineId && task.leadId) {
        await updateTeamTask(getToken, task.pipelineId, task.leadId, {
          id: task.id,
          title: trimmed,
          dueAt: scheduledAt,
          assignedUids,
        })
        await onPipelinesChange?.()
      } else if (task.__source === 'pipeline' && task.pipelineId) {
        await updatePipelineTask(getToken, task.pipelineId, {
          id: task.id,
          title: trimmed,
          scheduledAt,
          scheduledEndAt: endAt,
        })
        await onPipelinesChange?.()
      } else {
        updateLeadTaskTitle(task.parcelId, task.id, trimmed)
        updateLeadTaskSchedule(task.parcelId, task.id, scheduledAt, endAt)
        scheduleSync()
      }
      showToast('Task updated', 'success')
      closeTaskDialog()
      refreshTasks()
    } catch (err) {
      showToast(err.message || 'Could not update task', 'error')
    }
  }

  const handleToggle = useCallback(
    createOptimisticTaskToggleHandler({
      setTaskList: setTasks,
      getToken,
      onPipelinesChange,
      scheduleSync,
      onAfterLocalToggle: refreshTasks,
      onError: (err) => showToast(err.message || 'Could not update task', 'error'),
    }),
    [getToken, onPipelinesChange, scheduleSync, refreshTasks]
  )

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
    setShowAddTask(true)
  }

  const openEditTask = (task) => {
    setShowAddTask(false)
    setEditingTask(task)
  }

  if (!lead) return null

  const leadLabel = displayLeadName(lead)
  const leadAddress = formatLeadAddress(lead)

  const taskRowProps = {
    displayLeads,
    allDeals,
    handleToggle,
    openEditTask,
    handleDeleteTask,
    onOpenScheduleAtDate: handleViewOnSchedule,
  }

  const hasOpenTasks =
    openTaskGroups.groups.length > 0 || openTaskGroups.unassigned.length > 0
  const hasCompletedTasks =
    completedTaskGroups.groups.length > 0 || completedTaskGroups.unassigned.length > 0

  return (
    <>
      <section className={cn('lead-detail-section', className)}>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="lead-detail-section-title">Tasks</h3>
          <div className="flex items-center gap-1">
            {completedTasks.length > 0 && (
              <CompletedTasksToggleButton
                showCompleted={showCompletedTasks}
                onToggle={() => setShowCompletedTasks((s) => !s)}
              />
            )}
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
        </div>
        {tasksLoading && tasks.length === 0 ? (
          <TaskListLoading />
        ) : !hasOpenTasks && !(showCompletedTasks && hasCompletedTasks) ? (
          <p className="text-xs opacity-40 py-2">No open tasks yet.</p>
        ) : (
          <>
            {renderTaskGroups(openTaskGroups, taskRowProps)}
            {showCompletedTasks && hasCompletedTasks && (
              <div className={hasOpenTasks ? 'mt-4 pt-3 border-t border-white/10' : undefined}>
                <h4 className="text-[10px] font-semibold uppercase tracking-wide opacity-45 mb-2 px-0.5">
                  Completed
                </h4>
                {renderTaskGroups(completedTaskGroups, taskRowProps)}
              </div>
            )}
          </>
        )}
      </section>

      <NewTaskDialog
        open={showTaskDialog}
        onOpenChange={(open) => {
          if (!open) closeTaskDialog()
        }}
        isEditMode={isEditMode}
        initialTitle={editingTask?.title || ''}
        initialLeadId={lead?.id || null}
        initialDealId={isEditMode ? (editingTask?.dealId || null) : null}
        initialScheduledAt={
          editingTask
            ? editingTask.__source === 'team'
              ? (editingTask.dueAt ?? editingTask.scheduledAt ?? null)
              : (editingTask.scheduledAt ?? null)
            : null
        }
        initialScheduledEndAt={
          editingTask && editingTask.__source !== 'team' ? (editingTask.scheduledEndAt ?? null) : null
        }
        initialDateTimeExpanded={!!(editingTask?.scheduledAt || editingTask?.dueAt)}
        initialTeamAssignUids={
          editingTask?.__source === 'team' && Array.isArray(editingTask.assignedUids)
            ? [...editingTask.assignedUids]
            : []
        }
        leads={displayLeads}
        deals={leadDeals}
        showDealPicker
        lockLead
        disableDealClear={isEditMode && !!editingTask?.dealId}
        showTeamAssign={showTeamAssign}
        teamMembers={teamMemberList}
        teamContextActive={teamContextActive}
        leadName={leadLabel}
        leadAddress={leadAddress}
        onSubmit={handleDialogSubmit}
        nestedOverlay
        topLayer
      />

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
