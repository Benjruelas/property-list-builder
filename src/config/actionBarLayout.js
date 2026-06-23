/**
 * Progressive disclosure for the floating action bar.
 * Mobile/tablet: wider viewports surface more primary actions; overflow stays in Menu.
 * Desktop (768+): every action on the bar — no Menu.
 */

/** @typedef {'pipes' | 'tasks' | 'schedule' | 'leads' | 'deals' | 'quotes' | 'forms' | 'reports' | 'lists' | 'activity' | 'paths' | 'outreach' | 'settings' | 'menu'} ActionBarItemId */

export const DESKTOP_MIN_WIDTH = 768

/** Primary items in priority order (menu is appended last on mobile only). */
export const PRIMARY_BAR_ORDER = [
  'pipes',
  'tasks',
  'schedule',
  'leads',
  'deals',
  'quotes',
  'forms',
  'reports',
  'lists',
  'activity',
]

/** Extra items surfaced on the bar at desktop widths (formerly menu-only). */
export const DESKTOP_EXTRA_BAR_ORDER = ['paths', 'outreach', 'settings']

export const DESKTOP_BAR_ORDER = [...PRIMARY_BAR_ORDER, ...DESKTOP_EXTRA_BAR_ORDER]

/**
 * How many primary items (excluding Menu) to show at a given viewport width.
 * Smallest (phone): 3 → Pipes, Tasks, Schedule, Menu.
 * @param {number} width
 */
export function getPrimaryBarCount(width) {
  if (width >= DESKTOP_MIN_WIDTH) return DESKTOP_BAR_ORDER.length
  return 3
}

/**
 * @param {number} width
 * @returns {{ barIds: ActionBarItemId[], overflowPrimaryIds: ActionBarItemId[], isDesktop: boolean }}
 */
export function resolveActionBarLayout(width) {
  if (width >= DESKTOP_MIN_WIDTH) {
    return {
      barIds: [...DESKTOP_BAR_ORDER],
      overflowPrimaryIds: [],
      isDesktop: true,
    }
  }
  const count = getPrimaryBarCount(width)
  const barIds = [...PRIMARY_BAR_ORDER.slice(0, count), 'menu']
  const barSet = new Set(barIds)
  const overflowPrimaryIds = PRIMARY_BAR_ORDER.filter((id) => !barSet.has(id))
  return { barIds, overflowPrimaryIds, isDesktop: false }
}
