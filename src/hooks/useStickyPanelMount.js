import { useEffect, useState, useRef } from 'react'

/** How long a closed panel stays mounted before being released (ms). */
const IDLE_UNMOUNT_MS = 45_000
const MAX_LRU_PANELS = 4

/** @type {Map<string, number>} */
const lruAccess = new Map()

function touchPanel(id) {
  lruAccess.set(id, Date.now())
  if (lruAccess.size <= MAX_LRU_PANELS) return
  const sorted = [...lruAccess.entries()].sort((a, b) => a[1] - b[1])
  while (sorted.length > MAX_LRU_PANELS) {
    const [drop] = sorted.shift()
    lruAccess.delete(drop)
  }
}

function isPanelEvicted(id) {
  return lruAccess.size > MAX_LRU_PANELS && !lruAccess.has(id)
}

/**
 * LRU-bounded sticky panel mount — keeps recently used panels warm but caps memory.
 * @param {string} panelId — stable id for LRU tracking
 * @param  {...boolean} openFlags
 */
export function useLruPanelMount(panelId, ...openFlags) {
  const active = openFlags.some(Boolean)
  const [mounted, setMounted] = useState(active)
  const idRef = useRef(panelId)

  useEffect(() => {
    idRef.current = panelId
  }, [panelId])

  useEffect(() => {
    if (active) {
      touchPanel(panelId)
      setMounted(true)
      return undefined
    }
    if (!mounted) return undefined
    const t = setTimeout(() => {
      if (isPanelEvicted(idRef.current)) {
        setMounted(false)
      }
    }, IDLE_UNMOUNT_MS)
    return () => clearTimeout(t)
  }, [active, mounted, panelId])

  return mounted || active
}

/** @deprecated prefer useLruPanelMount with a panel id */
export function useStickyPanelMount(...openFlags) {
  const active = openFlags.some(Boolean)
  const [mounted, setMounted] = useState(active)

  useEffect(() => {
    if (active) {
      setMounted(true)
      return undefined
    }
    if (!mounted) return undefined
    const t = setTimeout(() => setMounted(false), IDLE_UNMOUNT_MS)
    return () => clearTimeout(t)
  }, [active, mounted])

  return mounted || active
}
