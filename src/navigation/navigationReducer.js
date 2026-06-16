import {
  NAV_ACTIONS,
  createInitialState,
  frameRoot,
  isNestedChildFrame,
  ROOT_PANEL_TYPES,
} from './types.js'
import { appendTrailingTasks, splitTrailingTasks } from './taskDock.js'

export { createInitialState }

/**
 * Pure navigation reducer — single source of truth for panel stack, map overlays, modals.
 * @param {ReturnType<typeof createInitialState>} state
 * @param {{ type: string, payload?: unknown }} action
 */
export function navigationReducer(state, action) {
  switch (action.type) {
    case NAV_ACTIONS.PUSH: {
      const frame = /** @type {import('./types.js').NavFrame} */ (action.payload)
      return { ...state, navStack: [...state.navStack, frame], meta: { ...state.meta, showMenu: false } }
    }
    case NAV_ACTIONS.REPLACE_STACK: {
      const frames = /** @type {import('./types.js').NavFrame[]} */ (action.payload)
      return {
        ...state,
        navStack: frames,
        meta: { ...state.meta, showMenu: false },
      }
    }
    case NAV_ACTIONS.POP:
      return popNavStack(state)
    case NAV_ACTIONS.RESET_TO_MAP:
      return {
        ...state,
        navStack: [],
        mapOverlayStack: state.mapOverlayStack.filter((o) => o.type === 'popup'),
        meta: { ...state.meta, showMenu: false },
      }
    case NAV_ACTIONS.PUSH_OVERLAY: {
      const overlay = /** @type {import('./types.js').MapOverlayFrame} */ (action.payload)
      return { ...state, mapOverlayStack: [...state.mapOverlayStack, overlay] }
    }
    case NAV_ACTIONS.POP_OVERLAY:
      return {
        ...state,
        mapOverlayStack: state.mapOverlayStack.slice(0, -1),
      }
    case NAV_ACTIONS.REPLACE_OVERLAY: {
      const overlay = /** @type {import('./types.js').MapOverlayFrame | null} */ (action.payload)
      return {
        ...state,
        mapOverlayStack: overlay ? [overlay] : [],
      }
    }
    case NAV_ACTIONS.CLEAR_OVERLAYS:
      return { ...state, mapOverlayStack: [] }
    case NAV_ACTIONS.DISMISS_PARCEL_HAIL_PANELS:
      return {
        ...state,
        mapOverlayStack: state.mapOverlayStack.filter(
          (o) => o.type !== 'parcelDetails' && o.type !== 'hail'
        ),
      }
    case NAV_ACTIONS.PUSH_MODAL: {
      const modal = /** @type {import('./types.js').ModalFrame} */ (action.payload)
      return { ...state, modalStack: [...state.modalStack, modal] }
    }
    case NAV_ACTIONS.POP_MODAL:
      return { ...state, modalStack: state.modalStack.slice(0, -1) }
    case NAV_ACTIONS.REPLACE_MODALS: {
      const modals = /** @type {import('./types.js').ModalFrame[]} */ (action.payload)
      return { ...state, modalStack: modals }
    }
    case NAV_ACTIONS.SET_META: {
      const patch = /** @type {Record<string, unknown>} */ (action.payload)
      return { ...state, meta: { ...state.meta, ...patch } }
    }
    case NAV_ACTIONS.PATCH_TOP_OVERLAY: {
      const patch = /** @type {Record<string, unknown>} */ (action.payload)
      const stack = state.mapOverlayStack
      if (!stack.length) return state
      const next = [...stack]
      next[next.length - 1] = { ...next[next.length - 1], ...patch }
      return { ...state, mapOverlayStack: next }
    }
    case NAV_ACTIONS.PATCH_NAV_FRAME: {
      const { frameType, patch } = /** @type {{ frameType: string, patch: Record<string, unknown> }} */ (action.payload)
      let found = false
      const navStack = state.navStack.map((f) => {
        if (f.type === frameType) {
          found = true
          return { ...f, ...patch }
        }
        return f
      })
      if (!found) return state
      return { ...state, navStack }
    }
    default:
      return state
  }
}

/**
 * Activity → destination → detail (e.g. activity, leads, leads.detail): back from detail
 * returns to Activity, not the intermediate list/pipe panel.
 */
function shouldReturnToActivityOnDetailPop(coreStack, topType) {
  if (coreStack[0]?.type !== 'activity') return false

  // Standalone detail from activity feed: [activity, leads.detail] or [activity, deals.detail]
  if (coreStack.length === 2 && isNestedChildFrame(topType)) {
    return true
  }

  if (coreStack.length !== 3) return false
  const destination = coreStack[1]
  const destRoot = frameRoot(destination.type)
  if (!ROOT_PANEL_TYPES.has(destRoot) || destRoot === 'activity' || destRoot === 'schedule') return false
  return frameRoot(topType) === destRoot
}

