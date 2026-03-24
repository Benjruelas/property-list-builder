import { useState, useEffect, useCallback, useMemo } from 'react'
import { X, ChevronLeft, ChevronRight, Calendar, CalendarDays } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Input } from './ui/input'
import { loadLeads, getStreetAddress, getFullAddress } from '@/utils/dealPipeline'
import { getAllTasks, addLeadTask, formatTaskScheduledDate } from '@/utils/leadTasks'
import { useUserDataSync } from '@/contexts/UserDataSyncContext'
import { showToast } from './ui/toast'
import { LeadDetails } from './LeadDetails'
import { SchedulePicker } from './SchedulePicker'

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
  if (!parcelId || parcelId === '__unassigned__') return 'Unassigned'
  return getStreetAddress(lead) || lead?.address || lead?.owner || parcelId
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
      <div className="flex rounded overflow-hidden border border-white/20">
        <button
          type="button"
          onClick={() => update(null, null, false)}
          className={`px-2 py-1 text-xs font-medium ${!isPM ? 'bg-white/25 text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}
        >
          AM
        </button>
        <button
          type="button"
          onClick={() => update(null, null, true)}
          className={`px-2 py-1 text-xs font-medium ${isPM ? 'bg-white/25 text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}
        >
          PM
        </button>
      </div>
    </div>
  )
}

