/**
 * Portaled options menus must render inside #modal-root above open dialogs.
 * Z-index is resolved dynamically from the trigger + open dialog stack.
 */

export const OPTIONS_MENU_MIN_Z = 10032
export const OPTIONS_MENU_Z_OFFSET = 10
export const VIEWPORT_PAD = 8

export function getOptionsMenuPortalContainer() {
  if (typeof document === 'undefined') return null
  return document.getElementById('modal-root') || document.body
}

function readZIndex(el) {
  if (!el) return NaN
  const z = parseInt(window.getComputedStyle(el).zIndex, 10)
  return Number.isNaN(z) ? NaN : z
}

/**
 * Highest relevant stacking z-index from trigger ancestors and open dialogs.
 */
export function resolveOptionsMenuZIndex(anchorEl) {
  let maxZ = 10021 // topLayer dialog content baseline

  const bump = (z) => {
    if (!Number.isNaN(z) && z > 0) maxZ = Math.max(maxZ, z)
  }

  const root = getOptionsMenuPortalContainer()
  if (root) {
    root.querySelectorAll('[data-app-dialog-backdrop], [role="dialog"]').forEach((node) => {
      bump(readZIndex(node))
    })
  }

  document.body?.querySelectorAll?.('[data-app-dialog-backdrop], [role="dialog"]').forEach((node) => {
    bump(readZIndex(node))
  })

  let node = anchorEl
  while (node && node !== document.documentElement) {
    bump(readZIndex(node))
    node = node.parentElement
  }

  const panel = Math.max(maxZ + OPTIONS_MENU_Z_OFFSET, OPTIONS_MENU_MIN_Z)
  const scrim = panel - 1
  return { panel, scrim, wrapper: scrim - 1 }
}

/**
 * Position menu below trigger, flip above if needed, clamp to viewport.
 */
export function computeOptionsMenuPosition(triggerEl, menuEl, menuWidth = 160) {
  if (!triggerEl) return null
  const rect = triggerEl.getBoundingClientRect()
  let left = rect.right - menuWidth
  if (left < VIEWPORT_PAD) left = VIEWPORT_PAD
  if (left + menuWidth > window.innerWidth - VIEWPORT_PAD) {
    left = window.innerWidth - menuWidth - VIEWPORT_PAD
  }

  let top = rect.bottom + 4
  const menuHeight = menuEl?.getBoundingClientRect?.().height || 88
  if (top + menuHeight > window.innerHeight - VIEWPORT_PAD) {
    top = Math.max(VIEWPORT_PAD, rect.top - menuHeight - 4)
  }

  return { top, left }
}
