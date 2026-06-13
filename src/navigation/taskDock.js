import { frameRoot } from './types.js'

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
  if (navStack.length > 1 && frameRoot(last.type) === 'tasks') {
    return { tasksFrames: [last], coreStack: navStack.slice(0, -1) }
  }
  return { tasksFrames: [], coreStack: navStack }
}

export function appendTrailingTasks(coreStack, tasksFrames) {
  if (!tasksFrames?.length) return coreStack
  return [...coreStack, ...tasksFrames]
}

export function shouldKeepTasksWhenOpening(stack) {
  return isDesktopTaskDockEnabled() && stackHasTasks(stack)
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

/**
 * Primary panel to dock beside Tasks (left side). Scans the full stack so a
 * stacked schedule/forms overlay does not hide an underlying leads/deals panel.
 * @param {import('./types.js').NavFrame[]} stack
 */
export function findDockablePrimaryRoot(stack) {
  if (!stack?.length) return null

  if (stackHasTasks(stack)) {
    const tasksIndex = stack.findLastIndex((f) => frameRoot(f.type) === 'tasks')
    for (let i = tasksIndex - 1; i >= 0; i--) {
      const root = frameRoot(stack[i].type)
      if (TASKS_DOCKABLE_ROOTS.has(root)) return root
    }
    for (let i = tasksIndex + 1; i < stack.length; i++) {
      const root = frameRoot(stack[i].type)
      if (TASKS_DOCKABLE_ROOTS.has(root)) return root
    }
    return null
  }

  for (let i = stack.length - 1; i >= 0; i--) {
    const root = frameRoot(stack[i].type)
    if (root === 'tasks' || root === 'settings') continue
    if (TASKS_DOCKABLE_ROOTS.has(root)) return root
  }
  return null
}