export function SchedulePanel({ isOpen, onClose, onOpenParcelDetails, onEmailClick, onPhoneClick, onSkipTraceParcel, skipTracingInProgress, leads = [], onLeadsChange, initialDate = null, onInitialDateConsumed }) {
  const { scheduleSync } = useUserDataSync()
  const displayLeads = onLeadsChange ? leads : loadLeads()
  const [allTasks, setAllTasks] = useState([])
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth())
  const [viewMode, setViewMode] = useState('month') // 'month' | 'week'
  const [weekStart, setWeekStart] = useState(null) // Sunday of displayed week (for week view)
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
  const [addTaskFromHourCell, setAddTaskFromHourCell] = useState(false)

  const refreshTasks = useCallback(() => {
    setAllTasks(getAllTasks())
  }, [])

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
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0).getTime()
    const scheduledAt = dayStart >= todayStart ? dayStart : Date.now()
    setAddTaskDate(d)
    setAddTaskScheduledAt(scheduledAt)
    setAddTaskScheduledEndAt(null)
    setAddTaskFromHourCell(false)
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
    setAddTaskFromHourCell(true)
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
    if (!addTaskLeadId) {
      showToast('Select a lead', 'error')
      return
    }
    const endAt = addTaskScheduledEndAt && addTaskScheduledEndAt > (addTaskScheduledAt || 0) ? addTaskScheduledEndAt : null
    if (endAt && endAt <= addTaskScheduledAt) {
      showToast('End time must be after start time', 'error')
      return
    }
    addLeadTask(addTaskLeadId, t, addTaskScheduledAt, endAt)
    refreshTasks()
    scheduleSync()
    showToast('Task scheduled', 'success')
    setShowAddTask(false)
    const lead = displayLeads.find((l) => l.parcelId === addTaskLeadId)
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

  const prevPeriod = () => {
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
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-xl font-semibold truncate">Schedule</DialogTitle>
            <button
              type="button"
              onClick={() => {
                if (viewMode === 'month') {
                  setViewMode('week')
                  setWeekStart(getSundayOfWeek(new Date(viewYear, viewMonth, 1)))
                } else {
                  setViewMode('month')
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/30 shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] text-sm font-medium text-white hover:bg-black/40 transition-colors shrink-0"
              aria-label={viewMode === 'month' ? 'Switch to week view' : 'Switch to month view'}
              title={viewMode === 'month' ? 'Switch to week view' : 'Switch to month view'}
            >
              {viewMode === 'month' ? (
                <>
                  <CalendarDays className="w-4 h-4" aria-hidden />
                  Month
                </>
              ) : (
                <>
                  <Calendar className="w-4 h-4" aria-hidden />
                  Week
                </>
              )}
            </button>
            <Button variant="ghost" size="icon" className="pipeline-icon-btn shrink-0" onClick={onClose} title="Close">
              <X className="h-5 w-5" />
            </Button>
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
            <span className="text-lg font-semibold">
              {viewMode === 'week' ? weekLabel : `${new Date(viewYear, viewMonth).toLocaleString('default', { month: 'long' })} ${viewYear}`}
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
            {viewMode === 'month' && (
              <div className="grid grid-cols-7 border-b border-white/20 flex-shrink-0">
                {DAYS.map((d) => (
                  <div key={d} className="text-center text-xs font-medium text-white/70 py-2 border-r border-white/10 last:border-r-0">
                    {d}
                  </div>
                ))}
              </div>
            )}
            {viewMode === 'month' ? (
              <div className="grid grid-cols-7 grid-rows-6 flex-1 min-h-0">
                {paddedDays.map((d, i) => {
                  if (!d) {
                    return <div key={`pad-${i}`} className="min-h-0 border-r border-b border-white/10" />
                  }
                  const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
                  const dayTasks = tasksByDay[key] || []
                  const isToday = d.toDateString() === new Date().toDateString()
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleDayClick(d)}
                      className={`min-h-0 p-2 text-left border-r border-b border-white/10 last:border-r-0 hover:bg-white/10 flex flex-col overflow-hidden ${
                        isToday ? 'bg-white/10' : ''
                      }`}
                    >
                      <span className={`text-sm font-medium shrink-0 ${isToday ? 'text-white' : 'text-white/90'}`}>
                        {d.getDate()}
                      </span>
                      <div className="flex-1 min-h-0 mt-1 space-y-0.5 overflow-y-auto overflow-x-hidden">
                        {dayTasks.slice(0, 5).map((task) => {
                          const lead = displayLeads.find((l) => l.parcelId === task.parcelId)
                          return (
                            <div
                              key={task.id}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (lead) setSelectedLead(lead)
                              }}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-white/15 truncate cursor-pointer hover:bg-white/25"
                              title={`${task.title || 'Task'} – ${getLeadLabel(lead, task.parcelId)}`}
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
            ) : (
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {/* Day headers - same columns as hourly grid */}
                <div
                  className="grid border-b border-white/20 flex-shrink-0 bg-white/5"
                  style={{ gridTemplateColumns: '48px repeat(7, minmax(0, 1fr))' }}
                >
                  <div className="border-r border-white/10" />
                  {weekDays.map((d, dayIdx) => {
                    const isToday = d.toDateString() === new Date().toDateString()
                    return (
                      <div
                        key={dayIdx}
                        className={`flex flex-col items-center justify-center py-1.5 border-r border-white/10 last:border-r-0 ${
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
                      className="grid"
                      style={{
                        gridTemplateColumns: '48px repeat(7, minmax(0, 1fr))',
                        gridAutoRows: 'minmax(36px, auto)',
                        minHeight: 24 * 36
                      }}
                    >
                      {HOURS.flatMap((hour) => [
                        <div
                          key={`${hour}-label`}
                          className="py-0.5 pr-1 text-[10px] text-white/60 text-right border-r border-b border-white/10"
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
                              className={`min-h-[36px] p-0.5 text-left border-r border-b border-white/10 last:border-r-0 hover:bg-white/10 ${
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
                        const lead = displayLeads.find((l) => l.parcelId === task.parcelId)
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
                            title={`${task.title || 'Task'} – ${getLeadLabel(lead, task.parcelId)}`}
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
              <DialogDescription className="sr-only">Create a scheduled task for a lead</DialogDescription>
            </DialogHeader>
            <div className="px-6 py-4 overflow-y-auto scrollbar-hide max-h-[calc(80vh-140px)] space-y-3 create-list-form">
              <div className="relative">
                <label className="text-xs font-medium text-gray-500 block mb-1">Assign to lead</label>
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
                  autoFocus
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
              <div>
                <label className="text-xs font-medium block mb-1 opacity-90">Task title</label>
                <Input
                  value={addTaskTitle}
                  onChange={(e) => setAddTaskTitle(e.target.value)}
                  placeholder="e.g. Call back, Roof inspection"
                  className="text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateTask()}
                />
              </div>
              {addTaskFromHourCell && addTaskDate ? (
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
              ) : (
                <SchedulePicker
                  inline
                  value={addTaskScheduledAt}
                  onChange={setAddTaskScheduledAt}
                  endValue={addTaskScheduledEndAt}
                  onEndChange={setAddTaskScheduledEndAt}
                  minDate={Date.now()}
                />
              )}
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" className="create-list-btn flex-1" onClick={handleCreateTask} disabled={!addTaskLeadId}>
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
              setViewMode('month')
              setWeekStart(getSundayOfWeek(d))
              setSelectedLead(null)
            }
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
