/**
 * Progressive disclosure for the floating action bar.
 * Wider viewports surface more primary actions; overflow stays in Menu.
 */

/** @typedef {'pipes' | 'tasks' | 'schedule' | 'leads' | 'deals' | 'quotes' | 'activity' | 'menu'} ActionBarItemId */

/** Primary items in priority order (menu is always appended last). */
export const PRIMARY_BAR_ORDER = [
  'pipes',
  'tasks',
  'schedule',
  'leads',
  'deals',
  'quotes',
  'activity',
]

/**
 * How many primary items (excluding Menu) to show at a given viewport width.
 * Smallest (phone): 3 → Pipes, Tasks, Schedule, Menu.
 * Largest (wide desktop): 7 → …Quotes, Activity, Menu.
 * @param {number} width
 */
export function getPrimaryBarCount(width) {
  if (width < 768) return 3
  if (width < 960) return 3
  if (width < 1100) return 4
  if (width < 1280) return 5
  if (width < 1440) return 6
  return 7
}

/**
 * @param {number} width
 * @returns {{ barIds: ActionBarItemId[], overflowPrimaryIds: ActionBarItemId[] }}
 */
export function resolveActionBarLayout(width) {
  const count = getPrimaryBarCount(width)
  const barIds = [...PRIMARY_BAR_ORDER.slice(0, count), 'menu']
  const barSet = new Set(barIds)
  const overflowPrimaryIds = PRIMARY_BAR_ORDER.filter((id) => !barSet.has(id))
  return { barIds, overflowPrimaryIds }
}
