import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { X, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { Button } from './ui/button'
import { PanelHeader, PANEL_LIST_HEADER_CLASS, PANEL_LIST_HEADER_STYLE } from './ui/panel-header'
import { Dialog, DialogContent, DialogHeader, DialogDescription } from './ui/dialog'
import { ignoreRadixMapPanelDismiss, mapListDialogOpen, listPanelObscuredByDetail } from './ui/panelDialogUtils'
import { cn } from '@/lib/utils'
import { getAllTasks, getPersonalTasks, addTask } from '@/utils/leadTasks'
import { addPipelineTask, flattenPipelineTasks, pipelinesContainingParcel } from '@/utils/pipelineTasks'
import { addTeamTask } from '@/utils/teamTasks'
import { flattenTeamTasks, getAllTeamMembers } from '@/utils/teamTaskUtils'
import { flattenDealsFromPipelines, findDealInPipelines } from '@/utils/deals'
import { NewTaskDialog } from './NewTaskDialog'
import { fetchTeamTasks } from '@/utils/tasks'
import { createServerAssignedTask, normalizeServerTask, resolveTaskContext } from '@/utils/taskCreateFlow'
import { ConvertToLeadPipelineDialog } from './ConvertToLeadPipelineDialog'
import { useUserDataSync } from '@/contexts/UserDataSyncContext'
import { showToast } from './ui/toast'
import { TaskListLoading } from './ui/PanelListLoadingShell'
import { EditLeadTaskDialog } from './EditLeadTaskDialog'
import { getScheduleTaskDisplay } from '@/utils/taskRowDisplay'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const HOURS = Array.from({ length: 24 }, (_, i) => i) // 0-23 (12 AM - 11 PM)
const SCHEDULE_WEEK_HOUR_HEIGHT = 36
const SCHEDULE_DAY_HOUR_HEIGHT = 56
const SCHEDULE_DAY_MIN_TASK_HEIGHT = 36

function getDaysInMonth(year, month) {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const days = []
  const startPad = first.getDay()
  for (let i = 0; i < startPad; i++) days.push(null)
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d))
  return days
}

function getWeekDays(sunday) {
  const out = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday)
    d.setDate(sunday.getDate() + i)
    out.push(d)
  }
  return out
}

function getSundayOfWeek(date) {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  return d
}

function ScheduleTaskItem({ task, displayLeads, allDeals, variant = 'pill', className, style, onClick }) {
  const { title, contextLabel, tooltip } = getScheduleTaskDisplay(task, { displayLeads, allDeals })
  if (variant === 'block') {
    return (
      <div className={cn('schedule-task-block', className)} style={style} onClick={onClick} title={tooltip}>
        <div className="schedule-task-block-content">
          <div className="schedule-task-block-title">{title}</div>
          {contextLabel ? <div className="schedule-task-block-meta">{contextLabel}</div> : null}
        </div>
      </div>
    )
  }
  return (
    <div className={cn('schedule-task-pill', className)} style={style} onClick={onClick} title={tooltip}>
      <div className="schedule-task-pill-title">{title}</div>
      {contextLabel ? <div className="schedule-task-pill-meta">{contextLabel}</div> : null}
    </div>
  )
}

function NowIndicator({ viewMode, weekStart, dayViewDate, hourHeight = SCHEDULE_WEEK_HOUR_HEIGHT }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const top = (now.getHours() + now.getMinutes() / 60) * hourHeight

  if (viewMode === 'week' && weekStart) {
    const sunday = new Date(weekStart)
    sunday.setHours(0, 0, 0, 0)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const diff = Math.round((todayStart - sunday) / (24 * 60 * 60 * 1000))
    if (diff < 0 || diff >= 7) return null
    return <div className="schedule-now-line" style={{ top, left: `calc(48px + ${diff} * (100% - 48px) / 7)` }} />
  }
  if (viewMode === 'day' && dayViewDate) {
    if (dayViewDate.toDateString() !== now.toDateString()) return null
    return <div className="schedule-now-line" style={{ top }} />
  }
  return null
}

