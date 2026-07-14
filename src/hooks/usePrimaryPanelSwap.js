import { useInsertionEffect, useRef } from 'react'

const PRIMARY_SWAP_MS = 220

/**
 * Marks primary↔primary panel navigation on <html> so CSS can avoid a transparent
 * gap over the map (incoming must not fade in from opacity 0).
 *
 * Uses useInsertionEffect so the flag exists before child layout/Presence effects
 * and before paint. Does not use React state — setState mid-swap caused extra
 * flashes in an earlier attempt.
 *
 * @param {string | null | undefined} primaryRoot
 */
export function usePrimaryPanelSwap(primaryRoot) {
  const prevPrimaryRef = useRef(primaryRoot ?? null)
  const swapTimerRef = useRef(null)

  useInsertionEffect(() => {
    const root = document.documentElement
    const next = primaryRoot ?? null
    const prev = prevPrimaryRef.current

    if (swapTimerRef.current) {
      window.clearTimeout(swapTimerRef.current)
      swapTimerRef.current = null
    }

    const swapping = prev != null && next != null && prev !== next
    if (swapping) {
      root.dataset.primaryPanelSwap = '1'
      swapTimerRef.current = window.setTimeout(() => {
        root.removeAttribute('data-primary-panel-swap')
        swapTimerRef.current = null
      }, PRIMARY_SWAP_MS)
    }

    prevPrimaryRef.current = next

    return () => {
      if (swapTimerRef.current) {
        window.clearTimeout(swapTimerRef.current)
        swapTimerRef.current = null
      }
    }
  }, [primaryRoot])
}
