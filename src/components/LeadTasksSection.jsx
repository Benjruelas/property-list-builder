import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Plus } from 'lucide-react'
import { Button } from './ui/button'
import { CompletedTasksToggleButton } from './CompletedTasksToggleButton'
import { TaskListLoading } from './ui/PanelListLoadingShell'
import { splitOpenAndCompletedTasks } from '@/utils/taskListDisplay'
import { cn } from '@/lib/utils'
import { displayLeadName, formatLeadAddress } from '@/utils/leads'
import { leadTaskKey } from '@/utils/leadTasks'
import { pipelinesContainingParcel } from '@/utils/pipelineTasks'
import { findDealsForLead } from '@/utils/deals'
import { resolveTaskContext } from '@/utils/taskCreateFlow'
import { createServerTask, patchServerTask, removeServerTask } from '@/utils/serverTaskOps'
import { createOptimisticTaskToggleHandler, setTasksWithPendingMerge } from '@/utils/taskToggle'
import { getAllTeamMembers, getMembersForTeamSharedPipeline } from '@/utils/teamTaskUtils'
import { collectTasksForLeadFresh, groupLeadTasksByDeal } from '@/utils/dealTaskMatching'
import { MoveDealDialog } from './MoveDealDialog'
import { NewTaskDialog } from './NewTaskDialog'
import { TaskRow } from './TasksPanel'
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
  onNestedOverlayChange,
  showCreateButton = true,
  hideWhenEmpty = false,
  createRequestKey = 0,
}) {
  const [tasks, setTasks] = useState([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const tasksLoadedForLeadId = useRef(null)
  const [showCompletedTasks, setShowCompletedTasks] = useState(false)
  const [showAddTask, setShowAddTask] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [pipePickerState, setPipePickerState] = useState(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  const resetSaving = useCallback(() => {
    savingRef.current = false
    setSaving(false)
  }, [])

  const showTaskDialog = showAddTask || !!editingTask
  const isEditMode = !!editingTask

  useEffect(() => {
    onNestedOverlayChange?.(showTaskDialog || !!pipePickerState?.open)
  }, [showTaskDialog, pipePickerState, onNestedOverlayChange])

  const apiMode = pipelines.length > 0
  const displayLeads = useMemo(() => leads, [leads])
  const parcelKey = leadTaskKey(lead)

  const refreshTasks = useCallback(async () => {
    if (!lead) {
      setTasks([])
      tasksLoadedForLeadId.current = null
      return
    }
    const isInitialLoad = tasksLoadedForLeadId.current !== lead.id
    if (isInitialLoad) setTasksLoading(true)
    try {
      // Lead detail — only tasks linked to this lead (TASK_LIST_SCOPE.LEAD).
      const list = await collectTasksForLeadFresh(lead, pipelines, { getToken, teams })
      setTasksWithPendingMerge(setTasks, list)
      tasksLoadedForLeadId.current = lead.id
    } finally {
      if (isInitialLoad) setTasksLoading(false)
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
    setTasks([])
    tasksLoadedForLeadId.current = null
  }, [lead?.id])

  const closeTaskDialog = () => {
    setShowAddTask(false)
    setEditingTask(null)
  }

  useEffect(() => {
    if (!showTaskDialog) resetSaving()
  }, [showTaskDialog, resetSaving])

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
    async (payload) => {
      if (savingRef.current) return
      if (!getToken) {
        showToast('Sign in to create tasks', 'error')
        return
      }
      savingRef.current = true
      setSaving(true)
      try {
        await createServerTask(getToken, { ...payload, leads: displayLeads, pipelines })
        showToast('Task added', 'success')
        setShowAddTask(false)
        refreshTasks()
      } catch (err) {
        showToast(err.message || 'Could not add task', 'error')
        resetSaving()
      }
    },
    [getToken, refreshTasks, resetSaving, pipelines, displayLeads]
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

    if (assignedUids.length > 0 && !getToken) {
      showToast('Sign in to assign tasks to teammates', 'error')
      return
    }
    if (!getToken) {
      showToast('Sign in to create tasks', 'error')
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
    if (!getToken) {
      showToast('Sign in to edit tasks', 'error')
      return
    }
    try {
      await patchServerTask(getToken, task.id, {
        title: trimmed,
        scheduledAt,
        scheduledEndAt: endAt,
        assignedUids: editIsTeamContext ? assignedUids : undefined,
      })
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
      onAfterLocalToggle: refreshTasks,
      onError: (err) => showToast(err.message || 'Could not update task', 'error'),
    }),
    [getToken, refreshTasks]
  )

  const handleDeleteTask = async (task) => {
    if (!getToken) {
      showToast('Sign in to delete tasks', 'error')
      return
    }
    try {
      await removeServerTask(getToken, task.id)
      showToast('Task deleted', 'success')
      refreshTasks()
    } catch (err) {
      showToast(err.message || 'Could not delete task', 'error')
    }
  }

  const handleViewOnSchedule = (task) => {
    const at = task.scheduledAt || task.dueAt
    if (!at || !onOpenScheduleAtDate) return
    closeTaskDialog()
    onOpenScheduleAtDate(at)
  }

  const openAddTask = useCallback(() => {
    setEditingTask(null)
    setShowAddTask(true)
  }, [])

  useEffect(() => {
    if (!createRequestKey) return
    openAddTask()
  }, [createRequestKey, openAddTask])

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
  const hasAnyTasks = hasOpenTasks || hasCompletedTasks
  const hideSection = hideWhenEmpty && !hasAnyTasks

  return (
    <>
      {!hideSection && (
      <section className={cn('lead-detail-section', className)}>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="lead-detail-section-title">Tasks</h3>
          {(completedTasks.length > 0 || showCreateButton) && (
          <div className="flex items-center gap-1">
            {completedTasks.length > 0 && (
              <CompletedTasksToggleButton
                showCompleted={showCompletedTasks}
                onToggle={() => setShowCompletedTasks((s) => !s)}
              />
            )}
            {showCreateButton && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={openAddTask}
              title="New task"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Create
            </Button>
            )}
          </div>
          )}
        </div>
        {tasksLoading && tasks.length === 0 ? (
          <TaskListLoading />
        ) : !hasOpenTasks && !(showCompletedTasks && hasCompletedTasks) ? (
          <p className="text-xs text-white/40">No tasks yet</p>
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
      )}

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
        saving={!isEditMode && saving}
        nestedOverlay
        topLayer
      />

      <MoveDealDialog
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
        topLayer
      />
    </>
  )
}

export default LeadTasksSection