export function SchedulePanel({ isOpen, retainDuringSwap = false, panelDockSlot, onClose, onBack, hasScheduleOpener = false, stacked = false, obscuredByLeadDetail = false, onOpenScheduleLead, onOpenParcelDetails, onEmailClick, onPhoneClick, onTextClick, onSkipTraceParcel, skipTracingInProgress, leads = [], pipelines = [], activePipelineId = null, onLeadsChange, initialDate = null, onInitialDateConsumed, onRequestMoveLead, onRequestRemoveLead, onGoToParcelOnMap, onOpenAddTask, getToken = null, currentUser = null, onPipelinesChange, teams = [], teamMembership = null, onEditLead, onCreateLead }) {
  const { scheduleSync } = useUserDataSync()
  const displayLeads = useMemo(() => leads, [leads])
  const [allTasks, setAllTasks] = useState([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const tasksLoadedOnce = useRef(false)
  const [calendarReady, setCalendarReady] = useState(false)
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth())
  const [viewMode, setViewMode] = useState('day') // 'month' | 'week' | 'day'
  const [weekStart, setWeekStart] = useState(null) // Sunday of displayed week (for week view)
  const [dayViewDate, setDayViewDate] = useState(() => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth(), n.getDate())
  })
  const [showAddTask, setShowAddTask] = useState(false)
  const [addTaskPrefill, setAddTaskPrefill] = useState(null)
  const [editTaskContext, setEditTaskContext] = useState(null)
  const [adminTeamView, setAdminTeamView] = useState(false)

  const apiMode = pipelines.length > 0
  const [pipePickerState, setPipePickerState] = useState(null)
  const isTeamAdmin = teamMembership?.role === 'admin'

  const refreshTasks = useCallback(async () => {
    const isInitialLoad = !tasksLoadedOnce.current
    if (isInitialLoad) setTasksLoading(true)
    try {
      if (apiMode) {
        let tasks = [
          ...getPersonalTasks(),
          ...flattenPipelineTasks(pipelines),
          ...flattenTeamTasks(pipelines),
        ]
        if (getToken && teams?.length > 0) {
          const { tasks: serverTasks } = await fetchTeamTasks(getToken)
          const ids = new Set(tasks.map((t) => t.id))
          for (const t of serverTasks) {
            if (!ids.has(t.id)) {
              tasks.push(normalizeServerTask(t))
              ids.add(t.id)
            }
          }
        }
        setAllTasks(tasks)
      } else {
        setAllTasks(getAllTasks())
      }
      tasksLoadedOnce.current = true
      setCalendarReady(true)
    } finally {
      if (isInitialLoad) setTasksLoading(false)
    }
  }, [apiMode, pipelines, getToken, teams])

  useEffect(() => {
    if (isOpen) {
      refreshTasks()
    } else {
      tasksLoadedOnce.current = false
      setCalendarReady(false)
      setTasksLoading(false)
    }
  }, [isOpen, refreshTasks])

  useEffect(() => {
    if (isOpen && initialDate != null) {
      const d = new Date(initialDate)
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
      setViewMode('day')
      setWeekStart(getSundayOfWeek(d))
      setDayViewDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()))
      onInitialDateConsumed?.()
    }
  }, [isOpen, initialDate, onInitialDateConsumed])

  const tasksByDay = (() => {
    const map = {}
    for (const t of allTasks) {
      if (!t.scheduledAt || t.completed) continue
      const d = new Date(t.scheduledAt)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      if (!map[key]) map[key] = []
      map[key].push(t)
    }
    return map
  })()

  const allDeals = useMemo(() => flattenDealsFromPipelines(pipelines), [pipelines])
  const newTaskMemberList = useMemo(() => getAllTeamMembers(teams), [teams])

  const openAddTaskWithSchedule = (d, finalAt, endAt) => {
    setAddTaskPrefill({
      scheduledAt: finalAt,
      scheduledEndAt: endAt,
      dateTimeExpanded: true,
      headerSubtitle: d.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    })
    setShowAddTask(true)
  }

  const handleDayClick = (d) => {
    if (!d) return
    const now = new Date()
    const isToday = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
    let finalAt
    if (isToday) {
      const nextHour = new Date(now)
      nextHour.setMinutes(0, 0, 0)
      nextHour.setHours(nextHour.getHours() + 1)
      finalAt = nextHour.getTime()
    } else {
      finalAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0).getTime()
    }
    const endAt = finalAt + 60 * 60 * 1000
    openAddTaskWithSchedule(d, finalAt, endAt)
  }

  const handleHourCellClick = (dayDate, hour) => {
    const finalAt = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), hour, 0).getTime()
    const endAt = finalAt + 60 * 60 * 1000
    openAddTaskWithSchedule(dayDate, finalAt, endAt)
  }

  const formatHour = (h) => {
    if (h === 0) return '12 AM'
    if (h === 12) return '12 PM'
    return h < 12 ? `${h} AM` : `${h - 12} PM`
  }

  const finalizeTaskCreate = useCallback(
    async ({ pipelineId, parcelId, dealId, title, scheduledAt, scheduledEndAt, assignedUids = [], leadId = null, deal = null }) => {
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
          })
          showToast('Task scheduled', 'success')
          setShowAddTask(false)
          refreshTasks()
          const lead = parcelId ? displayLeads.find((l) => l.parcelId === parcelId) : null
          if (lead) onOpenScheduleLead?.(lead.id)
          return
        } catch (err) {
          showToast(err.message || 'Could not add task', 'error')
          return
        }
      }
      if (pipelineId) {
        const pipe = pipelines.find((p) => p.id === pipelineId)
        const isTeamPipe = pipe && Array.isArray(pipe.teamShares) && pipe.teamShares.length > 0
        if (isTeamPipe && parcelId) {
          const lead = (pipe?.leads || []).find((l) => String(l.parcelId) === String(parcelId))
          if (lead?.id) {
            try {
              await addTeamTask(getToken, pipelineId, lead.id, {
                title,
                dueAt: scheduledAt,
                assignedUids,
                dealId: dealId || null,
              })
              await onPipelinesChange?.()
              showToast('Team task scheduled', 'success')
            } catch (err) {
              showToast(err.message || 'Could not add team task', 'error')
              return
            }
            setShowAddTask(false)
            const l = displayLeads.find((x) => x.parcelId === parcelId)
            if (l) onOpenScheduleLead?.(l.id)
            return
          }
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
          showToast('Task scheduled', 'success')
        } catch (err) {
          showToast(err.message || 'Could not add task', 'error')
          return
        }
      } else {
        addTask({ pipelineId: null, parcelId: parcelId || null, title, scheduledAt, scheduledEndAt })
        refreshTasks()
        scheduleSync()
        showToast('Task scheduled', 'success')
      }
      setShowAddTask(false)
      const lead = parcelId ? displayLeads.find((l) => l.parcelId === parcelId) : null
      if (lead) onOpenScheduleLead?.(lead.id)
    },
    [getToken, onPipelinesChange, refreshTasks, scheduleSync, displayLeads, pipelines, onOpenScheduleLead]
  )

  const handleCreateTask = ({
    title,
    scheduledAt,
    scheduledEndAt,
    assignedUids = [],
    leadId: addTaskLeadId,
    dealId: addTaskDealId,
  }) => {
    const trimmed = title.trim()
    if (!trimmed) {
      showToast('Enter a task title', 'error')
      return
    }
    const endAt = scheduledEndAt && scheduledEndAt > (scheduledAt || 0) ? scheduledEndAt : null
    if (assignedUids.length === 0 && endAt && scheduledAt && endAt <= scheduledAt) {
      showToast('End time must be after start time', 'error')
      return
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
    }

    if (assignedUids.length > 0) {
      if (!getToken) {
        showToast('Sign in to assign tasks to teammates', 'error')
        return
      }
      finalizeTaskCreate({ ...payload, pipelineId: ctx.pipelineId })
      return
    }

    if (dealId && apiMode && ctx.pipelineId) {
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
          setPipePickerState({
            open: true,
            eligiblePipelines: owning,
            allowNoPipe: false,
            payload
          })
          return
        }
      }
      finalizeTaskCreate({ ...payload, pipelineId: null })
      return
    }

    finalizeTaskCreate({ ...payload, pipelineId: null })
  }

  const days = getDaysInMonth(viewYear, viewMonth)
  const paddedDays = useMemo(() => {
    const arr = [...days]
    while (arr.length < 42) arr.push(null)
    return arr.slice(0, 42)
  }, [days])

  const lastRowHasValidDays = useMemo(
    () => paddedDays.slice(35, 42).some((d) => d !== null),
    [paddedDays]
  )

  const effectiveWeekStart = useMemo(() => {
    if (viewMode === 'week') {
      if (weekStart) return weekStart
      return getSundayOfWeek(new Date(viewYear, viewMonth, 1))
    }
    return null
  }, [viewMode, weekStart, viewYear, viewMonth])

  const weekDays = viewMode === 'week' && effectiveWeekStart ? getWeekDays(effectiveWeekStart) : []
  const weekLabel = viewMode === 'week' && weekDays.length
    ? `${weekDays[0].toLocaleDateString('en-US', { month: 'short' })} ${weekDays[0].getDate()} – ${weekDays[6].toLocaleDateString('en-US', { month: 'short' })} ${weekDays[6].getDate()}, ${weekDays[0].getFullYear()}`
    : ''

  const dayLabel = viewMode === 'day' && dayViewDate
    ? dayViewDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : ''

  // Week view: spanning tasks for overlay (dayIndex, topPx, heightPx)
  const spanningTasks = useMemo(() => {
    if (viewMode !== 'week' || !effectiveWeekStart || weekDays.length === 0) return []
    const sunday = new Date(effectiveWeekStart)
    sunday.setHours(0, 0, 0, 0)
    const ROW_HEIGHT = SCHEDULE_WEEK_HOUR_HEIGHT
    const result = []
    for (const t of allTasks) {
      if (!t.scheduledAt || t.completed) continue
      const start = new Date(t.scheduledAt)
      const endTs = t.scheduledEndAt && t.scheduledEndAt > t.scheduledAt ? t.scheduledEndAt : t.scheduledAt + 60 * 60 * 1000
      const end = new Date(endTs)
      const taskDate = new Date(start.getFullYear(), start.getMonth(), start.getDate())
      const diff = Math.round((taskDate - sunday) / (24 * 60 * 60 * 1000))
      if (diff < 0 || diff >= 7) continue
      const startTop = (start.getHours() + start.getMinutes() / 60) * ROW_HEIGHT
      const endBottom = (end.getHours() + end.getMinutes() / 60) * ROW_HEIGHT
      let height = endBottom - startTop
      if (height < ROW_HEIGHT) height = ROW_HEIGHT
      result.push({ task: t, dayIndex: diff, top: startTop, height })
    }
    return result
  }, [allTasks, viewMode, effectiveWeekStart, weekDays.length])

  const daySpanningTasks = useMemo(() => {
    if (viewMode !== 'day' || !dayViewDate) return []
    const ROW_HEIGHT = SCHEDULE_DAY_HOUR_HEIGHT
    const dayStart = new Date(dayViewDate)
    dayStart.setHours(0, 0, 0, 0)
    const result = []
    for (const t of allTasks) {
      if (!t.scheduledAt || t.completed) continue
      const start = new Date(t.scheduledAt)
      const taskDate = new Date(start.getFullYear(), start.getMonth(), start.getDate())
      if (taskDate.getTime() !== dayStart.getTime()) continue
      const endTs = t.scheduledEndAt && t.scheduledEndAt > t.scheduledAt ? t.scheduledEndAt : t.scheduledAt + 60 * 60 * 1000
      const end = new Date(endTs)
      const startTop = (start.getHours() + start.getMinutes() / 60) * ROW_HEIGHT
      const endBottom = (end.getHours() + end.getMinutes() / 60) * ROW_HEIGHT
      let height = endBottom - startTop
      if (height < ROW_HEIGHT) height = ROW_HEIGHT
      result.push({ task: t, top: startTop, height })
    }
    return result
  }, [allTasks, viewMode, dayViewDate])

  const prevPeriod = () => {
    if (viewMode === 'day' && dayViewDate) {
      const prev = new Date(dayViewDate)
      prev.setDate(prev.getDate() - 1)
      setDayViewDate(prev)
      setViewYear(prev.getFullYear())
      setViewMonth(prev.getMonth())
      return
    }
    if (viewMode === 'week' && effectiveWeekStart) {
      const prev = new Date(effectiveWeekStart)
      prev.setDate(prev.getDate() - 7)
      setWeekStart(prev)
      setViewYear(prev.getFullYear())
      setViewMonth(prev.getMonth())
    } else {
      if (viewMonth === 0) {
        setViewMonth(11)
        setViewYear((y) => y - 1)
      } else setViewMonth((m) => m - 1)
    }
  }
  const nextPeriod = () => {
    if (viewMode === 'day' && dayViewDate) {
      const next = new Date(dayViewDate)
      next.setDate(next.getDate() + 1)
      setDayViewDate(next)
      setViewYear(next.getFullYear())
      setViewMonth(next.getMonth())
      return
    }
    if (viewMode === 'week' && effectiveWeekStart) {
      const next = new Date(effectiveWeekStart)
      next.setDate(next.getDate() + 7)
      setWeekStart(next)
      setViewYear(next.getFullYear())
      setViewMonth(next.getMonth())
    } else {
      if (viewMonth === 11) {
        setViewMonth(0)
        setViewYear((y) => y + 1)
      } else setViewMonth((m) => m + 1)
    }
  }

  const handlePanelBack = () => {
    setShowAddTask(false)
    setEditTaskContext(null)
    if (hasScheduleOpener) {
      onClose?.()
      return
    }
    onBack?.() ?? onClose?.()
  }

  const switchViewMode = (mode) => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
    if (mode === 'week') {
      setWeekStart(getSundayOfWeek(today))
    } else if (mode === 'day') {
      setDayViewDate(today)
    }
    setViewMode(mode)
  }

  const listOpenOpts = { showingDetail: obscuredByLeadDetail, retainOpen: retainDuringSwap, swappingOut: retainDuringSwap }
  const listDialogOpen = mapListDialogOpen(isOpen, listOpenOpts)
  const listObscuredByDetail = listPanelObscuredByDetail(isOpen, obscuredByLeadDetail, listOpenOpts)

  return (
    <>
    <Dialog open={listDialogOpen} modal={false} onOpenChange={ignoreRadixMapPanelDismiss}>
      <DialogContent
        className={cn(
          'map-panel deal-pipeline-panel schedule-panel fullscreen-panel flex min-h-0 flex-col overflow-hidden',
          listObscuredByDetail && 'crm-list-under-detail',
        )}
        panelDockSlot={panelDockSlot}
        showCloseButton={false}
        hideOverlay
        suppressBackdrop
        topLayer={stacked}
      >
        <DialogHeader className={cn(PANEL_LIST_HEADER_CLASS, 'flex-shrink-0 pb-4')} style={PANEL_LIST_HEADER_STYLE}>
          <DialogDescription className="sr-only">View and manage scheduled tasks</DialogDescription>
          <PanelHeader onBack={handlePanelBack} title="Schedule">
            {isTeamAdmin && (
              <button
                type="button"
                className={`text-[11px] px-2 py-1 rounded-md border ${adminTeamView ? 'border-blue-400/50 bg-blue-500/15 text-blue-200' : 'border-white/15 text-white/60'}`}
                onClick={() => setAdminTeamView((v) => !v)}
              >
                {adminTeamView ? 'All team' : 'My schedule'}
              </button>
            )}
          </PanelHeader>
        </DialogHeader>
        <div
          className={cn(
            'flex-1 min-h-0 flex flex-col deal-pipeline-content schedule-panel-content overflow-hidden pt-2 px-4 max-md:px-0 max-md:pb-0 pb-4',
            viewMode === 'month' && 'schedule-panel-content--month-edge',
            calendarReady && 'panel-data-fade-in schedule-panel-content--settled',
          )}
        >
          <div className="flex justify-center mb-3 flex-shrink-0 max-md:px-4">
            <div className="schedule-view-seg" role="tablist">
              {[
                { id: 'month', label: 'Month' },
                { id: 'week', label: 'Week' },
                { id: 'day', label: 'Day' },
              ].map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  aria-selected={viewMode === v.id}
                  className={viewMode === v.id ? 'schedule-view-seg-active' : ''}
                  onClick={() => switchViewMode(v.id)}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          {/* Navigation — keep side inset on mobile when month grid is full-bleed */}
          <div
            className="flex items-center justify-between mb-3 flex-shrink-0 gap-2 max-md:px-4"
          >
            <button type="button" className="schedule-nav-btn" onClick={prevPeriod} title="Previous">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base font-bold text-white/95 text-center truncate">
                {viewMode === 'week'
                  ? weekLabel
                  : viewMode === 'day'
                    ? dayLabel
                    : `${new Date(viewYear, viewMonth).toLocaleString('default', { month: 'long' })} ${viewYear}`}
              </span>
              <button
                type="button"
                className="schedule-today-btn"
                onClick={() => {
                  const now = new Date()
                  setViewYear(now.getFullYear())
                  setViewMonth(now.getMonth())
                  setWeekStart(getSundayOfWeek(now))
                  setDayViewDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()))
                }}
              >
                Today
              </button>
            </div>
            <button type="button" className="schedule-nav-btn" onClick={nextPeriod} title="Next">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {/* Calendar - fills remaining space; month view full width on mobile */}
          <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/12 bg-white/[0.03] max-md:rounded-none max-md:border-x-0 max-md:border-b-0"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}
          >
            {tasksLoading && allTasks.length === 0 ? (
              <TaskListLoading className="flex-1 min-h-[12rem] items-center" />
            ) : viewMode === 'month' ? (
              <div className="schedule-calendar-month-grid grid grid-cols-7 grid-rows-[auto_repeat(6,minmax(0,1fr))] flex-1 min-h-0 min-w-0">
                {DAYS.map((d) => (
                  <div key={d} className="schedule-calendar-weekday-header text-center text-[11px] font-semibold text-white/50 py-2 uppercase tracking-wider">
                    {d}
                  </div>
                ))}
                {paddedDays.map((d, i) => {
                  if (!d) {
                    return <div key={`pad-${i}`} className="schedule-calendar-pad-cell min-h-0" />
                  }
                  const rowIndex = Math.floor(i / 7)
                  const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
                  const dayTasks = tasksByDay[key] || []
                  const isToday = d.toDateString() === new Date().toDateString()
                  const prevIsPad = i > 0 && paddedDays[i - 1] === null
                  const firstColumn = i % 7 === 0
                  const edgeLeft = firstColumn || prevIsPad
                  const above = i >= 7 ? paddedDays[i - 7] : null
                  const edgeTop = i >= 7 && above === null
                  const noBottomBorder = rowIndex === 5 && lastRowHasValidDays
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleDayClick(d)}
                      className={`schedule-calendar-day-cell min-h-0 w-full h-full p-1.5 text-left flex flex-col overflow-hidden ${
                        edgeLeft ? 'schedule-calendar-day-cell--edge-left' : ''
                      } ${edgeTop ? 'schedule-calendar-day-cell--edge-top' : ''} ${
                        noBottomBorder ? 'schedule-calendar-day-cell--no-bottom' : ''
                      } ${isToday ? 'schedule-day-today' : ''}`}
                    >
                      {isToday ? (
                        <span className="schedule-today-circle shrink-0">{d.getDate()}</span>
                      ) : (
                        <span className="text-sm font-semibold shrink-0 text-white/95 w-6 h-6 flex items-center justify-center">{d.getDate()}</span>
                      )}
                      <div className="mt-0.5 min-h-0 shrink overflow-hidden space-y-0.5">
                        {dayTasks.slice(0, 5).map((task) => {
                          const lead = task.leadId
                            ? displayLeads.find((l) => l.id === task.leadId)
                            : task.parcelId
                              ? displayLeads.find((l) => l.parcelId === task.parcelId)
                              : null
                          return (
                            <ScheduleTaskItem
                              key={task.id}
                              task={task}
                              displayLeads={displayLeads}
                              allDeals={allDeals}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (lead) onOpenScheduleLead?.(lead.id)
                              }}
                            />
                          )
                        })}
                        {dayTasks.length > 5 && (
                          <div className="text-[10px] text-white/40 px-1">+{dayTasks.length - 5} more</div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : viewMode === 'week' ? (
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <div
                  className="grid border-b border-white/12 flex-shrink-0"
                  style={{ gridTemplateColumns: '48px repeat(7, minmax(0, 1fr))' }}
                >
                  <div className="w-12 shrink-0" aria-hidden />
                  {weekDays.map((d, dayIdx) => {
                    const isToday = d.toDateString() === new Date().toDateString()
                    return (
                      <div
                        key={dayIdx}
                        className={`flex flex-col items-center justify-center py-1.5 ${
                          isToday ? 'schedule-col-header-today' : ''
                        }`}
                        style={{ borderBottom: isToday ? '2px solid rgba(59,130,246,0.5)' : undefined }}
                      >
                        <span className="text-[10px] font-semibold text-white/45 uppercase tracking-wider">{DAY_INITIALS[dayIdx]}</span>
                        {isToday ? (
                          <span className="schedule-today-circle text-xs" style={{ width: 22, height: 22, fontSize: 11 }}>{d.getDate()}</span>
                        ) : (
                          <span className="text-sm font-semibold text-white/80">{d.getDate()}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide">
                  <div className="relative" style={{ minHeight: 24 * 36 }}>
                    <div
                      className="schedule-week-grid-inner grid"
                      style={{
                        gridTemplateColumns: '48px repeat(7, minmax(0, 1fr))',
                        gridAutoRows: 'minmax(36px, auto)',
                        minHeight: 24 * 36
                      }}
                    >
                      {HOURS.flatMap((hour) => [
                        <div
                          key={`${hour}-label`}
                          className="schedule-week-time-label py-0.5 pr-2 text-right flex items-start justify-end"
                          style={{ paddingTop: 2 }}
                        >
                          {formatHour(hour)}
                        </div>,
                        ...weekDays.map((d, dayIdx) => {
                          const isToday = d.toDateString() === new Date().toDateString()
                          return (
                            <button
                              key={`${hour}-${dayIdx}`}
                              type="button"
                              onClick={() => handleHourCellClick(d, hour)}
                              className={`schedule-week-grid-cell min-h-[36px] p-0.5 text-left ${
                                isToday ? 'bg-white/[0.03]' : ''
                              }`}
                            />
                          )
                        })
                      ])}
                    </div>
                    <NowIndicator viewMode="week" weekStart={effectiveWeekStart} dayViewDate={null} />
                    <div className="absolute top-0 left-0 right-0 pointer-events-none" style={{ height: 24 * 36 }}>
                      {spanningTasks.map(({ task, dayIndex, top, height }) => {
                        const lead = task.leadId
                          ? displayLeads.find((l) => l.id === task.leadId)
                          : task.parcelId
                            ? displayLeads.find((l) => l.parcelId === task.parcelId)
                            : null
                        return (
                          <ScheduleTaskItem
                            key={task.id}
                            task={task}
                            displayLeads={displayLeads}
                            allDeals={allDeals}
                            variant="block"
                            className="absolute pointer-events-auto"
                            style={{
                              left: `calc(48px + ${dayIndex} * (100% - 48px) / 7 + 2px)`,
                              width: `calc((100% - 48px) / 7 - 6px)`,
                              top: top + 1,
                              height: Math.max(24, height - 3),
                              minHeight: 24,
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (lead) onOpenScheduleLead?.(lead.id)
                            }}
                          />
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="schedule-day-view flex-1 min-h-0 flex flex-col overflow-hidden">
                <div
                  className="grid border-b border-white/12 flex-shrink-0"
                  style={{ gridTemplateColumns: '48px minmax(0, 1fr)' }}
                >
                  <div className="w-12 shrink-0" aria-hidden />
                  {dayViewDate && (() => {
                    const isDayToday = dayViewDate.toDateString() === new Date().toDateString()
                    return (
                      <div
                        className={`flex flex-col items-center justify-center py-1.5 ${isDayToday ? 'schedule-col-header-today' : ''}`}
                        style={{ borderBottom: isDayToday ? '2px solid rgba(59,130,246,0.5)' : undefined }}
                      >
                        <span className="text-[10px] font-semibold text-white/45 uppercase tracking-wider">
                          {dayViewDate.toLocaleDateString(undefined, { weekday: 'short' })}
                        </span>
                        {isDayToday ? (
                          <span className="schedule-today-circle text-xs" style={{ width: 22, height: 22, fontSize: 11 }}>{dayViewDate.getDate()}</span>
                        ) : (
                          <span className="text-sm font-semibold text-white/80">{dayViewDate.getDate()}</span>
                        )}
                      </div>
                    )
                  })()}
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide">
                  <div className="relative" style={{ minHeight: 24 * SCHEDULE_DAY_HOUR_HEIGHT }}>
                    <div
                      className="schedule-day-grid-inner grid"
                      style={{
                        gridTemplateColumns: '48px minmax(0, 1fr)',
                        gridAutoRows: `minmax(${SCHEDULE_DAY_HOUR_HEIGHT}px, auto)`,
                        minHeight: 24 * SCHEDULE_DAY_HOUR_HEIGHT,
                      }}
                    >
                      {HOURS.flatMap((hour) => [
                        <div
                          key={`day-${hour}-label`}
                          className="schedule-week-time-label py-0.5 pr-2 text-right flex items-start justify-end"
                          style={{ paddingTop: 4 }}
                        >
                          {formatHour(hour)}
                        </div>,
                        <button
                          key={`day-${hour}-cell`}
                          type="button"
                          onClick={() => dayViewDate && handleHourCellClick(dayViewDate, hour)}
                          className={`schedule-week-grid-cell p-0.5 text-left ${
                            dayViewDate?.toDateString() === new Date().toDateString() ? 'bg-white/[0.03]' : ''
                          }`}
                          style={{ minHeight: SCHEDULE_DAY_HOUR_HEIGHT }}
                        />
                      ])}
                    </div>
                    <NowIndicator
                      viewMode="day"
                      weekStart={null}
                      dayViewDate={dayViewDate}
                      hourHeight={SCHEDULE_DAY_HOUR_HEIGHT}
                    />
                    <div
                      className="absolute top-0 left-0 right-0 pointer-events-none"
                      style={{ height: 24 * SCHEDULE_DAY_HOUR_HEIGHT }}
                    >
                      {daySpanningTasks.map(({ task, top, height }) => {
                        const lead = task.leadId
                          ? displayLeads.find((l) => l.id === task.leadId)
                          : task.parcelId
                            ? displayLeads.find((l) => l.parcelId === task.parcelId)
                            : null
                        return (
                          <ScheduleTaskItem
                            key={task.id}
                            task={task}
                            displayLeads={displayLeads}
                            allDeals={allDeals}
                            variant="block"
                            className="absolute pointer-events-auto"
                            style={{
                              left: 'calc(48px + 4px)',
                              width: 'calc(100% - 48px - 12px)',
                              top: top + 2,
                              height: Math.max(SCHEDULE_DAY_MIN_TASK_HEIGHT, height - 4),
                              minHeight: SCHEDULE_DAY_MIN_TASK_HEIGHT,
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (lead) onOpenScheduleLead?.(lead.id)
                            }}
                          />
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>

        {/* Add Task Dialog */}
        <NewTaskDialog
          open={showAddTask}
          onOpenChange={(open) => {
            setShowAddTask(open)
            if (!open) setAddTaskPrefill(null)
          }}
          leads={displayLeads}
          deals={allDeals}
          showDealPicker={apiMode}
          showTeamAssign={newTaskMemberList.length > 0}
          teamMembers={newTaskMemberList}
          initialScheduledAt={addTaskPrefill?.scheduledAt ?? null}
          initialScheduledEndAt={addTaskPrefill?.scheduledEndAt ?? null}
          initialDateTimeExpanded={addTaskPrefill?.dateTimeExpanded ?? false}
          headerSubtitle={addTaskPrefill?.headerSubtitle ?? null}
          onSubmit={handleCreateTask}
          onCreateLead={onCreateLead}
          nestedOverlay
        />

        <EditLeadTaskDialog
          open={!!editTaskContext}
          onOpenChange={(o) => { if (!o) setEditTaskContext(null) }}
          context={editTaskContext}
          pipelines={pipelines}
          teams={teams}
          displayLeads={displayLeads}
          deals={allDeals}
          getToken={getToken}
          onPipelinesChange={onPipelinesChange}
          scheduleSync={scheduleSync}
          onSaved={() => {
            refreshTasks()
          }}
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
