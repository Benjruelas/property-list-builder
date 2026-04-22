import { useState, useEffect, useCallback, useRef } from 'react'
import { Calendar, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { createPortal } from 'react-dom'

const MINUTE_OPTIONS = [0, 15, 30, 45]
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function roundToNearestMinute(m) {
  return MINUTE_OPTIONS.reduce((prev, curr) => Math.abs(curr - m) < Math.abs(prev - m) ? curr : prev)
}

function getDaysInMonth(year, month) {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const days = []
  const startPad = first.getDay()
  for (let i = 0; i < startPad; i++) days.push(null)
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d))
  return days
}

function formatScheduleRange(startTs, endTs) {
  if (!startTs || !endTs) return ''
  const start = new Date(startTs)
  const end = new Date(endTs)
  const sameDay = start.toDateString() === end.toDateString()
  const dateStr = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const startTime = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const endTime = end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return sameDay ? `${dateStr} • ${startTime} – ${endTime}` : `${dateStr} ${startTime} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${endTime}`
}

const HOURS_12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const DROP_STYLE = { background: 'rgba(30, 30, 30, 0.96)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }

function TimeRow({ label, hour, minute, isPM, hourDropdownKey, minuteDropdownKey, activeDropdown, dropdownRef, onToggleDropdown, onHourChange, onMinuteChange, onAMPMChange }) {
  const hourOpen = activeDropdown === hourDropdownKey
  const minOpen = activeDropdown === minuteDropdownKey
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-white/70 w-10 shrink-0">{label}</span>
      <div className="relative" ref={hourOpen ? dropdownRef : undefined}>
        <button
          type="button"
          onClick={() => onToggleDropdown(hourOpen ? null : hourDropdownKey)}
          className="schedule-picker-btn flex items-center gap-1 px-2.5 py-1.5 text-sm rounded min-w-[3rem] justify-between"
        >
          {hour}
          <ChevronDown className={`h-3 w-3 opacity-60 transition-transform ${hourOpen ? 'rotate-180' : ''}`} />
        </button>
        {hourOpen && (
          <div
            className="absolute left-0 bottom-full mb-1 z-[200] max-h-48 overflow-y-auto scrollbar-hide rounded-lg shadow-xl min-w-[3rem]"
            style={{ ...DROP_STYLE, border: '1px solid rgba(255,255,255,0.4)' }}
          >
            {HOURS_12.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => { onHourChange(h); onToggleDropdown(null) }}
                className={`schedule-picker-menu-item block w-full px-2.5 py-2 text-sm text-left transition-colors ${hour === h ? 'is-selected' : ''}`}
              >
                {h}
              </button>
            ))}
          </div>
        )}
      </div>
      <span className="text-white/60">:</span>
      <div className="relative" ref={minOpen ? dropdownRef : undefined}>
        <button
          type="button"
          onClick={() => onToggleDropdown(minOpen ? null : minuteDropdownKey)}
          className="schedule-picker-btn flex items-center gap-1 px-2.5 py-1.5 text-sm rounded min-w-[3.5rem] justify-between"
        >
          {String(minute).padStart(2, '0')}
          <ChevronDown className={`h-3 w-3 opacity-60 transition-transform ${minOpen ? 'rotate-180' : ''}`} />
        </button>
        {minOpen && (
          <div
            className="absolute left-0 bottom-full mb-1 z-[200] overflow-y-auto scrollbar-hide rounded-lg shadow-xl min-w-[3.5rem]"
            style={{ ...DROP_STYLE, border: '1px solid rgba(255,255,255,0.4)' }}
          >
            {MINUTE_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { onMinuteChange(m); onToggleDropdown(null) }}
                className={`schedule-picker-menu-item block w-full px-2.5 py-2 text-sm text-left transition-colors ${minute === m ? 'is-selected' : ''}`}
              >
                {String(m).padStart(2, '0')}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="schedule-ampm-group flex items-center ml-auto">
        <button
          type="button"
          onClick={() => onAMPMChange(false)}
          className={`schedule-ampm-btn px-2.5 py-1.5 text-xs font-medium transition-colors ${!isPM ? 'is-selected' : ''}`}
        >
          AM
        </button>
        <button
          type="button"
          onClick={() => onAMPMChange(true)}
          className={`schedule-ampm-btn px-2.5 py-1.5 text-xs font-medium transition-colors ${isPM ? 'is-selected' : ''}`}
        >
          PM
        </button>
      </div>
    </div>
  )
}

