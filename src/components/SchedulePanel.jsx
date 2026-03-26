import { useState, useEffect, useCallback, useMemo } from 'react'
import { X, ChevronLeft, ChevronRight, Calendar, CalendarDays, Clock } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Input } from './ui/input'
import { loadLeads, getStreetAddress, getFullAddress } from '@/utils/dealPipeline'
import { getAllTasks, addTask } from '@/utils/leadTasks'
import { useUserDataSync } from '@/contexts/UserDataSyncContext'
import { showToast } from './ui/toast'
import { LeadDetails } from './LeadDetails'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const HOURS = Array.from({ length: 24 }, (_, i) => i) // 0-23 (12 AM - 11 PM)

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

function getLeadLabel(lead, parcelId) {
  if (!parcelId) return 'Standalone'
  return getStreetAddress(lead) || lead?.address || lead?.owner || parcelId
}

function getTaskCalendarSubtitle(task, pipelines, displayLeads) {
  if (task.pipelineId == null && task.parcelId == null) return 'Standalone'
  const bits = []
  const pipe = pipelines.find((p) => p.id === task.pipelineId)
  if (pipe?.title) bits.push(pipe.title)
  if (task.parcelId) {
    const lead = displayLeads.find((l) => l.parcelId === task.parcelId)
    bits.push(getLeadLabel(lead, task.parcelId))
  } else if (task.pipelineId) {
    bits.push('Pipeline task')
  }
  return bits.join(' · ') || 'Task'
}

const MINUTE_OPTS = [0, 15, 30, 45]
const HOUR_OPTS_12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

function tsToHourMin(ts) {
  if (!ts) return { hour12: 12, minute: 0, isPM: false }
  const d = new Date(ts)
  const h24 = d.getHours()
  const m = d.getMinutes()
  const hour12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24
  const isPM = h24 >= 12
  const minute = MINUTE_OPTS.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a))
  return { hour12, minute, isPM }
}

function hourMinToTs(date, hour12, minute, isPM) {
  let h24 = hour12
  if (isPM && hour12 !== 12) h24 = hour12 + 12
  else if (!isPM && hour12 === 12) h24 = 0
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h24, minute).getTime()
}

function InlineTimeSelect({ ts, date, onChange }) {
  const { hour12, minute, isPM } = tsToHourMin(ts)
  const update = (h, m, pm) => {
    onChange(hourMinToTs(date, h ?? hour12, m ?? minute, pm ?? isPM))
  }
  return (
    <div className="flex items-center gap-2">
      <select
        value={hour12}
        onChange={(e) => update(parseInt(e.target.value, 10), null, null)}
        className="bg-white/10 border border-white/20 rounded px-2 py-1.5 text-sm text-white"
      >
        {HOUR_OPTS_12.map((h) => (
          <option key={h} value={h} className="bg-gray-900 text-white">
            {h}
          </option>
        ))}
      </select>
      <span className="text-white/60">:</span>
      <select
        value={minute}
        onChange={(e) => update(null, parseInt(e.target.value, 10), null)}
        className="bg-white/10 border border-white/20 rounded px-2 py-1.5 text-sm text-white"
      >
        {MINUTE_OPTS.map((m) => (
          <option key={m} value={m} className="bg-gray-900 text-white">
            {String(m).padStart(2, '0')}
          </option>
        ))}
      </select>
      <div
        className="schedule-time-meridiem-group flex rounded-md overflow-hidden border border-white/25 bg-white/[0.06]"
        role="group"
        aria-label="AM or PM"
      >
        <button
          type="button"
          onClick={() => update(null, null, false)}
          aria-pressed={!isPM}
          className={`schedule-time-meridiem min-w-[2.75rem] px-2.5 py-1.5 text-xs font-semibold transition-colors ${
            !isPM ? 'schedule-time-meridiem--selected' : 'schedule-time-meridiem--unselected'
          }`}
        >
          AM
        </button>
        <button
          type="button"
          onClick={() => update(null, null, true)}
          aria-pressed={isPM}
          className={`schedule-time-meridiem min-w-[2.75rem] px-2.5 py-1.5 text-xs font-semibold transition-colors ${
            isPM ? 'schedule-time-meridiem--selected' : 'schedule-time-meridiem--unselected'
          }`}
        >
          PM
        </button>
      </div>
    </div>
  )
}

