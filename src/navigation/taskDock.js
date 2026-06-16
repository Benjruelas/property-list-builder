import { frameRoot, isNestedChildFrame } from './types.js'

/** @param {import('./types.js').NavFrame['type']} type */
function frameMatchesPrimaryRoot(type, rootKey) {
  switch (rootKey) {
    case 'list':
      return type === 'lists' || type === 'lists.parcels'
    case 'leads':
      return frameRoot(type) === 'leads'
    case 'deals':
      return frameRoot(type) === 'deals'
    case 'pipes':
      return frameRoot(type) === 'pipes'
    case 'tasks':
      return type === 'tasks'
    case 'schedule':
      return frameRoot(type) === 'schedule'
    case 'paths':
      return frameRoot(type) === 'paths'
    case 'forms':
      return frameRoot(type) === 'forms'
    case 'quotes':
      return frameRoot(type) === 'quotes'
    case 'reports':
      return frameRoot(type) === 'reports'
    case 'teams':
      return frameRoot(type) === 'teams'
    case 'outreach':
      return frameRoot(type) === 'outreach'
    case 'activity':
      return type === 'activity'
    case 'settings':
      return type === 'settings'
    default:
      return frameRoot(type) === rootKey
  }
}

/** Root panels that can sit beside Tasks on desktop. */
export const TASKS_DOCKABLE_ROOTS = new Set([
  'activity',
  'lists',
  'leads',
  'deals',
  'pipes',
  'quotes',
  'reports',
  'forms',
  'paths',
  'teams',
  'schedule',
  'outreach',
])

const DESKTOP_MIN = '(min-width: 768px)'

/** Maps nav frame root → recipeClosePrimaryExcept keep key. */
export function taskDockKeepKey(root) {
  if (root === 'lists') return 'list'
  return root
}

export function isDesktopTaskDockEnabled() {
  if (typeof window === 'undefined') return false
  return window.matchMedia(DESKTOP_MIN).matches
}

export function stackHasTasks(stack) {
  return stack.some((f) => f.type === 'tasks' || frameRoot(f.type) === 'tasks')
}

/** Tasks dock frame pinned at stack end — excluded from back/pop targeting. */
export function splitTrailingTasks(navStack) {
  if (!navStack?.length) return { tasksFrames: [], coreStack: [] }
  const last = navStack[navStack.length - 1]
  if (frameRoot(last.type) === 'tasks') {
    return { tasksFrames: [last], coreStack: navStack.slice(0, -1) }
  }
  return { tasksFrames: [], coreStack: navStack }
}

export function appendTrailingTasks(coreStack, tasksFrames) {
  if (!tasksFrames?.length) return coreStack
  return [...coreStack, ...tasksFrames]
}

/**
 * Pop a frame when it is top of the core stack (ignoring trailing Tasks dock frame).
 * @param {import('./types.js').NavFrame[]} navStack
 * @param {string} frameType
 */
export function popFrameIfTopOfCore(navStack, frameType) {
  const { tasksFrames, coreStack } = splitTrailingTasks(navStack)
  if (coreStack[coreStack.length - 1]?.type !== frameType) return navStack
  return appendTrailingTasks(coreStack.slice(0, -1), tasksFrames)
}

export function shouldKeepTasksWhenOpening(stack) {
  return isDesktopTaskDockEnabled() && stackHasTasks(stack)
}

/**
 * Standalone lead/deal detail opened beside Tasks (no list parent) — Tasks stays on the right rail.
 * @param {import('./types.js').NavFrame[]} stack
 * @returns {'leads' | 'deals' | null}
 */
export function getStandaloneDetailBesideTasks(stack) {
  const { tasksFrames, coreStack } = splitTrailingTasks(stack)
  if (tasksFrames.length === 0) return null

  const hasLeadsList = stack.some((f) => f.type === 'leads')
  const hasDealsList = stack.some((f) => f.type === 'deals')

  if (!hasDealsList && coreStack.some((f) => f.type === 'deals.detail' || f.type === 'deals.lead')) {
    return 'deals'
  }
  if (!hasLeadsList && coreStack.some((f) => f.type === 'leads.detail')) {
    return 'leads'
  }
  const hasListsPicker = stack.some((f) => f.type === 'lists')
  if (!hasListsPicker && coreStack.some((f) => f.type === 'lists.parcels')) {
    return 'lists'
  }
  return null
}

