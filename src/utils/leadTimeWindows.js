/**
 * Day-window helpers for Leads analytics ("New last 7/30/90 days").
 * Ranges use local start-of-day so "last N days" matches the device calendar.
 */

export const NEW_LEAD_WINDOWS = [7, 30, 90]

/** Tap cycle order: 30 → 7 → 90 → 30… */
const NEW_LEAD_WINDOW_CYCLE = [30, 7, 90]

export const DEFAULT_NEW_LEAD_WINDOW = 30

/**
 * @param {number} days
 * @returns {number}
 */
export function nextNewLeadWindow(days) {
  const idx = NEW_LEAD_WINDOW_CYCLE.indexOf(days)
  if (idx === -1) return DEFAULT_NEW_LEAD_WINDOW
  return NEW_LEAD_WINDOW_CYCLE[(idx + 1) % NEW_LEAD_WINDOW_CYCLE.length]
}

/**
 * @param {number} days
 * @returns {string}
 */
export function newLeadWindowLabel(days) {
  return `New in ${days} days`
}

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Inclusive local-time window: today plus the prior (days - 1) calendar days.
 * @param {string|number|Date|null|undefined} createdAt
 * @param {number} days
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isCreatedWithinDays(createdAt, days, now = new Date()) {
  if (createdAt == null || createdAt === '') return false
  if (!Number.isFinite(days) || days < 1) return false
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt)
  if (Number.isNaN(created.getTime())) return false
  const start = startOfDay(now)
  start.setDate(start.getDate() - (days - 1))
  return created >= start && created <= now
}