export function SchedulePanel({ isOpen, onClose, onOpenParcelDetails, onEmailClick, onPhoneClick, onSkipTraceParcel, skipTracingInProgress, leads = [], pipelines = [], activePipelineId = null, onLeadsChange, initialDate = null, onInitialDateConsumed }) {
  const { scheduleSync } = useUserDataSync()
  const displayLeads = useMemo(() => {
    if (pipelines.length > 0) {
      return pipelines.flatMap((p) => (p.leads || []).map((l) => ({ ...l, __pipelineId: p.id, __pipelineTitle: p.title })))
    }
    return onLeadsChange ? leads : loadLeads()
  }, [pipelines, leads, onLeadsChange])
  const [allTasks, setAllTasks] = useState([])
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth())
  const [viewMode, setViewMode] = useState('month') // 'month' | 'week' | 'day'
  const [weekStart, setWeekStart] = useState(null) // Sunday of displayed week (for week view)
  const [dayViewDate, setDayViewDate] = useState(() => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth(), n.getDate())
  })
  const [selectedLead, setSelectedLead] = useState(null)
  const [showAddTask, setShowAddTask] = useState(false)
  const [addTaskDate, setAddTaskDate] = useState(null)
  const [addTaskLeadId, setAddTaskLeadId] = useState('')
  const [addTaskLeadSearch, setAddTaskLeadSearch] = useState('')
  const [addTaskSuggestionsOpen, setAddTaskSuggestionsOpen] = useState(false)
  const [addTaskHighlightIndex, setAddTaskHighlightIndex] = useState(-1)
  const [addTaskTitle, setAddTaskTitle] = useState('')
  const [addTaskScheduledAt, setAddTaskScheduledAt] = useState(null)
  const [addTaskScheduledEndAt, setAddTaskScheduledEndAt] = useState(null)

  const refreshTasks = useCallback(() => {
    setAllTasks(getAllTasks())
  }, [])

  const selectedLeadPipelineId = useMemo(() => {
    if (!selectedLead) return null
    if (selectedLead.__pipelineId) return selectedLead.__pipelineId
    if (pipelines.length > 0) {
      const p = pipelines.find((pipe) => pipe.leads?.some((l) => l.parcelId === selectedLead.parcelId))
      return p?.id ?? null
    }
    return null
  }, [selectedLead, pipelines])

  useEffect(() => {
    if (isOpen) {
      refreshTasks()
    }
  }, [isOpen, refreshTasks])

  useEffect(() => {
    if (isOpen && initialDate != null) {
      const d = new Date(initialDate)
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
      setViewMode('month')
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

  const addTaskLeadSuggestions = (() => {
    const q = (addTaskLeadSearch || '').trim().toLowerCase()
    if (!q) return []
    const tokens = q.split(/\s+/).filter(Boolean)
    const results = []
    for (const lead of displayLeads) {
      const label = (getLeadLabel(lead, lead.parcelId) || '').toLowerCase()
      const fullAddr = (getFullAddress(lead) || '').toLowerCase()
      const owner = (lead.owner || '').toLowerCase()
      const address = (lead.address || '').toLowerCase()
      const searchable = [label, fullAddr, owner, address].filter(Boolean).join(' ')
      if (!tokens.every((tok) => searchable.includes(tok))) continue
      results.push({ lead, displayValue: getLeadLabel(lead, lead.parcelId) || lead.address || lead.parcelId })
    }
    return results
  })()

  const handleDayClick = (d) => {
    if (!d) return
    const dayAt9am = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0).getTime()
    const now = Date.now()
    const finalAt = dayAt9am >= now ? dayAt9am : now
    const endAt = finalAt + 60 * 60 * 1000
    setAddTaskDate(d)
    setAddTaskScheduledAt(finalAt)
    setAddTaskScheduledEndAt(endAt)
    setAddTaskLeadId('')
    setAddTaskLeadSearch('')
    setAddTaskTitle('')
    setShowAddTask(true)
  }

  const handleHourCellClick = (dayDate, hour) => {
    const scheduledAt = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), hour, 0).getTime()
    const now = Date.now()
    const finalAt = scheduledAt >= now ? scheduledAt : now
    const endAt = finalAt + 60 * 60 * 1000 // +1 hour default
    setAddTaskDate(dayDate)
    setAddTaskScheduledAt(finalAt)
    setAddTaskScheduledEndAt(endAt)
    setAddTaskLeadId('')
    setAddTaskLeadSearch('')
    setAddTaskTitle('')
    setShowAddTask(true)
  }

  const formatHour = (h) => {
    if (h === 0) return '12 AM'
    if (h === 12) return '12 PM'
    return h < 12 ? `${h} AM` : `${h - 12} PM`
  }

  const handleCreateTask = () => {
    const t = addTaskTitle.trim() || 'Task'
    const endAt = addTaskScheduledEndAt && addTaskScheduledEndAt > (addTaskScheduledAt || 0) ? addTaskScheduledEndAt : null
    if (endAt && addTaskScheduledAt && endAt <= addTaskScheduledAt) {
      showToast('End time must be after start time', 'error')
      return
    }
    let pipelineId = null
    let parcelId = addTaskLeadId ? String(addTaskLeadId) : null
    if (parcelId) {
      const lead = displayLeads.find((l) => l.parcelId === parcelId)
      pipelineId = lead?.__pipelineId ?? activePipelineId ?? null
    }
    addTask({ pipelineId, parcelId, title: t, scheduledAt: addTaskScheduledAt, scheduledEndAt: endAt })
    refreshTasks()
    scheduleSync()
    showToast('Task scheduled', 'success')
    setShowAddTask(false)
    const lead = parcelId ? displayLeads.find((l) => l.parcelId === parcelId) : null
    if (lead) setSelectedLead(lead)
  }

  const leadToParcelData = (lead) => {
    if (!lead) return null
    return {
      id: lead.parcelId,
      address: lead.address || getFullAddress(lead),
      properties: lead.properties || { OWNER_NAME: lead.owner, SITUS_ADDR: lead.address },
      lat: lead.lat,
      lng: lead.lng
    }
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
    const ROW_HEIGHT = 36
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
    const ROW_HEIGHT = 36
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

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) { setShowAddTask(false); onClose?.() } }}>
      <DialogContent
        className="map-panel deal-pipeline-panel schedule-panel fullscreen-panel flex flex-col"
        showCloseButton={false}
        hideOverlay
      >
        <DialogHeader className="deal-pipeline-header px-4 pt-4 pb-3 border-b flex-shrink-0" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}>
          <DialogDescription className="sr-only">View and manage scheduled tasks</DialogDescription>
          {/* 1fr / auto / 1fr: view toggle stays horizontally centered on the panel */}
          <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <DialogTitle className="min-w-0 truncate text-left text-xl font-semibold">Schedule</DialogTitle>
            <button
              type="button"
              onClick={() => {
                if (viewMode === 'month') {
                  setViewMode('week')
                  setWeekStart(getSundayOfWeek(new Date(viewYear, viewMonth, 1)))
                } else if (viewMode === 'week') {
                  setViewMode('day')
                  const base = effectiveWeekStart || new Date(viewYear, viewMonth, 1)
                  setDayViewDate(new Date(base.getFullYear(), base.getMonth(), base.getDate()))
                } else {
                  setViewMode('month')
                }
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-black/30 px-3 py-1.5 text-sm font-medium text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] transition-colors hover:bg-black/40"
              aria-label={
                viewMode === 'month'
                  ? 'Switch to week view'
                  : viewMode === 'week'
                    ? 'Switch to day view'
                    : 'Switch to month view'
              }
              title={
                viewMode === 'month'
                  ? 'Week view'
                  : viewMode === 'week'
                    ? 'Day view'
                    : 'Month view'
              }
            >
              {viewMode === 'month' ? (
                <>
                  <CalendarDays className="w-4 h-4" aria-hidden />
                  Month
                </>
              ) : viewMode === 'week' ? (
                <>
                  <Calendar className="w-4 h-4" aria-hidden />
                  Week
                </>
              ) : (
                <>
                  <Clock className="w-4 h-4" aria-hidden />
                  Day
                </>
              )}
            </button>
            <div className="flex justify-end">
              <Button variant="ghost" size="icon" className="pipeline-icon-btn shrink-0" onClick={onClose} title="Close">
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </DialogHeader>
        <div className="flex-1 min-h-0 flex flex-col deal-pipeline-content schedule-panel-content p-4 overflow-hidden">
          {/* Navigation */}
          <div className="flex items-center justify-between mb-3 flex-shrink-0">
            <button
              type="button"
              className="pipeline-icon-btn p-2 rounded-lg hover:bg-white/10"
              onClick={prevPeriod}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="text-lg font-semibold text-center px-1">
              {viewMode === 'week'
                ? weekLabel
                : viewMode === 'day'
                  ? dayLabel
                  : `${new Date(viewYear, viewMonth).toLocaleString('default', { month: 'long' })} ${viewYear}`}
            </span>
            <button
              type="button"
              className="pipeline-icon-btn p-2 rounded-lg hover:bg-white/10"
              onClick={nextPeriod}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          {/* Calendar - fills remaining space */}
          <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-white/20 bg-white/5 overflow-hidden">
            {viewMode === 'month' ? (
              <div className="schedule-calendar-month-grid grid grid-cols-7 grid-rows-[auto_repeat(6,minmax(0,1fr))] flex-1 min-h-0 min-w-0">
                {DAYS.map((d) => (
                  <div key={d} className="schedule-calendar-weekday-header text-center text-xs font-medium text-white/70 py-2">
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
                      className={`schedule-calendar-day-cell min-h-0 w-full h-full p-2 text-left hover:bg-white/10 flex flex-col overflow-hidden ${
                        edgeLeft ? 'schedule-calendar-day-cell--edge-left' : ''
                      } ${edgeTop ? 'schedule-calendar-day-cell--edge-top' : ''} ${
                        noBottomBorder ? 'schedule-calendar-day-cell--no-bottom' : ''
                      } ${isToday ? 'bg-white/10' : ''}`}
                    >
                      <span className={`text-sm font-medium shrink-0 ${isToday ? 'text-white' : 'text-white/90'}`}>
                        {d.getDate()}
                      </span>
                      <div className="mt-1 min-h-0 shrink overflow-hidden space-y-0.5">
                        {dayTasks.slice(0, 5).map((task) => {
                          const lead = task.parcelId ? displayLeads.find((l) => l.parcelId === task.parcelId) : null
                          return (
                            <div
                              key={task.id}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (lead) setSelectedLead(lead)
                              }}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-white/15 truncate cursor-pointer hover:bg-white/25"
                              title={`${task.title || 'Task'} – ${getTaskCalendarSubtitle(task, pipelines, displayLeads)}`}
                            >
                              {task.title || 'Task'}
                            </div>
                          )
                        })}
                        {dayTasks.length > 5 && (
                          <div className="text-[10px] text-white/60 px-1">+{dayTasks.length - 5} more</div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : viewMode === 'week' ? (
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {/* Day headers - same columns as hourly grid */}
                <div
                  className="grid border-b border-white/25 flex-shrink-0 bg-white/5"
                  style={{ gridTemplateColumns: '48px repeat(7, minmax(0, 1fr))' }}
                >
                  <div className="w-12 shrink-0" aria-hidden />
                  {weekDays.map((d, dayIdx) => {
                    const isToday = d.toDateString() === new Date().toDateString()
                    return (
                      <div
                        key={dayIdx}
                        className={`flex flex-col items-center justify-center py-1.5 ${
                          isToday ? 'bg-white/10' : ''
                        }`}
                      >
                        <span className="text-[10px] font-medium text-white/70">{DAY_INITIALS[dayIdx]}</span>
                        <span className={`text-sm font-semibold ${isToday ? 'text-white' : 'text-white/90'}`}>
                          {d.getDate()}
                        </span>
                      </div>
                    )
                  })}
                </div>
                {/* Hourly grid - scrollable, with spanning task overlay */}
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
                          className="schedule-week-time-label py-0.5 pr-1 text-[10px] text-white/60 text-right"
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
                              className={`schedule-week-grid-cell min-h-[36px] p-0.5 text-left hover:bg-white/10 ${
                                isToday ? 'bg-white/5' : ''
                              }`}
                            />
                          )
                        })
                      ])}
                    </div>
                    {/* Spanning task blocks overlay - scrolls with grid */}
                    <div className="absolute top-0 left-0 right-0 pointer-events-none" style={{ height: 24 * 36 }}>
                      {spanningTasks.map(({ task, dayIndex, top, height }) => {
                        const lead = task.parcelId ? displayLeads.find((l) => l.parcelId === task.parcelId) : null
                        return (
                          <div
                            key={task.id}
                            className="absolute left-0 top-0 mx-0.5 rounded pointer-events-auto cursor-pointer bg-white/20 hover:bg-white/30 border border-white/20 overflow-hidden"
                            style={{
                              left: `calc(48px + ${dayIndex} * (100% - 48px) / 7)`,
                              width: `calc((100% - 48px) / 7 - 4px)`,
                              top,
                              height: Math.max(20, height - 2),
                              minHeight: 20
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (lead) setSelectedLead(lead)
                            }}
                            title={`${task.title || 'Task'} – ${getTaskCalendarSubtitle(task, pipelines, displayLeads)}`}
                          >
                            <div className="text-[10px] px-1.5 py-0.5 truncate leading-tight">
                              {task.title || 'Task'}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <div
                  className="grid border-b border-white/25 flex-shrink-0 bg-white/5"
                  style={{ gridTemplateColumns: '48px minmax(0, 1fr)' }}
                >
                  <div className="w-12 shrink-0" aria-hidden />
                  {dayViewDate && (
                    <div
                      className={`flex flex-col items-center justify-center py-1.5 ${
                        dayViewDate.toDateString() === new Date().toDateString() ? 'bg-white/10' : ''
                      }`}
                    >
                      <span className="text-[10px] font-medium text-white/70">
                        {dayViewDate.toLocaleDateString(undefined, { weekday: 'short' })}
                      </span>
                      <span className={`text-sm font-semibold ${dayViewDate.toDateString() === new Date().toDateString() ? 'text-white' : 'text-white/90'}`}>
                        {dayViewDate.getDate()}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide">
                  <div className="relative" style={{ minHeight: 24 * 36 }}>
                    <div
                      className="schedule-day-grid-inner grid"
                      style={{
                        gridTemplateColumns: '48px minmax(0, 1fr)',
                        gridAutoRows: 'minmax(36px, auto)',
                        minHeight: 24 * 36
                      }}
                    >
                      {HOURS.flatMap((hour) => [
                        <div
                          key={`day-${hour}-label`}
                          className="schedule-week-time-label py-0.5 pr-1 text-[10px] text-white/60 text-right"
                        >
                          {formatHour(hour)}
                        </div>,
                        <button
                          key={`day-${hour}-cell`}
                          type="button"
                          onClick={() => dayViewDate && handleHourCellClick(dayViewDate, hour)}
                          className={`schedule-week-grid-cell min-h-[36px] p-0.5 text-left hover:bg-white/10 ${
                            dayViewDate?.toDateString() === new Date().toDateString() ? 'bg-white/5' : ''
                          }`}
                        />
                      ])}
                    </div>
                    <div className="absolute top-0 left-0 right-0 pointer-events-none" style={{ height: 24 * 36 }}>
                      {daySpanningTasks.map(({ task, top, height }) => {
                        const lead = task.parcelId ? displayLeads.find((l) => l.parcelId === task.parcelId) : null
                        return (
                          <div
                            key={task.id}
                            className="absolute left-0 top-0 mx-0.5 rounded pointer-events-auto cursor-pointer bg-white/20 hover:bg-white/30 border border-white/20 overflow-hidden"
                            style={{
                              left: 'calc(48px + 4px)',
                              width: 'calc(100% - 48px - 12px)',
                              top,
                              height: Math.max(20, height - 2),
                              minHeight: 20
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (lead) setSelectedLead(lead)
                            }}
                            title={`${task.title || 'Task'} – ${getTaskCalendarSubtitle(task, pipelines, displayLeads)}`}
                          >
                            <div className="text-[10px] px-1.5 py-0.5 truncate leading-tight">
                              {task.title || 'Task'}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Add Task Dialog */}
        <Dialog open={showAddTask} onOpenChange={setShowAddTask}>
          <DialogContent className="map-panel list-panel new-task-panel max-w-md max-h-[80vh] p-0" showCloseButton={false} nestedOverlay>
            <DialogHeader className="px-6 pt-6 pb-2 border-b border-white/20">
              <DialogTitle className="text-xl font-semibold">
                New Task
                {addTaskDate && (
                  <span className="block text-sm font-normal text-white/80 mt-1">
                    {addTaskDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </DialogTitle>
              <DialogDescription className="sr-only">Create a scheduled task; optionally assign to a lead or leave standalone</DialogDescription>
            </DialogHeader>
            <div className="px-6 py-4 overflow-y-auto scrollbar-hide max-h-[calc(80vh-140px)] space-y-3 create-list-form">
              <div>
                <label className="text-xs font-medium block mb-1 opacity-90">Task title</label>
                <Input
                  value={addTaskTitle}
                  onChange={(e) => setAddTaskTitle(e.target.value)}
                  placeholder="e.g. Call back, Roof inspection"
                  className="text-sm"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateTask()}
                />
              </div>
              <div className="relative">
                <label className="text-xs font-medium text-gray-500 block mb-1">Assign to lead (optional)</label>
                <Input
                  value={addTaskLeadSearch}
                  onChange={(e) => {
                    setAddTaskLeadSearch(e.target.value)
                    setAddTaskLeadId('')
                    setAddTaskSuggestionsOpen(e.target.value.trim().length > 0)
                    setAddTaskHighlightIndex(-1)
                  }}
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
                {addTaskSuggestionsOpen && addTaskLeadSearch.trim() && addTaskLeadSuggestions.length > 0 && (
                  <ul className="add-task-lead-dropdown absolute z-50 left-0 right-0 mt-0.5 max-h-40 overflow-y-auto rounded-lg border py-1 text-sm" role="listbox">
                    {addTaskLeadSuggestions.map((item, idx) => (
                      <li
                        key={item.lead.id}
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
              {addTaskDate ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium block mb-1 opacity-90">Start time</label>
                    <InlineTimeSelect
                      ts={addTaskScheduledAt}
                      date={addTaskDate}
                      onChange={(ts) => {
                        setAddTaskScheduledAt(ts)
                        if (addTaskScheduledEndAt && addTaskScheduledEndAt <= ts) {
                          setAddTaskScheduledEndAt(ts + 60 * 60 * 1000)
                        }
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1 opacity-90">End time</label>
                    <InlineTimeSelect
                      ts={addTaskScheduledEndAt}
                      date={addTaskDate}
                      onChange={setAddTaskScheduledEndAt}
                    />
                  </div>
                </div>
              ) : null}
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

        <LeadDetails
          isOpen={!!selectedLead}
          onClose={() => setSelectedLead(null)}
          lead={selectedLead}
          pipelineId={selectedLeadPipelineId}
          parcelData={selectedLead ? leadToParcelData(selectedLead) : null}
          onOpenParcelDetails={onOpenParcelDetails}
          onEmailClick={onEmailClick}
          onPhoneClick={onPhoneClick}
          onSkipTraceParcel={onSkipTraceParcel}
          isSkipTracingInProgress={selectedLead && skipTracingInProgress?.has?.(selectedLead.parcelId)}
          onLeadUpdate={(updated) => {
            setSelectedLead(updated)
            if (onLeadsChange) onLeadsChange(loadLeads())
          }}
          onTasksChange={refreshTasks}
          onViewTaskOnSchedule={(task) => {
            if (task?.scheduledAt) {
              const d = new Date(task.scheduledAt)
              setViewYear(d.getFullYear())
              setViewMonth(d.getMonth())
              setWeekStart(getSundayOfWeek(d))
              setDayViewDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()))
              setViewMode('day')
              setSelectedLead(null)
            }
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