/**
 * Build keep flags for every dockable panel already in the stack.
 * @param {import('./types.js').NavFrame[]} stack
 */
export function collectDockableKeepFlags(stack) {
  /** @type {Record<string, boolean>} */
  const keep = {}
  for (const frame of stack) {
    const root = frameRoot(frame.type)
    if (root === 'tasks' || root === 'settings') continue
    if (TASKS_DOCKABLE_ROOTS.has(root)) {
      keep[taskDockKeepKey(root)] = true
    }
  }
  return keep
}

/** True when a frame can anchor Tasks dock layout (list/root panel, not a detail overlay). */
function isDockPrimaryFrame(type) {
  const root = frameRoot(type)
  if (!TASKS_DOCKABLE_ROOTS.has(root)) return false
  if (!isNestedChildFrame(type)) return true
  return type === 'lists.parcels'
}

/**
 * Primary panel to dock beside Tasks (left side). Scans the full stack so a
 * stacked schedule/forms overlay does not hide an underlying leads/deals panel.
 * @param {import('./types.js').NavFrame[]} stack
 */
/** @param {import('./types.js').NavFrame[]} stack */
export function stackHasPrimaryRoot(stack, rootKey) {
  return stack.some((f) => frameMatchesPrimaryRoot(f.type, rootKey))
}

/**
 * Remove a primary root panel from the stack, preserving trailing Tasks when docked.
 * @param {import('./types.js').NavFrame[]} currentStack
 * @param {string} rootKey
 */
export function recipeClosePrimaryRoot(currentStack, rootKey) {
  const { tasksFrames, coreStack } = splitTrailingTasks(currentStack)
  const filtered = coreStack.filter((f) => !frameMatchesPrimaryRoot(f.type, rootKey))
  return appendTrailingTasks(filtered, tasksFrames)
}

/** Prime html layout attrs synchronously before React paints (first Tasks open). */
export function primeTasksPanelOpen({ docked = false, primaryRoot = null } = {}) {
  if (!isDesktopTaskDockEnabled()) return
  const root = document.documentElement
  root.removeAttribute('data-tasks-panel-close-settled')
  root.removeAttribute('data-tasks-panel-fade')
  root.removeAttribute('data-tasks-dock-leave')
  root.removeAttribute('data-tasks-dock-swap')
  if (docked && primaryRoot) {
    root.removeAttribute('data-tasks-solo')
    root.dataset.tasksDocked = '1'
    root.dataset.tasksDockRoot = primaryRoot
  } else {
    root.removeAttribute('data-tasks-docked')
    root.removeAttribute('data-tasks-dock-root')
    root.dataset.tasksSolo = '1'
  }
  void root.offsetHeight
  const computed = getComputedStyle(root)
  if (docked && primaryRoot) {
    const w = computed.getPropertyValue('--tasks-dock-width').trim()
    const h = computed.getPropertyValue('--ui-panel-height').trim()
    if (w) root.style.setProperty('--tasks-layout-width', w)
    if (h) root.style.setProperty('--tasks-layout-height', h)
  } else {
    const w = computed.getPropertyValue('--tasks-solo-dock-width').trim()
    const h = computed.getPropertyValue('--tasks-solo-rail-height').trim()
    if (w) root.style.setProperty('--tasks-layout-width', w)
    if (h) root.style.setProperty('--tasks-layout-height', h)
  }
  root.dataset.tasksPanelFade = 'in'
}

export function findDockablePrimaryRoot(stack) {
  if (!stack?.length) return null

  if (stackHasTasks(stack)) {
    const tasksIndex = stack.findLastIndex((f) => frameRoot(f.type) === 'tasks')

    // Activity feed stays the dock anchor when destinations are opened from it
    for (let i = 0; i < tasksIndex; i++) {
      if (stack[i].type === 'activity') return 'activity'
    }

    for (let i = tasksIndex - 1; i >= 0; i--) {
      if (isDockPrimaryFrame(stack[i].type)) return frameRoot(stack[i].type)
    }
    for (let i = tasksIndex + 1; i < stack.length; i++) {
      if (isDockPrimaryFrame(stack[i].type)) return frameRoot(stack[i].type)
    }
    return null
  }

  for (let i = stack.length - 1; i >= 0; i--) {
    const type = stack[i].type
    if (frameRoot(type) === 'tasks' || frameRoot(type) === 'settings') continue
    if (isDockPrimaryFrame(type)) return frameRoot(type)
  }
  return null
}
