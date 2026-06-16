import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Square, CheckSquare, ChevronDown, ChevronRight, Eye, EyeOff, Check, MoreVertical, Pencil, Trash2, Calendar, User } from 'lucide-react'
import { TeamSharedIcon } from './ResourceSharePicker'
import { PanelHeader, PANEL_LIST_HEADER_CLASS, PANEL_LIST_HEADER_STYLE } from './ui/panel-header'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { handlePanelDialogOpenChange, ignoreRadixMapPanelDismiss } from './ui/panelDialogUtils'
import { displayLeadName } from '@/utils/leads'
import {
  getAllTasks,
  getPersonalTasks,
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
  removePipelineTask,
  flattenPipelineTasks,
  pipelinesContainingParcel
} from '@/utils/pipelineTasks'
import { addTeamTask, updateTeamTask, removeTeamTask } from '@/utils/teamTasks'
import { createOptimisticTaskToggleHandler, setTasksWithPendingMerge } from '@/utils/taskToggle'
import { buildVisibleTaskListFresh } from '@/utils/taskListSync'
import { flattenTeamTasks, getAllTeamMembers, getMembersForTeamSharedPipeline, formatAssigneeList, resolveTeamTaskLeadId, shouldStoreAsTeamTask } from '@/utils/teamTaskUtils'
import { flattenDealsFromPipelines, findDealInPipelines } from '@/utils/deals'
import { fetchTeamTasks, updateTeamTask as updateServerTeamTask, deleteTeamTask } from '@/utils/tasks'
import { createServerAssignedTask, normalizeServerTask, resolveTaskContext, resolveTaskFormIdsFromTask } from '@/utils/taskCreateFlow'
import { ConvertToLeadPipelineDialog } from './ConvertToLeadPipelineDialog'
import { NewTaskDialog } from './NewTaskDialog'
import { useUserDataSync } from '@/contexts/UserDataSyncContext'
import { showToast } from './ui/toast'
import { PanelListBodyLoading } from './ui/PanelListLoadingShell'

import { cn } from '@/lib/utils'

function getLeadLabel(lead, parcelId) {
  if (!lead && !parcelId) return 'Standalone'
  if (lead) return displayLeadName(lead) || lead.address || parcelId || 'Lead'
  return parcelId || 'Lead'
}

