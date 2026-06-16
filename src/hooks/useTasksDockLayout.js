import { useLayoutEffect, useRef, useState } from 'react'
import { isDesktopTaskDockEnabled } from '@/navigation/taskDock'

const SWAP_ANIM_MS = 380
const LEAVE_ANIM_MS = 380
const CLOSE_ANIM_MS = 380
const FADE_ANIM_MS = 480

function clearDockAttrs(root) {
  root.removeAttribute('data-tasks-docked')
  root.removeAttribute('data-tasks-dock-root')
  root.removeAttribute('data-tasks-dock-swap')
  root.removeAttribute('data-tasks-dock-leave')
}

function clearPanelFade(root) {
  root.removeAttribute('data-tasks-panel-fade')
  root.style.removeProperty('--tasks-layout-width')
  root.style.removeProperty('--tasks-layout-height')
}

function setPanelFade(root, phase) {
  clearPanelFade(root)
  // Reflow so repeated open/close retriggers the CSS keyframe.
  void root.offsetHeight
  root.dataset.tasksPanelFade = phase
}

function clearCloseSettled(root) {
  root.removeAttribute('data-tasks-panel-close-settled')
}

function syncTasksSolo(root, isSolo) {
  if (isSolo) {
    root.dataset.tasksSolo = '1'
  } else {
    root.removeAttribute('data-tasks-solo')
  }
}

function syncTasksDockAttrs(docked, primaryRoot, swapPrimary) {
  const root = document.documentElement
  const active = docked && primaryRoot && isDesktopTaskDockEnabled()
  if (!active) {
    clearDockAttrs(root)
    return
  }
  root.removeAttribute('data-tasks-dock-leave')
  root.dataset.tasksDocked = '1'
  root.dataset.tasksDockRoot = primaryRoot
  if (swapPrimary) {
    root.dataset.tasksDockSwap = '1'
  } else {
    root.removeAttribute('data-tasks-dock-swap')
  }
}

function beginDockLeave(root, primaryRoot) {
  root.removeAttribute('data-tasks-docked')
  root.removeAttribute('data-tasks-dock-swap')
  root.dataset.tasksDockLeave = '1'
  root.dataset.tasksDockRoot = primaryRoot
}

function syncTasksSoloDetail(root, soloDetailRoot) {
  if (soloDetailRoot) {
    root.dataset.tasksSoloDetail = '1'
    root.dataset.tasksSoloDetailRoot = soloDetailRoot
  } else {
    root.removeAttribute('data-tasks-solo-detail')
    root.removeAttribute('data-tasks-solo-detail-root')
  }
}

/**
 * Sets document data attributes + CSS vars for desktop Tasks layout:
 * solo on the right when alone, docked beside a primary panel when paired.
 * @param {{ tasksDocked: boolean, primaryRoot: string | null, tasksSoloDetail?: boolean, soloDetailRoot?: string | null }} layout
 * @param {boolean} isTasksOpen
 */