export function SchedulePicker({ value, onChange, minDate = Date.now(), endValue = null, onEndChange, triggerClassName, title = 'Schedule', size = 'default', taskTitle, leadAddress, leadName, inline = false, hideLabel = false }) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState(null)
  const [hourDropdownOpen, setHourDropdownOpen] = useState(false)
  const [minuteDropdownOpen, setMinuteDropdownOpen] = useState(false)
  const [inlineDropdown, setInlineDropdown] = useState(null) // 'fromHour' | 'fromMin' | 'toHour' | 'toMin' | null
  const inlineDropdownRef = useRef(null)

  const base = value ? new Date(value) : new Date(Math.max(minDate, Date.now()))
  const [viewYear, setViewYear] = useState(base.getFullYear())
  const [viewMonth, setViewMonth] = useState(base.getMonth())
  const [selectedDate, setSelectedDate] = useState(value ? new Date(value) : null)
  const [hour12, setHour12] = useState(() => {
    const h24 = value ? new Date(value).getHours() : 9
    return h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24
  })
  const [minute, setMinute] = useState(() => roundToNearestMinute(value ? new Date(value).getMinutes() : 0))
  const [isPM, setIsPM] = useState(() => (value ? new Date(value).getHours() : 9) >= 12)
  const [hour12End, setHour12End] = useState(() => {
    if (!endValue) return 10
    const h24 = new Date(endValue).getHours()
    return h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24
  })
  const [minuteEnd, setMinuteEnd] = useState(() => roundToNearestMinute(endValue ? new Date(endValue).getMinutes() : 0))
  const [isPMEnd, setIsPMEnd] = useState(() => (endValue ? new Date(endValue).getHours() : 10) >= 12)
  const [expanded, setExpanded] = useState(true)

  const minD = new Date(minDate)
  const ONE_HOUR_MS = 60 * 60 * 1000

  // Sync state when opening with value (popup) or when value changes (inline)
  // Default: 9:00 AM for start, 10:00 AM for end when no value
  useEffect(() => {
    if (open || inline) {
      const b = value ? new Date(value) : new Date(Math.max(minDate, Date.now()))
      const h24 = value ? new Date(value).getHours() : 9
      setViewYear(b.getFullYear())
      setViewMonth(b.getMonth())
      setSelectedDate(value ? new Date(value) : null)
      setHour12(h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24)
      setMinute(roundToNearestMinute(value ? new Date(value).getMinutes() : 0))
      setIsPM(h24 >= 12)
      if (inline && onEndChange) {
        const endH24 = endValue ? new Date(endValue).getHours() : (value ? new Date(value).getHours() : 9) + 1
        setHour12End(endH24 === 0 ? 12 : endH24 > 12 ? endH24 - 12 : endH24)
        setMinuteEnd(roundToNearestMinute(endValue ? new Date(endValue).getMinutes() : 0))
        setIsPMEnd((endValue ? new Date(endValue).getHours() : (value ? new Date(value).getHours() : 9) + 1) >= 12)
      }
    }
  }, [open, value, endValue, minDate, inline, onEndChange])

  useEffect(() => {
    if (!open) {
      setHourDropdownOpen(false)
      setMinuteDropdownOpen(false)
    }
  }, [open])

  useEffect(() => {
    if (!inlineDropdown) return
    const handle = (e) => {
      if (inlineDropdownRef.current && !inlineDropdownRef.current.contains(e.target)) setInlineDropdown(null)
    }
    document.addEventListener('pointerdown', handle)
    return () => document.removeEventListener('pointerdown', handle)
  }, [inlineDropdown])

  const buildTs = useCallback((d, h12, m, pm) => {
    const date = d || new Date()
    let h24 = h12
    if (pm && h12 !== 12) h24 = h12 + 12
    else if (!pm && h12 === 12) h24 = 0
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h24, m).getTime()
  }, [])

  const handleDayClick = (d) => {
    if (!d) return
    const isPast = d < new Date(minD.getFullYear(), minD.getMonth(), minD.getDate())
    if (isPast) return
    setSelectedDate(d)
    if (inline) {
      const ts = buildTs(d, hour12, minute, isPM)
      if (ts >= minDate) {
        onChange(ts)
        if (onEndChange) {
          const endTs = endValue && endValue > ts ? endValue : ts + ONE_HOUR_MS
          onEndChange(endTs)
        }
      }
    }
  }

  const commitTimeChange = useCallback((h12Val, minuteVal, isPMVal) => {
    const d = selectedDate || new Date(Math.max(minDate, Date.now()))
    const ts = buildTs(d, h12Val, minuteVal, isPMVal)
    if (ts >= minDate) {
      onChange(ts)
      if (inline && onEndChange) {
        const endTs = endValue && endValue > ts ? endValue : ts + ONE_HOUR_MS
        if (endValue !== endTs) onEndChange(endTs)
      }
    }
  }, [selectedDate, minDate, buildTs, onChange, inline, onEndChange, endValue])

  const commitEndTimeChange = useCallback((h12Val, minuteVal, isPMVal) => {
    const d = selectedDate || new Date(Math.max(minDate, Date.now()))
    const ts = buildTs(d, h12Val, minuteVal, isPMVal)
    if (value && ts > value) onEndChange?.(ts)
  }, [selectedDate, value, minDate, buildTs, onEndChange])

  const handleApply = () => {
    const d = selectedDate || new Date()
    let h24 = hour12
    if (isPM && hour12 !== 12) h24 = hour12 + 12
    else if (!isPM && hour12 === 12) h24 = 0
    const ts = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h24, minute).getTime()
    if (ts >= minDate) {
      onChange(ts)
    }
    setOpen(false)
  }

  const handleClear = () => {
    onChange(null)
    onEndChange?.(null)
    setSelectedDate(null)
    if (inline) setExpanded(true)
    else setOpen(false)
  }

  const days = getDaysInMonth(viewYear, viewMonth)
  const hasContext = taskTitle || leadAddress || leadName
  const isComplete = inline && value && (onEndChange ? endValue : true)

  const handleSet = () => {
    if (isComplete) setExpanded(false)
  }

  const panel = open && anchor && (
    <div
      className="schedule-picker-panel fixed left-1/2 top-1/2 z-[10010] -translate-x-1/2 -translate-y-1/2 rounded-lg overflow-visible min-w-[240px] pointer-events-auto"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {hasContext && (
        <div className="px-4 pt-4 pb-2 border-b border-white/20 space-y-1">
          {taskTitle && <div className="text-sm font-medium text-white truncate" title={taskTitle}>{taskTitle}</div>}
          {leadName && <div className="text-xs text-white/80 truncate">{leadName}</div>}
          {leadAddress && <div className="text-xs text-white/70 truncate">{leadAddress}</div>}
        </div>
      )}
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="p-1 rounded text-white/80 hover:text-white hover:bg-white/10"
            onClick={() => {
              if (viewMonth === 0) {
                setViewMonth(11)
                setViewYear((y) => y - 1)
              } else setViewMonth((m) => m - 1)
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium">
            {new Date(viewYear, viewMonth).toLocaleString('default', { month: 'long' })} {viewYear}
          </span>
          <button
            type="button"
            className="p-1 rounded text-white/80 hover:text-white hover:bg-white/10"
            onClick={() => {
              if (viewMonth === 11) {
                setViewMonth(0)
                setViewYear((y) => y + 1)
              } else setViewMonth((m) => m + 1)
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-[10px]">
          {DAYS.map((d) => (
            <div key={d} className="text-center text-white/60 py-1">
              {d}
            </div>
          ))}
          {days.map((d, i) => {
            if (!d) return <div key={`pad-${i}`} />
            const isSelected = selectedDate && d.toDateString() === selectedDate.toDateString()
            const isToday = d.toDateString() === new Date().toDateString()
            const isPast = d < new Date(minD.getFullYear(), minD.getMonth(), minD.getDate())
            return (
              <button
                key={d.toISOString()}
                type="button"
                disabled={isPast}
                onClick={() => handleDayClick(d)}
                className={`py-1.5 rounded text-xs ${
                  isPast
                    ? 'text-white/30 cursor-not-allowed'
                    : isSelected
                      ? 'bg-white/25 text-white font-medium'
                      : isToday
                        ? 'bg-white/15 text-white'
                        : 'text-white/90 hover:bg-white/10'
                }`}
              >
                {d.getDate()}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2 pt-1 border-t border-white/20">
          <span className="text-xs text-white/70">Time:</span>
          <div className="relative">
            <button
              type="button"
              onClick={() => { setMinuteDropdownOpen(false); setHourDropdownOpen((o) => !o) }}
              className="flex items-center gap-0.5 px-2 py-1 text-xs rounded bg-white/10 border border-white/20 text-white hover:bg-white/15 min-w-[2.5rem]"
            >
              {hour12}
              <ChevronDown className={`h-3 w-3 transition-transform ${hourDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {hourDropdownOpen && (
              <div
                className="absolute left-0 top-full mt-0.5 z-50 max-h-32 overflow-y-auto scrollbar-hide rounded border border-white/20 bg-[rgba(30,35,50,0.98)] shadow-lg"
                onWheel={(e) => e.stopPropagation()}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => { setHour12(h); setHourDropdownOpen(false) }}
                    className={`block w-full px-2 py-1.5 text-xs text-left hover:bg-white/15 ${hour12 === h ? 'bg-white/20 text-white' : 'text-white/90'}`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="text-white/60">:</span>
          <div className="relative">
            <button
              type="button"
              onClick={() => { setHourDropdownOpen(false); setMinuteDropdownOpen((o) => !o) }}
              className="flex items-center gap-0.5 px-2 py-1 text-xs rounded bg-white/10 border border-white/20 text-white hover:bg-white/15 min-w-[2.5rem]"
            >
              {String(minute).padStart(2, '0')}
              <ChevronDown className={`h-3 w-3 transition-transform ${minuteDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {minuteDropdownOpen && (
              <div
                className="absolute left-0 top-full mt-0.5 z-50 overflow-y-auto scrollbar-hide rounded border border-white/20 bg-[rgba(30,35,50,0.98)] shadow-lg"
                onWheel={(e) => e.stopPropagation()}
              >
                {MINUTE_OPTIONS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { setMinute(m); setMinuteDropdownOpen(false) }}
                    className={`block w-full px-2 py-1.5 text-xs text-left hover:bg-white/15 ${minute === m ? 'bg-white/20 text-white' : 'text-white/90'}`}
                  >
                    {String(m).padStart(2, '0')}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex rounded overflow-hidden border border-white/20">
            <button
              type="button"
              onClick={() => setIsPM(false)}
              className={`px-2 py-1 text-xs font-medium ${!isPM ? 'bg-white/25 text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}
            >
              AM
            </button>
            <button
              type="button"
              onClick={() => setIsPM(true)}
              className={`px-2 py-1 text-xs font-medium ${isPM ? 'bg-white/25 text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}
            >
              PM
            </button>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleApply}
            className="flex-1 py-1.5 text-xs font-medium rounded bg-white/20 hover:bg-white/30 text-white"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="py-1.5 px-2 text-xs text-white/80 hover:text-white"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  )

  if (inline) {
    const summary = onEndChange && value && endValue
      ? formatScheduleRange(value, endValue)
      : value
        ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
        : 'Select date and time'
    if (isComplete && !expanded) {
      return (
        <div className={hideLabel ? '' : 'rounded-lg border border-white/20 p-3 bg-white/5'}>
          {!hideLabel && <label className="text-xs font-medium block opacity-90 mb-1">Date & time</label>}
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="flex items-center justify-between w-full text-left text-sm py-1.5 px-2 -mx-2 -mb-1 rounded hover:bg-white/10"
          >
            <span className="text-white/95 truncate">{summary}</span>
            <ChevronDown className="h-4 w-4 text-white/70 flex-shrink-0 ml-2" />
          </button>
        </div>
      )
    }
    return (
      <div className={hideLabel ? 'space-y-3' : 'space-y-3 rounded-lg border border-white/20 p-3 bg-white/5'}>
        {!hideLabel && <label className="text-xs font-medium block opacity-90">Date & time</label>}
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="p-1 rounded text-white/80 hover:text-white hover:bg-white/10"
            onClick={() => {
              if (viewMonth === 0) {
                setViewMonth(11)
                setViewYear((y) => y - 1)
              } else setViewMonth((m) => m - 1)
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium">
            {new Date(viewYear, viewMonth).toLocaleString('default', { month: 'short' })} {viewYear}
          </span>
          <button
            type="button"
            className="p-1 rounded text-white/80 hover:text-white hover:bg-white/10"
            onClick={() => {
              if (viewMonth === 11) {
                setViewMonth(0)
                setViewYear((y) => y + 1)
              } else setViewMonth((m) => m + 1)
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="calendar-days-grid grid grid-cols-7 text-[10px] border border-white/25 rounded overflow-hidden">
          {DAYS.map((d) => (
            <div key={d} className="text-center text-white/60 py-1 px-0.5 border-b border-r border-white/20 bg-white/5">{d}</div>
          ))}
          {days.map((d, i) => {
            if (!d) return <div key={`pad-${i}`} className="min-h-[28px] border-b border-r border-white/20 bg-white/5" />
            const isSelected = selectedDate && d.toDateString() === selectedDate.toDateString()
            const isToday = d.toDateString() === new Date().toDateString()
            const isPast = d < new Date(minD.getFullYear(), minD.getMonth(), minD.getDate())
            return (
              <button
                key={d.toISOString()}
                type="button"
                disabled={isPast}
                onClick={() => handleDayClick(d)}
                className={`calendar-day-btn py-1.5 text-xs transition-colors min-h-[28px] border-b border-r border-white/20 ${
                  isPast ? 'text-white/30 cursor-not-allowed bg-white/5' :
                  isSelected ? 'bg-white/25 text-white font-semibold ring-2 ring-white/50 ring-inset' :
                  isToday ? 'bg-white/15 text-white' : 'text-white/90 hover:bg-white/10 bg-transparent'
                }`}
              >
                {d.getDate()}
              </button>
            )
          })}
        </div>
        <div className="space-y-3 pt-3 border-t border-white/20">
          <TimeRow
            label="From"
            hour={hour12}
            minute={minute}
            isPM={isPM}
            hourDropdownKey="fromHour"
            minuteDropdownKey="fromMin"
            activeDropdown={inlineDropdown}
            dropdownRef={inlineDropdownRef}
            onToggleDropdown={setInlineDropdown}
            onHourChange={(h) => { setHour12(h); commitTimeChange(h, minute, isPM) }}
            onMinuteChange={(m) => { setMinute(m); commitTimeChange(hour12, m, isPM) }}
            onAMPMChange={(pm) => { setIsPM(pm); commitTimeChange(hour12, minute, pm) }}
          />
          {onEndChange && (
            <TimeRow
              label="To"
              hour={hour12End}
              minute={minuteEnd}
              isPM={isPMEnd}
              hourDropdownKey="toHour"
              minuteDropdownKey="toMin"
              activeDropdown={inlineDropdown}
              dropdownRef={inlineDropdownRef}
              onToggleDropdown={setInlineDropdown}
              onHourChange={(h) => { setHour12End(h); commitEndTimeChange(h, minuteEnd, isPMEnd) }}
              onMinuteChange={(m) => { setMinuteEnd(m); commitEndTimeChange(hour12End, m, isPMEnd) }}
              onAMPMChange={(pm) => { setIsPMEnd(pm); commitEndTimeChange(hour12End, minuteEnd, pm) }}
            />
          )}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleClear}
              className="schedule-picker-btn py-1.5 px-3 text-xs font-medium rounded transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleSet}
              disabled={!isComplete}
              className="schedule-picker-btn schedule-picker-btn--primary py-1.5 px-3 text-xs font-medium rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Set
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        className={triggerClassName}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        title={title}
      >
        <Calendar className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      </button>
      {createPortal(panel, document.getElementById('modal-root') || document.body)}
    </>
  )
}