/**
 * Back resolution matching legacy panel back behavior.
 * @param {ReturnType<typeof createInitialState>} state
 */
function popNavStack(state) {
  const { navStack } = state
  if (navStack.length === 0) return state

  const { tasksFrames, coreStack } = splitTrailingTasks(navStack)
  if (coreStack.length === 0) return state

  const top = coreStack[coreStack.length - 1]
  const topType = top.type
  let newCore

  // 1. Nested child frames (leads.detail, pipes.deal, forms.edit, etc.)
  if (isNestedChildFrame(topType) && topType !== 'schedule') {
    if (shouldReturnToActivityOnDetailPop(coreStack, topType)) {
      newCore = [{ type: 'activity' }]
    } else {
      newCore = coreStack.slice(0, -1)
    }
  } else if (topType === 'schedule.lead') {
    // schedule.lead → schedule (or Activity when opened from activity feed)
    if (shouldReturnToActivityOnDetailPop(coreStack, topType)) {
      newCore = [{ type: 'activity' }]
    } else {
      newCore = coreStack.slice(0, -1)
    }
  } else if (topType === 'schedule' && coreStack.length > 1) {
    // Schedule with opener below → pop schedule only
    newCore = coreStack.slice(0, -1)
  } else if (coreStack.length >= 2 && coreStack[0].type === 'activity') {
    // Activity parent: popping root destination returns to activity
    const isRootPanel = ROOT_PANEL_TYPES.has(topType) && topType !== 'activity'
    if (isRootPanel) {
      newCore = coreStack.slice(0, -1)
    } else {
      newCore = coreStack.slice(0, -1)
    }
  } else {
    newCore = coreStack.slice(0, -1)
  }

  return { ...state, navStack: appendTrailingTasks(newCore, tasksFrames) }
}

/** Close all panels and overlays — equivalent to closeAllPanelsForMap. */
export function resetToMapFull(state) {
  return {
    ...createInitialState(),
    meta: { ...state.meta, showMenu: false },
  }
}

/** Build stack after closePrimaryPanelsExcept(keep). */
export function buildStackFromKeep(currentStack, keep, newFrames = []) {
  const keepKeys = Object.keys(keep).filter((k) => keep[k])
  const kept = []

  for (const frame of currentStack) {
    const root = frameRoot(frame.type)
    if (keepKeys.includes(root)) {
      kept.push(frame)
    } else if (keepKeys.includes('list') && (frame.type === 'lists' || frame.type === 'lists.parcels')) {
      kept.push(frame)
    } else if (keepKeys.includes('pipes') && root === 'pipes') {
      kept.push(frame)
    } else if (keepKeys.includes('deals') && root === 'deals') {
      kept.push(frame)
    } else if (keepKeys.includes('schedule') && root === 'schedule') {
      kept.push(frame)
    }
  }

  // Deduplicate: only keep contiguous prefix that matches keep policy
  const filtered = filterStackForKeep(currentStack, keep)
  return [...filtered, ...newFrames]
}

function filterStackForKeep(stack, keep) {
  if (!stack.length) return []

  const result = []
  for (const frame of stack) {
    const root = frameRoot(frame.type)
    const shouldKeep =
      (keep.list && (frame.type === 'lists' || frame.type === 'lists.parcels')) ||
      (keep.leads && root === 'leads') ||
      (keep.deals && root === 'deals') ||
      (keep.pipes && root === 'pipes') ||
      (keep.tasks && root === 'tasks') ||
      (keep.schedule && root === 'schedule') ||
      (keep.paths && root === 'paths') ||
      (keep.forms && root === 'forms') ||
      (keep.quotes && root === 'quotes') ||
      (keep.reports && root === 'reports') ||
      (keep.teams && root === 'teams') ||
      (keep.settings && root === 'settings') ||
      (keep.outreach && root === 'outreach') ||
      (keep.skipTraced && root === 'skipTraced') ||
      (keep.activity && root === 'activity')

    if (shouldKeep) result.push(frame)
    else break
  }
  return result
}

/** Return to activity from any activity-origin destination, keeping docked Tasks. */
export function returnToActivityStack(currentStack = []) {
  const { tasksFrames } = splitTrailingTasks(currentStack)
  return appendTrailingTasks([{ type: 'activity' }], tasksFrames)
}
