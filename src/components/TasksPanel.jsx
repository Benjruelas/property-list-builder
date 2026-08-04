import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Square, CheckSquare, ChevronDown, ChevronRight, Eye, EyeOff, Check, MoreVertical, Pencil, Trash2, Calendar, User, Briefcase } from 'lucide-react'
import { TeamSharedIcon } from './ResourceSharePicker'
import { PanelHeader, PANEL_LIST_HEADER_CLASS, PANEL_LIST_HEADER_STYLE } from './ui/panel-header'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { handlePanelDialogOpenChange, ignoreRadixMapPanelDismiss } from './ui/panelDialogUtils'
import { buildVisibleTaskListFresh } from '@/utils/taskListSync'
import { createOptimisticTaskToggleHandler, setTasksWithPendingMerge } from '@/utils/taskToggle'
import { getAllTeamMembers, getMembersForTeamSharedPipeline } from '@/utils/teamTaskUtils'
import { getTaskRowDisplayFields } from '@/utils/taskRowDisplay'
import { flattenDealsFromPipelines, findDealInPipelines } from '@/utils/deals'
import { patchServerTask, removeServerTask } from '@/utils/serverTaskOps'
import { resolveTaskFormIdsFromTask } from '@/utils/taskCreateFlow'
import { getAllTasks, groupOpenTasksByPipeline, groupCompletedTasksByPipeline } from '@/utils/leadTasks'
import { CreateTaskPanel } from './CreateTaskPanel'
import { NewTaskDialog } from './NewTaskDialog'
import { showToast } from './ui/toast'
import { PanelListBodyLoading } from './ui/PanelListLoadingShell'
import { WindowedItems } from '@/hooks/useWindowedList'

