/**
 * Progressive disclosure for the floating action bar.
 * Mobile: Leads, Tasks, Schedule + Menu overflow.
 * Desktop (768+): direct access to core items; CRM / Documents / Tools via Menu.
 */

/** @typedef {'pipes' | 'tasks' | 'schedule' | 'leads' | 'deals' | 'quotes' | 'forms' | 'reports' | 'lists' | 'activity' | 'paths' | 'outreach' | 'settings' | 'photoMode' | 'menu'} ActionBarItemId */

export const DESKTOP_MIN_WIDTH = 768

/** Primary items in priority order (menu is appended last on mobile only). */
export const PRIMARY_BAR_ORDER = [
  'leads',
  'tasks',
  'schedule',
  'pipes',
  'deals',
  'quotes',
  'forms',
  'reports',
  'lists',
  'activity',
]

/** Shown on the bar at desktop widths; CRM/Documents/Tools live in Menu. */
export const DESKTOP_BAR_ORDER = [
  'leads',
  'tasks',
  'schedule',
  'activity',
  'photoMode',
  'settings',
  'menu',
]

/** Desktop menu overflow — grouped in ActionBarMenu. */
export const DESKTOP_MENU_OVERFLOW = [
  'pipes',
  'deals',
  'quotes',
  'forms',
  'reports',
  'lists',
  'paths',
  'outreach',
]

/**
 * How many primary items (excluding Menu) to show at a given viewport width.
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
      overflowPrimaryIds: [...DESKTOP_MENU_OVERFLOW],
      isDesktop: true,
    }
  }
  const count = getPrimaryBarCount(width)
  const barIds = [...PRIMARY_BAR_ORDER.slice(0, count), 'menu']
  const barSet = new Set(barIds)
  const overflowPrimaryIds = PRIMARY_BAR_ORDER.filter((id) => !barSet.has(id))
  return { barIds, overflowPrimaryIds, isDesktop: false }
}
