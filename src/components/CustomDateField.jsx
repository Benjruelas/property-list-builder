import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function toYmd(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseYmd(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (
    date.getFullYear() !== Number(m[1])
    || date.getMonth() !== Number(m[2]) - 1
    || date.getDate() !== Number(m[3])
  ) return null
  return date
}

/** Display MM/DD/YYYY from stored YYYY-MM-DD. */
export function formatCustomDateDisplay(ymd) {
  const date = parseYmd(ymd)
  if (!date) return ymd ? String(ymd) : ''
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`
}

/** Parse typed dates into YYYY-MM-DD (accepts MM/DD/YYYY, M/D/YY, YYYY-MM-DD). */
export function parseCustomDateInput(raw) {
  const s = String(raw || '').trim()
  if (!s) return null

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) {
    const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    if (
      date.getFullYear() === Number(m[1])
      && date.getMonth() === Number(m[2]) - 1
      && date.getDate() === Number(m[3])
    ) return toYmd(date)
    return null
  }

  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (!m) return null
  let year = Number(m[3])
  if (year < 100) year += year >= 70 ? 1900 : 2000
  const month = Number(m[1])
  const day = Number(m[2])
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) return null
  return toYmd(date)
}

function getDaysInMonth(year, month) {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const days = []
  for (let i = 0; i < first.getDay(); i++) days.push(null)
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d))
  return days
}

/**
 * Typeable date field + app calendar picker (no native date icon).
 * Stores YYYY-MM-DD; shows MM/DD/YYYY while editing.
 */
export function CustomDateField({
  value = '',
  onChange,
  disabled = false,
  className = '',
  inputClassName = '',
  placeholder = 'MM/DD/YYYY',
}) {
  const [draft, setDraft] = useState(() => formatCustomDateDisplay(value))
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  const selected = parseYmd(value)
  const [viewYear, setViewYear] = useState(() => (selected || new Date()).getFullYear())
  const [viewMonth, setViewMonth] = useState(() => (selected || new Date()).getMonth())

  useEffect(() => {
    setDraft(formatCustomDateDisplay(value))
  }, [value])

  useEffect(() => {
    if (!open) return
    const base = selected || new Date()
    setViewYear(base.getFullYear())
    setViewMonth(base.getMonth())
  }, [open, selected])

  useEffect(() => {
    if (!open) return
    // Defer so the opening pointerdown doesn't immediately close.
    let onPointer
    let onKey
    const timer = window.setTimeout(() => {
      onPointer = (e) => {
        if (wrapRef.current?.contains(e.target)) return
        setOpen(false)
      }
      onKey = (e) => {
        if (e.key === 'Escape') setOpen(false)
      }
      document.addEventListener('pointerdown', onPointer)
      document.addEventListener('keydown', onKey)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      if (onPointer) document.removeEventListener('pointerdown', onPointer)
      if (onKey) document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const commitDraft = () => {
    const trimmed = draft.trim()
    if (!trimmed) {
      onChange?.(null)
      setDraft('')
      return
    }
    const parsed = parseCustomDateInput(trimmed)
    if (parsed) {
      onChange?.(parsed)
      setDraft(formatCustomDateDisplay(parsed))
    } else {
      setDraft(formatCustomDateDisplay(value))
    }
  }

  const pickDay = (date) => {
    const ymd = toYmd(date)
    onChange?.(ymd)
    setDraft(formatCustomDateDisplay(ymd))
    setOpen(false)
  }

  const days = getDaysInMonth(viewYear, viewMonth)

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <div className="flex items-center gap-1.5">
        <Input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitDraft()
              e.currentTarget.blur()
            }
          }}
          className={cn('h-9 text-sm flex-1 min-w-0', inputClassName)}
        />
        <button
          type="button"
          disabled={disabled}
          title="Pick date"
          aria-label="Pick date"
          aria-expanded={open}
          // preventDefault on mousedown keeps input blur from eating the click
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation()
            if (disabled) return
            setOpen((o) => !o)
          }}
          className={cn(
            'custom-date-picker-btn shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-md border border-white/15 bg-white/[0.04] text-white/75 hover:bg-white/10 hover:text-white/95 transition-colors',
            disabled && 'opacity-50 pointer-events-none',
            open && 'bg-white/10 text-white/95',
          )}
        >
          <Calendar className="h-4 w-4 pointer-events-none" />
        </button>
      </div>
      {open && (
        <div
          className="schedule-picker-panel absolute z-[100] right-0 top-full mt-1 rounded-lg p-3 space-y-2 w-[min(100%,280px)] min-w-[240px] shadow-xl"
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="schedule-picker-month-nav flex items-center justify-between gap-2">
            <button
              type="button"
              className="schedule-nav-btn"
              aria-label="Previous month"
              onClick={() => {
                if (viewMonth === 0) {
                  setViewMonth(11)
                  setViewYear((y) => y - 1)
                } else setViewMonth((m) => m - 1)
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold tracking-tight text-white/95">
              {new Date(viewYear, viewMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button"
              className="schedule-nav-btn"
              aria-label="Next month"
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
          <div className="calendar-days-grid schedule-picker-calendar grid w-full grid-cols-7 text-[10px] border border-white/20 rounded-lg overflow-hidden">
            {DAYS.map((d) => (
              <div
                key={d}
                className="text-center text-white/55 py-1.5 border-b border-r border-white/15 bg-white/[0.04] font-medium uppercase tracking-wide text-[9px]"
              >
                {d}
              </div>
            ))}
            {days.map((d, i) => {
              if (!d) {
                return <div key={`pad-${i}`} className="min-h-[30px] border-b border-r border-white/20 bg-white/5" />
              }
              const isSelected = selected && d.toDateString() === selected.toDateString()
              const isToday = d.toDateString() === new Date().toDateString()
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => pickDay(d)}
                  className={cn(
                    'calendar-day-btn schedule-picker-day py-1.5 text-xs transition-colors min-h-[30px] border-b border-r border-white/15',
                    isSelected
                      ? 'bg-white/22 text-white font-semibold ring-2 ring-white/45 ring-inset'
                      : isToday
                        ? 'bg-white/10 text-white font-medium'
                        : 'text-white/90 hover:bg-white/10',
                  )}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>
          {value ? (
            <button
              type="button"
              className="schedule-picker-footer-btn text-xs text-white/60 hover:text-white/90 w-full py-1.5"
              onClick={() => {
                onChange?.(null)
                setDraft('')
                setOpen(false)
              }}
            >
              Clear
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default CustomDateField
