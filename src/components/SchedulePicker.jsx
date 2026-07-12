import { useState, useEffect, useCallback, useRef } from 'react'
import { Calendar, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { createPortal } from 'react-dom'

const MINUTE_OPTIONS = [0, 15, 30, 45]
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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

function clampHour12(n) {
  if (n == null || Number.isNaN(n)) return null
  return Math.min(12, Math.max(1, Math.round(n)))
}

function clampMinute(n) {
  if (n == null || Number.isNaN(n)) return null
  return Math.min(59, Math.max(0, Math.round(n)))
}

function parseTimeDraft(draft, kind) {
  const t = draft.trim()
  if (!t) return null
  const n = parseInt(t, 10)
  if (Number.isNaN(n)) return null
  return kind === 'hour' ? clampHour12(n) : clampMinute(n)
}

function formatTimeDraft(value, kind) {
  if (kind === 'minute') return String(value).padStart(2, '0')
  return String(value)
}

function TimeNumberField({
  value,
  onChange,
  kind,
  options,
  dropdownKey,
  activeDropdown,
  dropdownRef,
  onToggleDropdown,
  ariaLabel,
  className = '',
}) {
  const open = activeDropdown === dropdownKey
  const [draft, setDraft] = useState(() => formatTimeDraft(value, kind))

  useEffect(() => {
    setDraft(formatTimeDraft(value, kind))
  }, [value, kind])

  const commitDraft = () => {
    const parsed = parseTimeDraft(draft, kind)
    if (parsed != null) {
      if (parsed !== value) onChange(parsed)
      setDraft(formatTimeDraft(parsed, kind))
    } else {
      setDraft(formatTimeDraft(value, kind))
    }
  }

  const selectOption = (n) => {
    onChange(n)
    setDraft(formatTimeDraft(n, kind))
    onToggleDropdown(null)
  }

  return (
    <div className={`relative schedule-time-field ${className}`.trim()} ref={open ? dropdownRef : undefined}>
      <div className="schedule-time-select-btn schedule-time-input-wrap flex items-stretch rounded-md overflow-hidden">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={draft}
          onChange={(e) => {
            const maxLen = kind === 'minute' ? 2 : 2
            setDraft(e.target.value.replace(/\D/g, '').slice(0, maxLen))
          }}
          onFocus={() => onToggleDropdown(null)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitDraft()
              onToggleDropdown(null)
              e.currentTarget.blur()
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              onToggleDropdown(open ? null : dropdownKey)
            } else if (e.key === 'Escape') {
              setDraft(formatTimeDraft(value, kind))
              onToggleDropdown(null)
            }
          }}
          className="schedule-time-input"
          aria-label={ariaLabel}
        />
        <button
          type="button"
          onClick={() => onToggleDropdown(open ? null : dropdownKey)}
          className="schedule-time-chevron-btn flex items-center justify-center shrink-0"
          aria-label={`${ariaLabel} presets`}
          aria-expanded={open}
        >
          <ChevronDown className={`h-3 w-3 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && (
        <div
          className="absolute left-0 bottom-full mb-1 z-[200] max-h-48 overflow-y-auto scrollbar-hide rounded-lg shadow-xl min-w-full"
          style={{ ...DROP_STYLE, border: '1px solid rgba(255,255,255,0.4)' }}
        >
          {options.map((n) => (
            <button
              key={n}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectOption(n)}
              className={`schedule-picker-menu-item block w-full px-2.5 py-2 text-sm text-left transition-colors ${value === n ? 'is-selected' : ''}`}
            >
              {kind === 'minute' ? String(n).padStart(2, '0') : n}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function AmPmToggle({ isPM, onChange, disabled = false }) {
  return (
    <div className="schedule-ampm-switch shrink-0" role="group" aria-label="AM or PM">
      <div className={`schedule-ampm-switch__track${isPM ? ' is-pm' : ''}`}>
        <span className="schedule-ampm-switch__thumb" aria-hidden />
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(false)}
          className={`schedule-ampm-switch__option${!isPM ? ' is-active' : ''}`}
          aria-pressed={!isPM}
        >
          AM
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(true)}
          className={`schedule-ampm-switch__option${isPM ? ' is-active' : ''}`}
          aria-pressed={isPM}
        >
          PM
        </button>
      </div>
    </div>
  )
}

function ScheduleFooterActions({ onClear, onPrimary, primaryLabel = 'Set', primaryDisabled = false }) {
  return (
    <div className="schedule-picker-footer flex gap-2 pt-1">
      <button type="button" onClick={onClear} className="schedule-picker-footer-btn flex-1">
        Clear
      </button>
      <button
        type="button"
        onClick={onPrimary}
        disabled={primaryDisabled}
        className="schedule-picker-footer-btn schedule-picker-footer-btn--primary flex-1"
      >
        {primaryLabel}
      </button>
    </div>
  )
}

function ScheduleMonthNav({ viewYear, viewMonth, onPrev, onNext, monthFormat = 'short' }) {
  return (
    <div className="schedule-picker-month-nav flex items-center justify-between gap-2">
      <button type="button" className="schedule-nav-btn" onClick={onPrev} aria-label="Previous month">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="text-sm font-semibold tracking-tight text-white/95">
        {new Date(viewYear, viewMonth).toLocaleString('default', { month: monthFormat, year: 'numeric' })}
      </span>
      <button type="button" className="schedule-nav-btn" onClick={onNext} aria-label="Next month">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

function TimeRow({ label, hour, minute, isPM, hourDropdownKey, minuteDropdownKey, activeDropdown, dropdownRef, onToggleDropdown, onHourChange, onMinuteChange, onAMPMChange }) {
  return (
    <div className="schedule-time-row flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.03] px-2.5 py-2">
      <span className="text-xs font-medium text-white/65 w-9 shrink-0">{label}</span>
      <TimeNumberField
        kind="hour"
        value={hour}
        onChange={onHourChange}
        options={HOURS_12}
        dropdownKey={hourDropdownKey}
        activeDropdown={activeDropdown}
        dropdownRef={dropdownRef}
        onToggleDropdown={onToggleDropdown}
        ariaLabel={`${label} hour`}
        className="min-w-[3.25rem]"
      />
      <span className="text-white/60">:</span>
      <TimeNumberField
        kind="minute"
        value={minute}
        onChange={onMinuteChange}
        options={MINUTE_OPTIONS}
        dropdownKey={minuteDropdownKey}
        activeDropdown={activeDropdown}
        dropdownRef={dropdownRef}
        onToggleDropdown={onToggleDropdown}
        ariaLabel={`${label} minute`}
        className="min-w-[3.5rem]"
      />
      <AmPmToggle isPM={isPM} onChange={onAMPMChange} />
    </div>
  )
}

export function SchedulePicker({ value, onChange, minDate = Date.now(), endValue = null, onEndChange, triggerClassName, title = 'Schedule', size = 'default', taskTitle, leadAddress, leadName, inline = false, hideLabel = false }) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState(null)
  const [inlineDropdown, setInlineDropdown] = useState(null) // 'fromHour' | 'fromMin' | 'toHour' | 'toMin' | 'popupHour' | 'popupMin' | null
  const inlineDropdownRef = useRef(null)

  const base = value ? new Date(value) : new Date(Math.max(minDate, Date.now()))
  const [viewYear, setViewYear] = useState(base.getFullYear())
  const [viewMonth, setViewMonth] = useState(base.getMonth())
  const [selectedDate, setSelectedDate] = useState(value ? new Date(value) : null)
  const [hour12, setHour12] = useState(() => {
    const h24 = value ? new Date(value).getHours() : 9
    return h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24
  })
  const [minute, setMinute] = useState(() => (value ? new Date(value).getMinutes() : 0))
  const [isPM, setIsPM] = useState(() => (value ? new Date(value).getHours() : 9) >= 12)
  const [hour12End, setHour12End] = useState(() => {
    if (!endValue) return 10
    const h24 = new Date(endValue).getHours()
    return h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24
  })
  const [minuteEnd, setMinuteEnd] = useState(() => (endValue ? new Date(endValue).getMinutes() : 0))
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
      setMinute(value ? new Date(value).getMinutes() : 0)
      setIsPM(h24 >= 12)
      if (inline && onEndChange) {
        const endH24 = endValue ? new Date(endValue).getHours() : (value ? new Date(value).getHours() : 9) + 1
        setHour12End(endH24 === 0 ? 12 : endH24 > 12 ? endH24 - 12 : endH24)
        setMinuteEnd(endValue ? new Date(endValue).getMinutes() : 0)
        setIsPMEnd((endValue ? new Date(endValue).getHours() : (value ? new Date(value).getHours() : 9) + 1) >= 12)
      }
    }
  }, [open, value, endValue, minDate, inline, onEndChange])

  useEffect(() => {
    if (!open) setInlineDropdown(null)
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
        <ScheduleMonthNav
          viewYear={viewYear}
          viewMonth={viewMonth}
          monthFormat="long"
          onPrev={() => {
            if (viewMonth === 0) {
              setViewMonth(11)
              setViewYear((y) => y - 1)
            } else setViewMonth((m) => m - 1)
          }}
          onNext={() => {
            if (viewMonth === 11) {
              setViewMonth(0)
              setViewYear((y) => y + 1)
            } else setViewMonth((m) => m + 1)
          }}
        />
        <div className="calendar-days-grid schedule-picker-calendar grid grid-cols-7 gap-0.5 text-[10px]">
          {DAYS.map((d) => (
            <div key={d} className="text-center text-white/55 py-1 font-medium uppercase tracking-wide">
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
                className={`calendar-day-btn schedule-picker-day py-1.5 rounded-md text-xs transition-colors ${
                  isPast
                    ? 'text-white/30 cursor-not-allowed'
                    : isSelected
                      ? 'bg-white/25 text-white font-semibold ring-1 ring-white/40'
                      : isToday
                        ? 'bg-white/12 text-white font-medium'
                        : 'text-white/90 hover:bg-white/10'
                }`}
              >
                {d.getDate()}
              </button>
            )
          })}
        </div>
        <div className="space-y-2 pt-1 border-t border-white/15">
          <TimeRow
            label="Time"
            hour={hour12}
            minute={minute}
            isPM={isPM}
            hourDropdownKey="popupHour"
            minuteDropdownKey="popupMin"
            activeDropdown={inlineDropdown}
            dropdownRef={inlineDropdownRef}
            onToggleDropdown={setInlineDropdown}
            onHourChange={setHour12}
            onMinuteChange={setMinute}
            onAMPMChange={setIsPM}
          />
          <ScheduleFooterActions onClear={handleClear} onPrimary={handleApply} primaryLabel="Apply" />
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
        <ScheduleMonthNav
          viewYear={viewYear}
          viewMonth={viewMonth}
          onPrev={() => {
            if (viewMonth === 0) {
              setViewMonth(11)
              setViewYear((y) => y - 1)
            } else setViewMonth((m) => m - 1)
          }}
          onNext={() => {
            if (viewMonth === 11) {
              setViewMonth(0)
              setViewYear((y) => y + 1)
            } else setViewMonth((m) => m + 1)
          }}
        />
        <div className="calendar-days-grid schedule-picker-calendar grid grid-cols-7 text-[10px] border border-white/20 rounded-lg overflow-hidden">
          {DAYS.map((d) => (
            <div key={d} className="text-center text-white/55 py-1.5 px-0.5 border-b border-r border-white/15 bg-white/[0.04] font-medium uppercase tracking-wide text-[9px]">{d}</div>
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
                className={`calendar-day-btn schedule-picker-day py-1.5 text-xs transition-colors min-h-[30px] border-b border-r border-white/15 ${
                  isPast ? 'text-white/30 cursor-not-allowed bg-white/[0.02]' :
                  isSelected ? 'bg-white/22 text-white font-semibold ring-2 ring-white/45 ring-inset' :
                  isToday ? 'bg-white/10 text-white font-medium' : 'text-white/90 hover:bg-white/10 bg-transparent'
                }`}
              >
                {d.getDate()}
              </button>
            )
          })}
        </div>
        <div className="space-y-2 pt-3 border-t border-white/15">
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
          <ScheduleFooterActions
            onClear={handleClear}
            onPrimary={handleSet}
            primaryDisabled={!isComplete}
          />
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

function parseIsoDate(iso) {
  if (!iso) return null
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function toIsoDate(date) {
  if (!date) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function startOfTodayMs() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

function formatUntilDate(date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Date-only picker for quote valid-until — matches inline task calendar, single Until row (no From/To times). */
export function ValidUntilPicker({
  value,
  onChange,
  onSet,
  minDate = startOfTodayMs(),
  hideLabel = false,
}) {
  const parsed = parseIsoDate(value)
  const minD = new Date(minDate)
  const base = parsed || new Date(Math.max(minDate, Date.now()))

  const [viewYear, setViewYear] = useState(base.getFullYear())
  const [viewMonth, setViewMonth] = useState(base.getMonth())
  const [selectedDate, setSelectedDate] = useState(parsed)

  useEffect(() => {
    const next = parseIsoDate(value)
    const anchor = next || new Date(Math.max(minDate, Date.now()))
    setSelectedDate(next)
    setViewYear(anchor.getFullYear())
    setViewMonth(anchor.getMonth())
  }, [value, minDate])

  const days = getDaysInMonth(viewYear, viewMonth)

  const handleDayClick = (d) => {
    if (!d) return
    const isPast = d < new Date(minD.getFullYear(), minD.getMonth(), minD.getDate())
    if (isPast) return
    setSelectedDate(d)
    onChange(toIsoDate(d))
  }

  const handleClear = () => {
    setSelectedDate(null)
    onChange('')
  }

  const handleSet = () => {
    if (selectedDate) onSet?.()
  }

  return (
    <div className="space-y-3 min-w-0 max-w-full overflow-hidden">
      {!hideLabel && <label className="text-xs font-medium block opacity-90">Valid until</label>}
      <ScheduleMonthNav
        viewYear={viewYear}
        viewMonth={viewMonth}
        onPrev={() => {
          if (viewMonth === 0) {
            setViewMonth(11)
            setViewYear((y) => y - 1)
          } else setViewMonth((m) => m - 1)
        }}
        onNext={() => {
          if (viewMonth === 11) {
            setViewMonth(0)
            setViewYear((y) => y + 1)
          } else setViewMonth((m) => m + 1)
        }}
      />
      <div className="calendar-days-grid schedule-picker-calendar grid w-full min-w-0 max-w-full grid-cols-7 text-[10px] border border-white/20 rounded-lg overflow-hidden">
        {DAYS.map((d) => (
          <div key={d} className="text-center text-white/55 py-1.5 px-0.5 border-b border-r border-white/15 bg-white/[0.04] font-medium uppercase tracking-wide text-[9px]">
            {d}
          </div>
        ))}
        {days.map((d, i) => {
          if (!d) {
            return <div key={`pad-${i}`} className="min-h-[28px] border-b border-r border-white/20 bg-white/5" />
          }
          const isSelected = selectedDate && d.toDateString() === selectedDate.toDateString()
          const isToday = d.toDateString() === new Date().toDateString()
          const isPast = d < new Date(minD.getFullYear(), minD.getMonth(), minD.getDate())
          return (
            <button
              key={d.toISOString()}
              type="button"
              disabled={isPast}
              onClick={() => handleDayClick(d)}
              className={`calendar-day-btn schedule-picker-day py-1.5 text-xs transition-colors min-h-[30px] border-b border-r border-white/15 ${
                isPast
                  ? 'text-white/30 cursor-not-allowed bg-white/[0.02]'
                  : isSelected
                    ? 'bg-white/22 text-white font-semibold ring-2 ring-white/45 ring-inset'
                    : isToday
                      ? 'bg-white/10 text-white font-medium'
                      : 'text-white/90 hover:bg-white/10 bg-transparent'
              }`}
            >
              {d.getDate()}
            </button>
          )
        })}
      </div>
      <div className="space-y-2 pt-3 border-t border-white/15 min-w-0 max-w-full">
        <div className="schedule-time-row flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.03] px-2.5 py-2 min-w-0 max-w-full">
          <span className="text-xs font-medium text-white/65 w-9 shrink-0">Until</span>
          <span className="text-sm text-white/95 flex-1 min-w-0 truncate tabular-nums">
            {selectedDate ? formatUntilDate(selectedDate) : 'Select date'}
          </span>
        </div>
        <ScheduleFooterActions
          onClear={handleClear}
          onPrimary={handleSet}
          primaryDisabled={!selectedDate}
        />
      </div>
    </div>
  )
}
