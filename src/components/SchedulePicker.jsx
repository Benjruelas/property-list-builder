import { useState, useEffect } from 'react'
import { Calendar, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'

const MINUTE_OPTIONS = [0, 15, 30, 45]

function roundToNearestMinute(m) {
  const opts = MINUTE_OPTIONS
  return opts.reduce((prev, curr) => Math.abs(curr - m) < Math.abs(prev - m) ? curr : prev)
}
import { createPortal } from 'react-dom'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getDaysInMonth(year, month) {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const days = []
  // Pad start to align first day
  const startPad = first.getDay()
  for (let i = 0; i < startPad; i++) days.push(null)
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d))
  return days
}

export function SchedulePicker({ value, onChange, minDate = Date.now(), triggerClassName, title = 'Schedule', size = 'default', taskTitle, leadAddress, leadName }) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState(null)
  const [hourDropdownOpen, setHourDropdownOpen] = useState(false)
  const [minuteDropdownOpen, setMinuteDropdownOpen] = useState(false)

  const base = value ? new Date(value) : new Date(Math.max(minDate, Date.now()))
  const [viewYear, setViewYear] = useState(base.getFullYear())
  const [viewMonth, setViewMonth] = useState(base.getMonth())
  const [selectedDate, setSelectedDate] = useState(value ? new Date(value) : null)
  const [hour12, setHour12] = useState(() => {
    const h24 = value ? new Date(value).getHours() : 12
    return h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24
  })
  const [minute, setMinute] = useState(() => roundToNearestMinute(value ? new Date(value).getMinutes() : 0))
  const [isPM, setIsPM] = useState(() => (value ? new Date(value).getHours() : 12) >= 12)

  const minD = new Date(minDate)

  // Sync state when opening with value
  useEffect(() => {
    if (open) {
      const b = value ? new Date(value) : new Date(Math.max(minDate, Date.now()))
      const h24 = value ? new Date(value).getHours() : 12
      setViewYear(b.getFullYear())
      setViewMonth(b.getMonth())
      setSelectedDate(value ? new Date(value) : null)
      setHour12(h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24)
      setMinute(roundToNearestMinute(value ? new Date(value).getMinutes() : 0))
      setIsPM(h24 >= 12)
    }
  }, [open, value, minDate])

  useEffect(() => {
    if (!open) {
      setHourDropdownOpen(false)
      setMinuteDropdownOpen(false)
    }
  }, [open])

  const handleDayClick = (d) => {
    if (!d) return
    const isPast = d < new Date(minD.getFullYear(), minD.getMonth(), minD.getDate())
    if (isPast) return
    setSelectedDate(d)
  }

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
    setSelectedDate(null)
    setOpen(false)
  }

  const days = getDaysInMonth(viewYear, viewMonth)

  const hasContext = taskTitle || leadAddress || leadName

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
