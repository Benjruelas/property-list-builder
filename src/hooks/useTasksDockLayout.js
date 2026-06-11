import { useLayoutEffect, useRef, useState } from 'react'
import { isDesktopTaskDockEnabled } from '@/navigation/taskDock'

const SWAP_ANIM_MS = 220
const LEAVE_ANIM_MS = 280
const CLOSE_ANIM_MS = 120

function clearDockAttrs(root) {
  root.removeAttribute('data-tasks-docked')
  root.removeAttribute('data-tasks-dock-root')
  root.removeAttribute('data-tasks-dock-swap')
  root.removeAttribute('data-tasks-dock-leave')
}

function clearCloseSettled(root) {
  root.removeAttribute('data-tasks-panel-close-settled')
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

/**
 * Sets document data attributes + CSS vars for desktop Tasks + primary panel side-by-side layout.
 * @param {{ tasksDocked: boolean, primaryRoot: string | null }} layout
 * @param {boolean} isTasksOpen
 */
export function useTasksDockLayout(layout, isTasksOpen) {
  const { tasksDocked, primaryRoot } = layout ?? { tasksDocked: false, primaryRoot: null }
  const [dockLeaving, setDockLeaving] = useState(false)
  const wasDockedRef = useRef(false)
  const prevPrimaryRef = useRef(null)
  const leaveTimerRef = useRef(null)
  const closeSettleTimerRef = useRef(null)

  useLayoutEffect(() => {
    const root = document.documentElement
    const active = tasksDocked && primaryRoot && isDesktopTaskDockEnabled()
    const wasDocked = wasDockedRef.current
    const leavingPrimary = prevPrimaryRef.current

    if (leaveTimerRef.current) {
      window.clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }

    const swapPrimary =
      active &&
      wasDocked &&
      leavingPrimary != null &&
      primaryRoot !== leavingPrimary

    if (active) {
      setDockLeaving(false)
      syncTasksDockAttrs(tasksDocked, primaryRoot, swapPrimary)
      wasDockedRef.current = true
      prevPrimaryRef.current = primaryRoot
    } else if (wasDocked && leavingPrimary && isDesktopTaskDockEnabled()) {
      setDockLeaving(true)
      beginDockLeave(root, leavingPrimary)
      wasDockedRef.current = false
      leaveTimerRef.current = window.setTimeout(() => {
        clearDockAttrs(root)
        prevPrimaryRef.current = null
        leaveTimerRef.current = null
        setDockLeaving(false)
      }, LEAVE_ANIM_MS)
    } else {
      setDockLeaving(false)
      clearDockAttrs(root)
      wasDockedRef.current = false
      prevPrimaryRef.current = null
    }

    let swapTimer
    if (swapPrimary) {
      swapTimer = window.setTimeout(() => {
        root.removeAttribute('data-tasks-dock-swap')
      }, SWAP_ANIM_MS)
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
        wasDockedRef.current = false
        prevPrimaryRef.current = null
        return
      }
      if (active) syncTasksDockAttrs(tasksDocked, primaryRoot, false)
    }
    mq.addEventListener('change', onChange)
    return () => {
      if (swapTimer) window.clearTimeout(swapTimer)
      if (leaveTimerRef.current) window.clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
      mq.removeEventListener('change', onChange)
      clearDockAttrs(root)
      setDockLeaving(false)
    }
  }, [tasksDocked, primaryRoot])

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
