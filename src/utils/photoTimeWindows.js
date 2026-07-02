/**
 * Time-window presets for bulk photo import ("Today", "Last 30 days", etc).
 * Ranges are computed in local time so "Today" matches what the user expects
 * on their device, not UTC.
 */

export const TIME_WINDOW_PRESETS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last7', label: 'Last 7 days' },
  { id: 'last30', label: 'Last 30 days' },
]

export const MANUAL_TIME_WINDOW = 'manual'

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(date) {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

/**
 * @param {string} presetId
 * @param {Date} [now]
 * @returns {{ start: Date, end: Date } | null}
 */
export function getTimeWindowRange(presetId, now = new Date()) {
  const todayStart = startOfDay(now)
  switch (presetId) {
    case 'today':
      return { start: todayStart, end: now }
    case 'yesterday': {
      const start = new Date(todayStart)
      start.setDate(start.getDate() - 1)
      return { start, end: endOfDay(start) }
    }
    case 'last7': {
      const start = new Date(todayStart)
      start.setDate(start.getDate() - 6)
      return { start, end: now }
    }
    case 'last30': {
      const start = new Date(todayStart)
      start.setDate(start.getDate() - 29)
      return { start, end: now }
    }
    default:
      return null
  }
}

/**
 * @param {Date|null} date
 * @param {string} presetId
 * @param {Date} [now]
 */
export function isWithinTimeWindow(date, presetId, now = new Date()) {
  if (!presetId || presetId === MANUAL_TIME_WINDOW) return true
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false
  const range = getTimeWindowRange(presetId, now)
  if (!range) return true
  return date >= range.start && date <= range.end
}

export function timeWindowLabel(presetId) {
  return TIME_WINDOW_PRESETS.find((p) => p.id === presetId)?.label || ''
}
