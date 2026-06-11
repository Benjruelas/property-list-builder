import { isDesktopTaskDockEnabled } from './taskDock.js'

/**
 * @param {string} panelRoot — nav root id (e.g. 'leads', 'tasks', 'lists')
 * @param {boolean} isOpen
 * @param {{ tasksDocked?: boolean, primaryRoot?: string | null } | null | undefined} layout
 * @returns {'primary' | 'tasks' | undefined}
 */
export function resolvePanelDockSlot(panelRoot, isOpen, layout) {
  if (!isOpen || !layout?.tasksDocked || !isDesktopTaskDockEnabled()) return undefined
  if (panelRoot === 'tasks') return 'tasks'
  if (panelRoot === layout.primaryRoot) return 'primary'
  return undefined
}