export function TasksPanel({
  isOpen,
  panelDockSlot,
  topLayer = false,
  instantDismiss = false,
  onClose,
  onBack,
  onOpenParcelDetails,
  pipelines = [],
  leads = [],
  deals = [],
  onLeadsChange,
  activePipelineId = null,
  onOpenDeal,
  onOpenScheduleAtDate,
  onOpenLead,
  getToken = null,
  currentUser = null,
  onPipelinesChange,
  teams = []
}) {
  const { scheduleSync } = useUserDataSync()
  const [allTasks, setAllTasks] = useState([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [showAddTask, setShowAddTask] = useState(false)

  const [collapsedSections, setCollapsedSections] = useState({})
  const [showClosedTasks, setShowClosedTasks] = useState(false)
  const [editingTask, setEditingTask] = useState(null)

  const apiMode = pipelines.length > 0

  const displayLeads = useMemo(() => leads, [leads])

  const [pipePickerState, setPipePickerState] = useState(null)

  const refreshTasks = useCallback(async () => {
    setTasksLoading(true)
    try {
      // Tasks panel always shows the full merged list (TASK_LIST_SCOPE.ALL).
      if (apiMode) {
        const merged = await buildVisibleTaskListFresh({ pipelines, getToken, teams })
        setTasksWithPendingMerge(setAllTasks, merged)
      } else {
        setTasksWithPendingMerge(setAllTasks, getAllTasks())
      }
    } finally {
      setTasksLoading(false)
    }
  }, [apiMode, pipelines, getToken, teams])

  useEffect(() => {
    if (isOpen) refreshTasks()
    else {
      setShowAddTask(false)
      setEditingTask(null)
      setShowClosedTasks(false)
    }
  }, [isOpen, refreshTasks])

  const allDeals = useMemo(() => {
    const fromPipelines = flattenDealsFromPipelines(pipelines)
    if (fromPipelines.length > 0) return fromPipelines
    return (deals || []).map((d) => ({
      ...d,
      __pipelineId: d.__pipelineId ?? d.pipelineId ?? null,
    }))
  }, [pipelines, deals])

  const newTaskMemberList = useMemo(() => getAllTeamMembers(teams), [teams])

  const editingTaskFormIds = useMemo(
    () => resolveTaskFormIdsFromTask(editingTask, displayLeads, allDeals),
    [editingTask, displayLeads, allDeals]
  )

  const editTaskTeamMembers = useMemo(() => {
    if (!editingTask) return newTaskMemberList
    if (editingTask.__source === 'server') return getAllTeamMembers(teams)
    if (editingTask.__source === 'team') {
      const pipe = pipelines.find((p) => p.id === editingTask.pipelineId)
      return pipe ? getMembersForTeamSharedPipeline(pipe, teams) : []
    }
    return newTaskMemberList
  }, [editingTask, teams, pipelines, newTaskMemberList])

  const editTeamContext = editingTask?.__source === 'team' || editingTask?.__source === 'server'

  const openAddTask = () => {
    setShowAddTask(true)
  }

  const finalizeTaskCreate = useCallback(
    async ({ pipelineId, parcelId, dealId, title, scheduledAt, scheduledEndAt, assignedUids = [], leadId = null, deal = null, notes = null }) => {
      if (assignedUids.length > 0 && getToken) {
        try {
          await createServerAssignedTask(getToken, {
            title,
            scheduledAt,
            scheduledEndAt,
            assignedUids,
            leadId,
            dealId,
            deal,
            leads: displayLeads,
            pipelines,
            pipelineId,
            notes,
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
        const leadId = resolveTeamTaskLeadId(pipe, {
          parcelId,
          dealId,
          deals: pipe?.deals || [],
          displayLeads,
        })
        if (shouldStoreAsTeamTask(pipe, { assignedUids, leadId })) {
          try {
            await addTeamTask(getToken, pipelineId, leadId, {
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
        if (assignedUids.length > 0 && !leadId) {
          showToast('Could not resolve a lead for this pipe task', 'error')
          return
        }
        try {
          await addPipelineTask(getToken, pipelineId, {
            title,
            parcelId: parcelId || null,
            dealId: dealId || null,
            scheduledAt,
            scheduledEndAt,
            notes,
          })
          await onPipelinesChange?.()
          showToast('Task added', 'success')
        } catch (err) {
          showToast(err.message || 'Could not add task', 'error')
          return
        }
      } else {
        addTask({
          pipelineId: null,
          parcelId: parcelId || null,
          dealId: dealId || null,
          leadId: leadId || null,
          title,
          scheduledAt,
          scheduledEndAt,
          notes,
        })
        refreshTasks()
        scheduleSync()
        showToast('Task added', 'success')
      }
      setShowAddTask(false)
      refreshTasks()
    },
    [getToken, onPipelinesChange, refreshTasks, scheduleSync, pipelines, displayLeads, teams]
  )

  const handleCreateTask = ({
    title,
    scheduledAt,
    scheduledEndAt,
    assignedUids = [],
    leadId: addTaskLeadId,
    dealId: addTaskDealId,
    notes = null,
  }) => {
    const trimmed = title.trim()
    if (!trimmed) {
      showToast('Enter a task title', 'error')
      return
    }
    const newTaskUsesTeamStorage = assignedUids.length > 0
    const endAt = scheduledEndAt && scheduledEndAt > (scheduledAt || 0) ? scheduledEndAt : null
    if (!newTaskUsesTeamStorage) {
      if (endAt && scheduledAt && endAt <= scheduledAt) {
        showToast('End time must be after start time', 'error')
        return
      }
    }
    const dealId = addTaskDealId || null
    const deal = dealId ? allDeals.find((d) => d.id === dealId) : null
    const ctx = resolveTaskContext({
      leadId: addTaskLeadId,
      dealId,
      deal,
      leads: displayLeads,
      pipelines,
    })
    const payload = {
      title: trimmed,
      scheduledAt,
      scheduledEndAt: endAt,
      parcelId: ctx.parcelId,
      dealId: ctx.dealId,
      leadId: ctx.leadId,
      deal,
      assignedUids,
      notes,
    }

    if (assignedUids.length > 0) {
      if (!getToken) {
        showToast('Sign in to assign tasks to teammates', 'error')
        return
      }
      finalizeTaskCreate({ ...payload, pipelineId: ctx.pipelineId })
      return
    }

    // Deal selection implies its pipe — check before parcel/lead routing (deal auto-fills lead).
    if (ctx.dealId && apiMode && ctx.pipelineId) {
      finalizeTaskCreate({ ...payload, pipelineId: ctx.pipelineId })
      return
    }

    if (ctx.parcelId) {
      const leadForParcel = displayLeads.find((l) => l.parcelId === ctx.parcelId)
      if (leadForParcel?.__pipelineId) {
        finalizeTaskCreate({ ...payload, pipelineId: leadForParcel.__pipelineId })
        return
      }
      if (apiMode) {
        const owning = pipelinesContainingParcel(pipelines, ctx.parcelId)
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

  const handleToggle = useCallback(
    createOptimisticTaskToggleHandler({
      setTaskList: setAllTasks,
      getToken,
      onPipelinesChange,
      scheduleSync,
      onAfterLocalToggle: refreshTasks,
      onError: (err) => showToast(err.message || 'Could not update task', 'error'),
    }),
    [getToken, onPipelinesChange, scheduleSync, refreshTasks]
  )

  const handleDeleteTask = async (task) => {
    if (task.__source === 'server' && getToken) {
      try {
        await deleteTeamTask(getToken, task.id)
        showToast('Task deleted', 'success')
        refreshTasks()
      } catch (err) {
        showToast(err.message || 'Could not delete task', 'error')
      }
      return
    }
    if (task.__source === 'team' && task.pipelineId && task.leadId) {
      try {
        await removeTeamTask(getToken, task.pipelineId, task.leadId, task.id)
        await onPipelinesChange?.()
        showToast('Task deleted', 'success')
      } catch (err) {
        showToast(err.message || 'Could not delete task', 'error')
      }
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
      return
    }
    deleteLeadTask(task.parcelId, task.id)
    refreshTasks()
    scheduleSync()
    showToast('Task deleted', 'success')
  }

  const handleViewOnSchedule = (task) => {
    const at = task.scheduledAt || task.dueAt
    if (!at || !onOpenScheduleAtDate) return
    onOpenScheduleAtDate(at)
  }

  const toggleSection = (sectionId) => {
    setCollapsedSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }))
  }

  const resolveLeadFromTask = useCallback((task) => {
    if (task.leadId) {
      const byId = displayLeads.find((l) => l.id === task.leadId)
      if (byId) return byId
    }
    if (task.parcelId) {
      return displayLeads.find((l) => l.parcelId === task.parcelId || l.id === task.parcelId)
    }
    return null
  }, [displayLeads])

  const handleOpenLeadFromTask = useCallback((task) => {
    const lead = resolveLeadFromTask(task)
    if (!lead) {
      showToast('Lead not found', 'error')
      return
    }
    onOpenLead?.(lead)
  }, [resolveLeadFromTask, onOpenLead])

  const handleRowActivate = useCallback((task) => {
    if (task.dealId) {
      const deal = allDeals.find((d) => d.id === task.dealId)
      const pipelineId = deal?.__pipelineId
        ?? deal?.pipelineId
        ?? findDealInPipelines(pipelines, task.dealId).pipeline?.id
        ?? null
      if (onOpenDeal) {
        onOpenDeal(task.dealId, pipelineId)
      } else {
        showToast('Deal not found', 'error')
      }
      return
    }

    if (task.leadId || task.parcelId) {
      handleOpenLeadFromTask(task)
      return
    }

    setEditingTask(task)
  }, [allDeals, pipelines, onOpenDeal, handleOpenLeadFromTask])

  const handleEditTaskSubmit = async ({
    title,
    scheduledAt,
    scheduledEndAt,
    assignedUids = [],
    leadId = null,
    dealId = null,
  }) => {
    if (!editingTask) return
    const t = title.trim()
    if (!t) {
      showToast('Enter a task title', 'error')
      return
    }
    const endAt = scheduledEndAt && scheduledEndAt > (scheduledAt || 0) ? scheduledEndAt : null
    if (editingTask.__source === 'server' && getToken) {
      try {
        await updateServerTeamTask(getToken, editingTask.id, {
          title: t,
          scheduledAt,
          scheduledEndAt: endAt,
          assignedUids,
        })
        showToast('Task updated', 'success')
        setEditingTask(null)
        refreshTasks()
      } catch (err) {
        showToast(err.message || 'Could not update task', 'error')
      }
      return
    }
    if (editingTask.__source === 'team' && editingTask.pipelineId && editingTask.leadId) {
      try {
        await updateTeamTask(getToken, editingTask.pipelineId, editingTask.leadId, {
          id: editingTask.id,
          title: t,
          dueAt: scheduledAt,
          assignedUids,
        })
        await onPipelinesChange?.()
        showToast('Task updated', 'success')
        setEditingTask(null)
      } catch (err) {
        showToast(err.message || 'Could not update task', 'error')
      }
      return
    }
    if (endAt && scheduledAt && endAt <= scheduledAt) {
      showToast('End time must be after start time', 'error')
      return
    }

    const deal = dealId ? allDeals.find((d) => d.id === dealId) : null
    const ctx = resolveTaskContext({
      leadId,
      dealId,
      deal,
      leads: displayLeads,
      pipelines,
    })
    let parcelId = ctx.parcelId
    let pipelineId = ctx.pipelineId

    if (apiMode && parcelId) {
      const lead = displayLeads.find(
        (l) => String(l.parcelId) === String(parcelId) || String(l.id) === String(parcelId)
      )
      pipelineId = lead?.__pipelineId ?? pipelineId
    }

    const wasPipeline = editingTask.__source === 'pipeline' && editingTask.pipelineId
    const goingToPipe = !!pipelineId
    const sameTargetPipe = wasPipeline && goingToPipe && editingTask.pipelineId === pipelineId

    try {
      if (sameTargetPipe) {
        await updatePipelineTask(getToken, pipelineId, {
          id: editingTask.id,
          title: t,
          scheduledAt,
          scheduledEndAt: endAt,
          parcelId,
          dealId: ctx.dealId,
        })
        await onPipelinesChange?.()
      } else if (wasPipeline && !goingToPipe) {
        await removePipelineTask(getToken, editingTask.pipelineId, editingTask.id)
        addTask({
          pipelineId: null,
          parcelId: parcelId || null,
          dealId: ctx.dealId,
          leadId: ctx.leadId,
          title: t,
          scheduledAt,
          scheduledEndAt: endAt,
        })
        await onPipelinesChange?.()
        scheduleSync()
      } else if (wasPipeline && goingToPipe && !sameTargetPipe) {
        await removePipelineTask(getToken, editingTask.pipelineId, editingTask.id)
        await addPipelineTask(getToken, pipelineId, {
          id: editingTask.id,
          title: t,
          parcelId: parcelId || null,
          dealId: ctx.dealId,
          scheduledAt,
          scheduledEndAt: endAt,
        })
        await onPipelinesChange?.()
      } else if (!wasPipeline && goingToPipe) {
        removeLocalTaskById(editingTask.id)
        await addPipelineTask(getToken, pipelineId, {
          id: editingTask.id,
          title: t,
          parcelId: parcelId || null,
          dealId: ctx.dealId,
          scheduledAt,
          scheduledEndAt: endAt,
        })
        await onPipelinesChange?.()
        scheduleSync()
      } else {
        updateTaskById(editingTask.id, {
          title: t,
          scheduledAt,
          scheduledEndAt: endAt,
          pipelineId: null,
          parcelId,
          dealId: ctx.dealId,
          leadId: ctx.leadId,
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

  const handlePanelBack = () => {
    onBack?.() ?? onClose?.()
  }

  return (
    <>
    <Dialog
      open={isOpen}
      modal={false}
      onOpenChange={ignoreRadixMapPanelDismiss}
    >
      <DialogContent
        className="map-panel list-panel tasks-panel fullscreen-panel flex flex-col min-h-0"
        panelDockSlot={panelDockSlot}
        instantDismiss={instantDismiss}
        showCloseButton={false}
        hideOverlay
        suppressBackdrop
        topLayer={topLayer}
      >
        <DialogHeader className={cn(PANEL_LIST_HEADER_CLASS, 'flex-shrink-0')} style={PANEL_LIST_HEADER_STYLE}>
          <DialogDescription className="sr-only">Tasks grouped by pipe</DialogDescription>
          <PanelHeader onBack={handlePanelBack} title="Tasks">
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
          </PanelHeader>
        </DialogHeader>
        <div
          className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-6 py-4"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {tasksLoading && allTasks.length === 0 ? (
            <PanelListBodyLoading />
          ) : (
            <>
          {showEmptyOpen && (
            <p className="text-sm text-white/60 py-8 text-center">No open tasks</p>
          )}
          {unlabeled.length > 0 && (
            <section className="mb-4" aria-label="Tasks not in a pipe">
              <ul className="space-y-2">
                {unlabeled.map((task) => (
                  <li key={`${task.id}-${task.__source || 'p'}`}>
                    <TaskRow
                      task={task}
                      displayLeads={displayLeads}
                      teams={teams}
                      onToggle={handleToggle}
                      onActivate={() => handleRowActivate(task)}
                      onEdit={() => setEditingTask(task)}
                      onDelete={() => handleDeleteTask(task)}
                      onViewOnSchedule={(task.scheduledAt || task.dueAt) && onOpenScheduleAtDate ? () => handleViewOnSchedule(task) : null}
                      onOpenLead={(task.parcelId || task.leadId) ? () => handleOpenLeadFromTask(task) : null}
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
                      <li key={`${task.id}-${task.__source || 'p'}`}>
                        <TaskRow
                          task={task}
                          displayLeads={displayLeads}
                          teams={teams}
                          onToggle={handleToggle}
                          onActivate={() => handleRowActivate(task)}
                          onEdit={() => setEditingTask(task)}
                          onDelete={() => handleDeleteTask(task)}
                          onViewOnSchedule={(task.scheduledAt || task.dueAt) && onOpenScheduleAtDate ? () => handleViewOnSchedule(task) : null}
                          onOpenLead={(task.parcelId || task.leadId) ? () => handleOpenLeadFromTask(task) : null}
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
                      <li key={`${task.id}-${task.__source || 'p'}`}>
                        <TaskRow
                          task={task}
                          displayLeads={displayLeads}
                          teams={teams}
                          onToggle={handleToggle}
                          onActivate={() => handleRowActivate(task)}
                          onEdit={() => setEditingTask(task)}
                          onDelete={() => handleDeleteTask(task)}
                          onViewOnSchedule={null}
                          onOpenLead={(task.parcelId || task.leadId) ? () => handleOpenLeadFromTask(task) : null}
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
                          <li key={`${task.id}-${task.__source || 'p'}`}>
                            <TaskRow
                              task={task}
                              displayLeads={displayLeads}
                              teams={teams}
                              onToggle={handleToggle}
                              onActivate={() => handleRowActivate(task)}
                              onEdit={() => setEditingTask(task)}
                              onDelete={() => handleDeleteTask(task)}
                              onViewOnSchedule={null}
                              onOpenLead={(task.parcelId || task.leadId) ? () => handleOpenLeadFromTask(task) : null}
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
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>

      <NewTaskDialog
        open={showAddTask}
        onOpenChange={setShowAddTask}
        leads={displayLeads}
        deals={allDeals}
        showDealPicker={apiMode}
        showTeamAssign={newTaskMemberList.length > 0}
        teamMembers={newTaskMemberList}
        onSubmit={handleCreateTask}
        nestedOverlay
        topLayer
      />

      <NewTaskDialog
        open={!!editingTask}
        onOpenChange={(o) => handlePanelDialogOpenChange(o, false, () => setEditingTask(null), !!editingTask)}
        isEditMode
        leads={displayLeads}
        deals={allDeals}
        showDealPicker={apiMode}
        showTeamAssign={editTaskTeamMembers.length > 0}
        teamMembers={editTaskTeamMembers}
        teamContextActive={editTeamContext}
        initialTitle={editingTask?.title || ''}
        initialLeadId={editingTaskFormIds.leadId}
        initialDealId={editingTaskFormIds.dealId}
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
          editingTask && (editingTask.__source === 'team' || editingTask.__source === 'server') && Array.isArray(editingTask.assignedUids)
            ? [...editingTask.assignedUids]
            : []
        }
        lockLead={editTeamContext || !!editingTaskFormIds.dealId}
        lockDeal={editTeamContext && !!editingTaskFormIds.dealId}
        onSubmit={handleEditTaskSubmit}
        nestedOverlay
        topLayer
      />

      <ConvertToLeadPipelineDialog
        open={!!pipePickerState?.open}
        onOpenChange={(o) => { if (!o) setPipePickerState(null) }}
        pipelines={pipePickerState?.eligiblePipelines ?? []}
        currentUser={currentUser}
        topLayer
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

const TASK_OPTIONS_MENU_W = 168
const VIEWPORT_PAD = 8

function getModalPortalContainer() {
  if (typeof document === 'undefined') return null
  // Same layer as Radix `Dialog` — body-only portals render *under* #modal-root (index.html z-index 2147483647).
  return document.getElementById('modal-root') || document.body
}

export function TaskRow({ task, displayLeads, teams = [], onToggle, onActivate, onEdit, onDelete, onViewOnSchedule, onOpenLead, hideLeadLine = false }) {
  const lead = task.parcelId
    ? displayLeads.find((l) => l.parcelId === task.parcelId || l.id === task.parcelId)
    : (task.leadId ? displayLeads.find((l) => l.id === task.leadId) : null)
  const leadLine = !hideLeadLine && (task.parcelId || task.leadId)
    ? `Lead: ${getLeadLabel(lead, task.parcelId || task.leadId)}`
    : null
  const isAssignedTask = task.__source === 'team' || task.__source === 'server'
  const assigneeStr = isAssignedTask && (task.assignedUids?.length > 0)
    ? formatAssigneeList(task.assignedUids, teams)
    : null
  const isDone = task.completed
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuFixed, setMenuFixed] = useState(null)
  const optionsBtnRef = useRef(null)
  const portalMenuRef = useRef(null)

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuFixed(null)
      return
    }
    const place = () => {
      if (!optionsBtnRef.current) return
      const br = optionsBtnRef.current.getBoundingClientRect()
      const left = Math.max(
        VIEWPORT_PAD,
        Math.min(br.right - TASK_OPTIONS_MENU_W, window.innerWidth - TASK_OPTIONS_MENU_W - VIEWPORT_PAD)
      )
      let top = br.bottom + 4
      if (portalMenuRef.current) {
        const h = portalMenuRef.current.getBoundingClientRect().height
        if (top + h > window.innerHeight - VIEWPORT_PAD) {
          top = br.top - h - 4
        }
        if (top < VIEWPORT_PAD) top = VIEWPORT_PAD
      }
      setMenuFixed((prev) => {
        if (prev && Math.abs(prev.top - top) < 0.5 && Math.abs(prev.left - left) < 0.5) return prev
        return { top, left }
      })
    }
    place()
    const id = requestAnimationFrame(place)
    return () => cancelAnimationFrame(id)
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    const handleOutside = (e) => {
      const t = e.target
      if (optionsBtnRef.current?.contains(t) || portalMenuRef.current?.contains(t)) return
      setMenuOpen(false)
    }
    document.addEventListener('pointerdown', handleOutside)
    return () => document.removeEventListener('pointerdown', handleOutside)
  }, [menuOpen])

  return (
    <div
      className={cn(
        'text-sm rounded-lg p-3 transition-colors',
        onActivate ? 'cursor-pointer' : '',
        isDone
          ? 'map-panel-list-item opacity-80 border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08]'
          : 'map-panel-list-item border border-white/10 bg-white/[0.06] hover:bg-white/10'
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
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className={cn('font-medium panel-item-title text-white/95', isDone && 'line-through text-white/55')}>
              {task.title || '(untitled)'}
            </span>
            {isAssignedTask && (
              <TeamSharedIcon title="Team task" />
            )}
          </div>
          {leadLine && (
            <div className="panel-item-body text-white/55 mt-0.5 truncate" title={leadLine}>
              {leadLine}
            </div>
          )}
          {assigneeStr && (
            <div className="panel-item-body text-white/45 mt-0.5 truncate" title={assigneeStr}>
              {assigneeStr}
            </div>
          )}
          {isDone && task.completedAt != null && (
            <div className="panel-item-meta text-white/50 mt-0.5 truncate">
              Completed {formatTaskCompletedDate(task.completedAt)}
            </div>
          )}
          {!isDone && task.scheduledAt && (
            <div className={cn('panel-item-meta mt-0.5 truncate', task.scheduledAt < Date.now() ? 'text-red-400' : 'text-white/55')}>
              {formatTaskScheduledDate(task.scheduledAt)}
            </div>
          )}
        </div>
        <div className="relative flex-shrink-0">
          <button
            ref={optionsBtnRef}
            type="button"
            onClick={(e) => { e.stopPropagation(); setMenuOpen((p) => !p) }}
            className="p-1.5 -m-1 rounded-md text-white/50 hover:text-white/80 hover:bg-white/10 transition-colors"
            title="Options"
          >
            <MoreVertical className="h-[18px] w-[18px]" />
          </button>
          {menuOpen && menuFixed && getModalPortalContainer() && createPortal(
            <div
              ref={portalMenuRef}
              data-task-options-dropdown
              className="pointer-events-auto fixed z-[10030] rounded-xl py-1 overflow-hidden shadow-xl border border-white/20 min-w-[160px]"
              style={{
                top: menuFixed.top,
                left: menuFixed.left,
                background: 'rgba(30, 30, 30, 0.92)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
              }}
              role="menu"
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
            </div>,
            getModalPortalContainer()
          )}
        </div>
      </div>
    </div>
  )
}