import { cn } from '@/lib/utils'

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
  teams = [],
  onCreateLead,
}) {
  const [allTasks, setAllTasks] = useState([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const tasksLoadedOnce = useRef(false)
  const [listReady, setListReady] = useState(false)
  const [showAddTask, setShowAddTask] = useState(false)

  const [collapsedSections, setCollapsedSections] = useState({})
  const [showClosedTasks, setShowClosedTasks] = useState(false)
  const [editingTask, setEditingTask] = useState(null)

  const apiMode = pipelines.length > 0

  const displayLeads = useMemo(() => leads, [leads])

  const refreshTasks = useCallback(async () => {
    const isInitialLoad = !tasksLoadedOnce.current
    if (isInitialLoad) setTasksLoading(true)
    try {
      // Tasks panel always shows the full merged list (TASK_LIST_SCOPE.ALL).
      if (apiMode) {
        if (!getToken) {
          setTasksWithPendingMerge(setAllTasks, [])
          tasksLoadedOnce.current = true
          setListReady(true)
          return
        }
        const merged = await buildVisibleTaskListFresh({ getToken, teams })
        setTasksWithPendingMerge(setAllTasks, merged)
      } else {
        setTasksWithPendingMerge(setAllTasks, getAllTasks())
      }
      tasksLoadedOnce.current = true
      setListReady(true)
    } finally {
      if (isInitialLoad) setTasksLoading(false)
    }
  }, [apiMode, pipelines, getToken, teams])

  useEffect(() => {
    if (isOpen) refreshTasks()
    else {
      setShowAddTask(false)
      setEditingTask(null)
      setShowClosedTasks(false)
      tasksLoadedOnce.current = false
      setListReady(false)
      setTasksLoading(false)
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

  const editTeamContext = editingTask?.__source === 'team'

  const openAddTask = () => {
    if (apiMode && !getToken) {
      showToast('Sign in to create tasks', 'error')
      return
    }
    setShowAddTask(true)
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
    onOpenScheduleAtDate(at)
  }

  const toggleSection = (sectionId) => {
    setCollapsedSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }))
  }

  const resolveLeadFromTask = useCallback((task) => {
    if (task.leadId) {
      const byId = displayLeads.find((l) => String(l.id) === String(task.leadId))
      if (byId) return byId
    }
    if (task.parcelId) {
      const key = String(task.parcelId)
      return displayLeads.find((l) => String(l.parcelId) === key || String(l.id) === key)
    }
    if (task.dealId) {
      const deal = allDeals.find((d) => String(d.id) === String(task.dealId))
      if (deal?.leadId) {
        const byDealLead = displayLeads.find((l) => String(l.id) === String(deal.leadId))
        if (byDealLead) return byDealLead
      }
    }
    return null
  }, [displayLeads, allDeals])

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
      const found = findDealInPipelines(pipelines, task.dealId)
      const deal = found.deal
        || allDeals.find((d) => String(d.id) === String(task.dealId))
        || null
      const pipelineId = found.pipeline?.id
        ?? deal?.__pipelineId
        ?? deal?.pipelineId
        ?? task.pipelineId
        ?? null
      // Only open when the deal and its pipeline can actually render — otherwise
      // nav docks Tasks beside a missing primary panel.
      if (!deal || !pipelineId || !onOpenDeal) {
        showToast('Deal not found', 'error')
        return
      }
      onOpenDeal(task.dealId, pipelineId)
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
  }) => {
    if (!editingTask) return
    const t = title.trim()
    if (!t) {
      showToast('Enter a task title', 'error')
      return
    }
    if (!getToken) {
      showToast('Sign in to edit tasks', 'error')
      return
    }
    const endAt = scheduledEndAt && scheduledEndAt > (scheduledAt || 0) ? scheduledEndAt : null
    if (endAt && scheduledAt && endAt <= scheduledAt) {
      showToast('End time must be after start time', 'error')
      return
    }
    try {
      await patchServerTask(getToken, editingTask.id, {
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
  }

  const needsSignIn = apiMode && !getToken

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
          {needsSignIn ? (
            <p className="text-sm text-white/60 py-8 text-center">Sign in to view and manage tasks.</p>
          ) : tasksLoading && allTasks.length === 0 ? (
            <PanelListBodyLoading />
          ) : (
            <div className={cn(listReady && 'panel-data-fade-in')}>
          {showEmptyOpen && (
            <p className="text-sm text-white/60 py-8 text-center">No open tasks</p>
          )}
          {unlabeled.length > 0 && (
            <section className="mb-4" aria-label="Tasks not in a pipe">
              <ul className="space-y-2">
                <WindowedItems items={unlabeled} sentinelTag="li">
                  {(task) => (
                    <li key={`${task.id}-${task.__source || 'p'}`}>
                      <TaskRow
                        task={task}
                        displayLeads={displayLeads}
                        allDeals={allDeals}
                        onToggle={handleToggle}
                        onActivate={() => handleRowActivate(task)}
                        onEdit={() => setEditingTask(task)}
                        onDelete={() => handleDeleteTask(task)}
                        onViewOnSchedule={(task.scheduledAt || task.dueAt) && onOpenScheduleAtDate ? () => handleViewOnSchedule(task) : null}
                        onOpenLead={(task.parcelId || task.leadId) ? () => handleOpenLeadFromTask(task) : null}
                      />
                    </li>
                  )}
                </WindowedItems>
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
                    <WindowedItems items={tasks} sentinelTag="li">
                      {(task) => (
                        <li key={`${task.id}-${task.__source || 'p'}`}>
                          <TaskRow
                            task={task}
                            displayLeads={displayLeads}
                            allDeals={allDeals}
                            onToggle={handleToggle}
                            onActivate={() => handleRowActivate(task)}
                            onEdit={() => setEditingTask(task)}
                            onDelete={() => handleDeleteTask(task)}
                            onViewOnSchedule={(task.scheduledAt || task.dueAt) && onOpenScheduleAtDate ? () => handleViewOnSchedule(task) : null}
                            onOpenLead={(task.parcelId || task.leadId) ? () => handleOpenLeadFromTask(task) : null}
                          />
                        </li>
                      )}
                    </WindowedItems>
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
                    <WindowedItems items={closedUnlabeled} sentinelTag="li">
                      {(task) => (
                        <li key={`${task.id}-${task.__source || 'p'}`}>
                          <TaskRow
                            task={task}
                            displayLeads={displayLeads}
                            allDeals={allDeals}
                            onToggle={handleToggle}
                            onActivate={() => handleRowActivate(task)}
                            onEdit={() => setEditingTask(task)}
                            onDelete={() => handleDeleteTask(task)}
                            onViewOnSchedule={null}
                            onOpenLead={(task.parcelId || task.leadId) ? () => handleOpenLeadFromTask(task) : null}
                          />
                        </li>
                      )}
                    </WindowedItems>
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
                        <WindowedItems items={tasks} sentinelTag="li">
                          {(task) => (
                            <li key={`${task.id}-${task.__source || 'p'}`}>
                              <TaskRow
                                task={task}
                                displayLeads={displayLeads}
                                allDeals={allDeals}
                                onToggle={handleToggle}
                                onActivate={() => handleRowActivate(task)}
                                onEdit={() => setEditingTask(task)}
                                onDelete={() => handleDeleteTask(task)}
                                onViewOnSchedule={null}
                                onOpenLead={(task.parcelId || task.leadId) ? () => handleOpenLeadFromTask(task) : null}
                              />
                            </li>
                          )}
                        </WindowedItems>
                      </ul>
                    )}
                  </section>
                )
              })}
            </div>
          )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

      <CreateTaskPanel
        open={showAddTask}
        onOpenChange={setShowAddTask}
        pipelines={pipelines}
        leads={displayLeads}
        deals={allDeals}
        getToken={getToken}
        currentUser={currentUser}
        teams={teams}
        onPipelinesChange={onPipelinesChange}
        onCreated={refreshTasks}
        onCreateLead={onCreateLead}
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
        onCreateLead={onCreateLead}
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

export function TaskRow({
  task,
  displayLeads,
  allDeals = [],
  context = 'panel',
  onToggle,
  onActivate,
  onEdit,
  onDelete,
  onViewOnSchedule,
  onOpenLead,
  /** @deprecated use `context` instead */
  hideLeadLine = false,
}) {
  const rowContext = hideLeadLine && context === 'panel' ? 'lead' : context
  const { showShared, leadLabel, dealLabel, dueLabel, overdue } = getTaskRowDisplayFields(task, rowContext, {
    displayLeads,
    allDeals,
  })
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
          </div>
          {(showShared || leadLabel || dealLabel || dueLabel) && (
            <div className="flex items-center gap-2 flex-wrap min-w-0 mt-0.5 panel-item-meta text-white/55">
              {showShared && (
                <TeamSharedIcon title="Shared task" size="xs" />
              )}
              {leadLabel && (
                <span className="inline-flex items-center gap-1 min-w-0 max-w-full truncate" title={`Lead: ${leadLabel}`}>
                  <User className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                  <span className="truncate">{leadLabel}</span>
                </span>
              )}
              {dealLabel && (
                <span className="inline-flex items-center gap-1 min-w-0 max-w-full truncate" title={`Deal: ${dealLabel}`}>
                  <Briefcase className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                  <span className="truncate">{dealLabel}</span>
                </span>
              )}
              {dueLabel && (
                <span className={cn('truncate', overdue && 'text-red-400')} title={dueLabel}>
                  {dueLabel}
                </span>
              )}
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
