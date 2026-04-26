import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { X, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Input } from './ui/input'
import { loadLeads, getStreetAddress, getFullAddress } from '@/utils/dealPipeline'
import { getAllTasks, getPersonalTasks, addTask } from '@/utils/leadTasks'
import { addPipelineTask, flattenPipelineTasks, pipelinesContainingParcel } from '@/utils/pipelineTasks'
import { addTeamTask } from '@/utils/teamTasks'
import { flattenTeamTasks } from '@/utils/teamTaskUtils'
import { ConvertToLeadPipelineDialog } from './ConvertToLeadPipelineDialog'
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
  if (task.__source === 'team') bits.push('Team task')
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

const DROP_STYLE = { background: 'rgba(30, 30, 30, 0.96)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }

function InlineTimeSelect({ ts, date, onChange }) {
  const { hour12, minute, isPM } = tsToHourMin(ts)
  const [openDrop, setOpenDrop] = useState(null) // 'hour' | 'min' | null
  const dropRef = useRef(null)
  const update = (h, m, pm) => {
    onChange(hourMinToTs(date, h ?? hour12, m ?? minute, pm ?? isPM))
  }

  useEffect(() => {
    if (!openDrop) return
    const handle = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setOpenDrop(null)
    }
    document.addEventListener('pointerdown', handle)
    return () => document.removeEventListener('pointerdown', handle)
  }, [openDrop])

  return (
    <div className="flex items-center gap-2">
      <div className="relative" ref={openDrop === 'hour' ? dropRef : undefined}>
        <button
          type="button"
          onClick={() => setOpenDrop(openDrop === 'hour' ? null : 'hour')}
          className="flex items-center gap-1 px-2.5 py-1.5 text-sm rounded bg-white/10 text-white hover:bg-white/15 min-w-[3rem] justify-between"
          style={{ border: '1px solid rgba(255,255,255,0.4)' }}
        >
          {hour12}
          <ChevronDown className={`h-3 w-3 opacity-60 transition-transform ${openDrop === 'hour' ? 'rotate-180' : ''}`} />
        </button>
        {openDrop === 'hour' && (
          <div
            className="absolute left-0 bottom-full mb-1 z-[200] max-h-48 overflow-y-auto scrollbar-hide rounded-lg shadow-xl min-w-[3rem]"
            style={{ ...DROP_STYLE, border: '1px solid rgba(255,255,255,0.4)' }}
          >
            {HOUR_OPTS_12.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => { update(h, null, null); setOpenDrop(null) }}
                className={`block w-full px-2.5 py-2 text-sm text-left hover:bg-white/15 transition-colors ${hour12 === h ? 'bg-white/20 text-white font-medium' : 'text-white/90'}`}
              >
                {h}
              </button>
            ))}
          </div>
        )}
      </div>
      <span className="text-white/60">:</span>
      <div className="relative" ref={openDrop === 'min' ? dropRef : undefined}>
        <button
          type="button"
          onClick={() => setOpenDrop(openDrop === 'min' ? null : 'min')}
          className="flex items-center gap-1 px-2.5 py-1.5 text-sm rounded bg-white/10 text-white hover:bg-white/15 min-w-[3.5rem] justify-between"
          style={{ border: '1px solid rgba(255,255,255,0.4)' }}
        >
          {String(minute).padStart(2, '0')}
          <ChevronDown className={`h-3 w-3 opacity-60 transition-transform ${openDrop === 'min' ? 'rotate-180' : ''}`} />
        </button>
        {openDrop === 'min' && (
          <div
            className="absolute left-0 bottom-full mb-1 z-[200] overflow-y-auto scrollbar-hide rounded-lg shadow-xl min-w-[3.5rem]"
            style={{ ...DROP_STYLE, border: '1px solid rgba(255,255,255,0.4)' }}
          >
            {MINUTE_OPTS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { update(null, m, null); setOpenDrop(null) }}
                className={`block w-full px-2.5 py-2 text-sm text-left hover:bg-white/15 transition-colors ${minute === m ? 'bg-white/20 text-white font-medium' : 'text-white/90'}`}
              >
                {String(m).padStart(2, '0')}
              </button>
            ))}
          </div>
        )}
      </div>
      <div
        className="schedule-time-meridiem-group flex rounded-md overflow-hidden bg-white/[0.06] ml-auto"
        style={{ border: '1px solid rgba(255,255,255,0.4)' }}
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