export function useTasksDockLayout(layout, isTasksOpen) {
  const {
    tasksDocked,
    primaryRoot,
    tasksSoloDetail = false,
    soloDetailRoot = null,
  } = layout ?? { tasksDocked: false, primaryRoot: null, tasksSoloDetail: false, soloDetailRoot: null }
  const [dockLeaving, setDockLeaving] = useState(false)
  const wasDockedRef = useRef(false)
  const prevPrimaryRef = useRef(null)
  const leaveTimerRef = useRef(null)
  const closeSettleTimerRef = useRef(null)
  const fadeTimerRef = useRef(null)
  const wasTasksOpenRef = useRef(false)
  const isTasksOpenRef = useRef(isTasksOpen)
  isTasksOpenRef.current = isTasksOpen

  useLayoutEffect(() => {
    const root = document.documentElement
    const desktop = isDesktopTaskDockEnabled()

    if (leaveTimerRef.current) {
      window.clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }

    let swapTimer

    if (tasksSoloDetail && soloDetailRoot && desktop) {
      setDockLeaving(false)
      clearDockAttrs(root)
      syncTasksSolo(root, true)
      syncTasksSoloDetail(root, soloDetailRoot)
      wasDockedRef.current = false
      prevPrimaryRef.current = null
    } else {
      syncTasksSoloDetail(root, null)

      const active = tasksDocked && primaryRoot && desktop
      const wasDocked = wasDockedRef.current
      const leavingPrimary = prevPrimaryRef.current
      const swapPrimary =
        active &&
        wasDocked &&
        leavingPrimary != null &&
        primaryRoot !== leavingPrimary

      if (active) {
        setDockLeaving(false)
        syncTasksDockAttrs(tasksDocked, primaryRoot, swapPrimary)
        syncTasksSolo(root, false)
        wasDockedRef.current = true
        prevPrimaryRef.current = primaryRoot
      } else if (!isTasksOpen && wasDocked && leavingPrimary && desktop) {
        // Tasks closing beside primary — primary expands (undock leave)
        setDockLeaving(true)
        syncTasksSolo(root, false)
        beginDockLeave(root, leavingPrimary)
        wasDockedRef.current = false
        leaveTimerRef.current = window.setTimeout(() => {
          clearDockAttrs(root)
          prevPrimaryRef.current = null
          leaveTimerRef.current = null
          setDockLeaving(false)
        }, LEAVE_ANIM_MS)
      } else if (isTasksOpen && wasDocked && !active && desktop) {
        // Primary closed while Tasks stays open — shrink to solo rail immediately
        setDockLeaving(false)
        clearDockAttrs(root)
        syncTasksSolo(root, true)
        wasDockedRef.current = false
        prevPrimaryRef.current = null
        root.style.removeProperty('--tasks-layout-width')
        root.style.removeProperty('--tasks-layout-height')
      } else {
        setDockLeaving(false)
        clearDockAttrs(root)
        wasDockedRef.current = false
        prevPrimaryRef.current = null
        if (isTasksOpen && desktop) {
          syncTasksSolo(root, true)
        }
      }

      if (isTasksOpen && desktop && !wasTasksOpenRef.current) {
        setPanelFade(root, 'in')
        if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current)
        fadeTimerRef.current = window.setTimeout(() => {
          clearPanelFade(root)
          fadeTimerRef.current = null
        }, FADE_ANIM_MS)
      } else if (!isTasksOpen && wasTasksOpenRef.current && desktop) {
        setPanelFade(root, 'out')
        if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current)
        fadeTimerRef.current = window.setTimeout(() => {
          clearPanelFade(root)
          fadeTimerRef.current = null
        }, FADE_ANIM_MS)
      }
      wasTasksOpenRef.current = isTasksOpen

      if (swapPrimary) {
        swapTimer = window.setTimeout(() => {
          root.removeAttribute('data-tasks-dock-swap')
        }, SWAP_ANIM_MS)
      }
    }

    if (typeof window === 'undefined') {
      return () => {
        if (swapTimer) window.clearTimeout(swapTimer)
        if (leaveTimerRef.current) window.clearTimeout(leaveTimerRef.current)
      }
    }

    const mq = window.matchMedia('(min-width: 768px)')
    const onChange = () => {
      if (!isDesktopTaskDockEnabled()) {
        if (leaveTimerRef.current) window.clearTimeout(leaveTimerRef.current)
        leaveTimerRef.current = null
        clearDockAttrs(root)
        root.removeAttribute('data-tasks-solo')
        root.removeAttribute('data-tasks-solo-detail')
        root.removeAttribute('data-tasks-solo-detail-root')
        wasDockedRef.current = false
        prevPrimaryRef.current = null
        return
      }
      if (tasksSoloDetail && soloDetailRoot) {
        clearDockAttrs(root)
        syncTasksSolo(root, true)
        syncTasksSoloDetail(root, soloDetailRoot)
        return
      }
      syncTasksSoloDetail(root, null)
      const active = tasksDocked && primaryRoot
      if (active) syncTasksDockAttrs(tasksDocked, primaryRoot, false)
      else if (isTasksOpenRef.current) syncTasksSolo(root, true)
    }
    mq.addEventListener('change', onChange)
    return () => {
      if (swapTimer) window.clearTimeout(swapTimer)
      if (leaveTimerRef.current) window.clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
      if (fadeTimerRef.current) {
        window.clearTimeout(fadeTimerRef.current)
        fadeTimerRef.current = null
      }
      mq.removeEventListener('change', onChange)
    }
  }, [tasksDocked, primaryRoot, tasksSoloDetail, soloDetailRoot, isTasksOpen])

  useLayoutEffect(() => {
    return () => {
      clearDockAttrs(document.documentElement)
      document.documentElement.removeAttribute('data-tasks-solo')
      document.documentElement.removeAttribute('data-tasks-solo-detail')
      document.documentElement.removeAttribute('data-tasks-solo-detail-root')
      document.documentElement.removeAttribute('data-tasks-panel-close-settled')
      clearPanelFade(document.documentElement)
    }
  }, [])

  useLayoutEffect(() => {
    const root = document.documentElement

    if (closeSettleTimerRef.current) {
      window.clearTimeout(closeSettleTimerRef.current)
      closeSettleTimerRef.current = null
    }

    if (isTasksOpen) {
      clearCloseSettled(root)
      return undefined
    }

    const settleMs = dockLeaving ? LEAVE_ANIM_MS : CLOSE_ANIM_MS
    closeSettleTimerRef.current = window.setTimeout(() => {
      root.dataset.tasksPanelCloseSettled = '1'
      root.removeAttribute('data-tasks-solo')
      closeSettleTimerRef.current = null
    }, settleMs)

    return () => {
      if (closeSettleTimerRef.current) {
        window.clearTimeout(closeSettleTimerRef.current)
        closeSettleTimerRef.current = null
      }
    }
  }, [isTasksOpen, dockLeaving])

  return { dockLeaving }
}