function NowIndicator({ viewMode, weekStart, dayViewDate }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const ROW_HEIGHT = 36
  const top = (now.getHours() + now.getMinutes() / 60) * ROW_HEIGHT

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

export function SchedulePanel({ isOpen, onClose, onOpenParcelDetails, onEmailClick, onPhoneClick, onSkipTraceParcel, skipTracingInProgress, leads = [], pipelines = [], activePipelineId = null, onLeadsChange, initialDate = null, onInitialDateConsumed, onRequestMoveLead, onRequestRemoveLead, onGoToParcelOnMap, onOpenAddTask, getToken = null, currentUser = null, onPipelinesChange, teams = [] }) {
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
  const [viewMode, setViewMode] = useState('day') // 'month' | 'week' | 'day'
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

  const apiMode = pipelines.length > 0
  const [pipePickerState, setPipePickerState] = useState(null)

  const refreshTasks = useCallback(() => {
    if (apiMode) {
      setAllTasks([
        ...getPersonalTasks(),
        ...flattenPipelineTasks(pipelines),
        ...flattenTeamTasks(pipelines)
      ])
    } else {
      setAllTasks(getAllTasks())
    }
  }, [apiMode, pipelines])

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

  const addTaskLeadSuggestions = (() => {
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
  })()

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
    setAddTaskDate(d)
    setAddTaskScheduledAt(finalAt)
    setAddTaskScheduledEndAt(endAt)
    setAddTaskLeadId('')
    setAddTaskLeadSearch('')
    setAddTaskTitle('')
    setShowAddTask(true)
  }

  const handleHourCellClick = (dayDate, hour) => {
    const finalAt = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), hour, 0).getTime()
    const endAt = finalAt + 60 * 60 * 1000
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

  const finalizeTaskCreate = useCallback(
    async ({ pipelineId, parcelId, title, scheduledAt, scheduledEndAt, assignedUids = [] }) => {
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
                assignedUids
              })
              await onPipelinesChange?.()
              showToast('Team task scheduled', 'success')
            } catch (err) {
              showToast(err.message || 'Could not add team task', 'error')
              return
            }
            setShowAddTask(false)
            const l = displayLeads.find((x) => x.parcelId === parcelId)
            if (l) setSelectedLead(l)
            return
          }
        }
        try {
          await addPipelineTask(getToken, pipelineId, {
            title,
            parcelId: parcelId || null,
            scheduledAt,
            scheduledEndAt
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
      if (lead) setSelectedLead(lead)
    },
    [getToken, onPipelinesChange, refreshTasks, scheduleSync, displayLeads, pipelines]
  )

  const handleCreateTask = () => {
    const t = addTaskTitle.trim() || 'Task'
    const endAt = addTaskScheduledEndAt && addTaskScheduledEndAt > (addTaskScheduledAt || 0) ? addTaskScheduledEndAt : null
    if (endAt && addTaskScheduledAt && endAt <= addTaskScheduledAt) {
      showToast('End time must be after start time', 'error')
      return
    }
    const parcelId = addTaskLeadId ? String(addTaskLeadId) : null
    const payload = { title: t, scheduledAt: addTaskScheduledAt, scheduledEndAt: endAt, parcelId }

    if (parcelId) {
      // Lead suggestion carries __pipelineId when picked from an API pipe
      const lead = displayLeads.find((l) => l.parcelId === parcelId)
      if (lead?.__pipelineId) {
        finalizeTaskCreate({ ...payload, pipelineId: lead.__pipelineId })
        return
      }
      // API mode but __pipelineId missing — look up all pipes containing this parcel
      if (apiMode) {
        const owning = pipelinesContainingParcel(pipelines, parcelId)
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

    // No parcel selected
    if (apiMode && pipelines.length > 0) {
      setPipePickerState({
        open: true,
        eligiblePipelines: pipelines,
        allowNoPipe: true,
        payload
      })
      return
    }
    finalizeTaskCreate({ ...payload, pipelineId: null })
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
        className="map-panel deal-pipeline-panel schedule-panel fullscreen-panel flex min-h-0 flex-col overflow-hidden"
        showCloseButton={false}
        hideOverlay
      >
        <DialogHeader className="deal-pipeline-header px-4 pt-4 pb-3 border-b flex-shrink-0" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))', boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.06)' }}>
          <DialogDescription className="sr-only">View and manage scheduled tasks</DialogDescription>
          <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <DialogTitle className="min-w-0 truncate text-left text-xl font-semibold">Schedule</DialogTitle>
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
                  onClick={() => {
                    // Always snap to today when switching view modes so the
                    // new view opens on the current day.
                    const now = new Date()
                    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
                    setViewYear(today.getFullYear())
                    setViewMonth(today.getMonth())
                    if (v.id === 'week') {
                      setWeekStart(getSundayOfWeek(today))
                    } else if (v.id === 'day') {
                      setDayViewDate(today)
                    }
                    setViewMode(v.id)
                  }}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <Button variant="ghost" size="icon" className="pipeline-icon-btn shrink-0" onClick={onClose} title="Close">
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </DialogHeader>
        <div
          className={`flex-1 min-h-0 flex flex-col deal-pipeline-content schedule-panel-content overflow-hidden pt-4 px-4 max-md:px-0 max-md:pb-0 pb-4 ${
            viewMode === 'month' ? 'schedule-panel-content--month-edge' : ''
          }`}
        >
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
            {viewMode === 'month' ? (
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
                          const lead = task.parcelId ? displayLeads.find((l) => l.parcelId === task.parcelId) : null
                          return (
                            <div
                              key={task.id}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (lead) setSelectedLead(lead)
                              }}
                              className="schedule-task-pill"
                              title={`${task.title || 'Task'} – ${getTaskCalendarSubtitle(task, pipelines, displayLeads)}`}
                            >
                              {task.title || 'Task'}
                            </div>
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
                        const lead = task.parcelId ? displayLeads.find((l) => l.parcelId === task.parcelId) : null
                        return (
                          <div
                            key={task.id}
                            className="schedule-task-block absolute pointer-events-auto"
                            style={{
                              left: `calc(48px + ${dayIndex} * (100% - 48px) / 7 + 2px)`,
                              width: `calc((100% - 48px) / 7 - 6px)`,
                              top: top + 1,
                              height: Math.max(24, height - 3),
                              minHeight: 24
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (lead) setSelectedLead(lead)
                            }}
                            title={`${task.title || 'Task'} – ${getTaskCalendarSubtitle(task, pipelines, displayLeads)}`}
                          >
                            <div className="text-[10px] px-2 py-1 truncate leading-tight font-medium">
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
                          className="schedule-week-time-label py-0.5 pr-2 text-right flex items-start justify-end"
                          style={{ paddingTop: 2 }}
                        >
                          {formatHour(hour)}
                        </div>,
                        <button
                          key={`day-${hour}-cell`}
                          type="button"
                          onClick={() => dayViewDate && handleHourCellClick(dayViewDate, hour)}
                          className={`schedule-week-grid-cell min-h-[36px] p-0.5 text-left ${
                            dayViewDate?.toDateString() === new Date().toDateString() ? 'bg-white/[0.03]' : ''
                          }`}
                        />
                      ])}
                    </div>
                    <NowIndicator viewMode="day" weekStart={null} dayViewDate={dayViewDate} />
                    <div className="absolute top-0 left-0 right-0 pointer-events-none" style={{ height: 24 * 36 }}>
                      {daySpanningTasks.map(({ task, top, height }) => {
                        const lead = task.parcelId ? displayLeads.find((l) => l.parcelId === task.parcelId) : null
                        return (
                          <div
                            key={task.id}
                            className="schedule-task-block absolute pointer-events-auto"
                            style={{
                              left: 'calc(48px + 4px)',
                              width: 'calc(100% - 48px - 12px)',
                              top: top + 1,
                              height: Math.max(24, height - 3),
                              minHeight: 24
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (lead) setSelectedLead(lead)
                            }}
                            title={`${task.title || 'Task'} – ${getTaskCalendarSubtitle(task, pipelines, displayLeads)}`}
                          >
                            <div className="text-[10px] px-2 py-1 truncate leading-tight font-medium">
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
          <DialogContent className="map-panel list-panel new-task-panel w-[min(92vw,22rem)] max-w-sm max-h-[80vh] p-0 rounded-2xl" showCloseButton={false} nestedOverlay>
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
          pipelineTeamShares={selectedLeadPipelineId
            ? (pipelines.find((p) => p.id === selectedLeadPipelineId)?.teamShares || [])
            : []}
          teams={teams}
          parcelData={selectedLead ? leadToParcelData(selectedLead) : null}
          onPipelinesChange={onPipelinesChange}
          onTeamTasksChange={onPipelinesChange}
          getToken={getToken}
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
          pipelines={pipelines}
          pipelineName={pipelines.length > 0 ? (pipelines.find(p => p.id === selectedLeadPipelineId)?.title || 'Pipes') : null}
          onRequestMoveLead={onRequestMoveLead}
          onRequestRemoveLead={onRequestRemoveLead}
          onGoToParcelOnMap={onGoToParcelOnMap}
          onOpenAddTask={onOpenAddTask ? (lead) => {
            if (lead) {
              const pid = selectedLeadPipelineId
              setSelectedLead(null)
              onOpenAddTask(lead, pid)
            }
          } : undefined}
        />

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
      </DialogContent>
    </Dialog>
  )
}
