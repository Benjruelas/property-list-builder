import { useLayoutEffect, useRef } from 'react'

const PRIMARY_SWAP_MS = 280

/**
 * Coordinates primary panel crossfades when switching between list panels
 * (Leads ↔ Deals ↔ Reports, etc.) without a sequential close-then-open flash.
 *
 * Sets `html[data-primary-panel-swap="1"]` for the duration of the swap so CSS
 * can elevate the incoming panel and run a matched opacity crossfade.
 *
 * @param {string | null | undefined} primaryRoot
 */
export function usePrimaryPanelSwap(primaryRoot) {
  const prevPrimaryRef = useRef(primaryRoot ?? null)
  const swapTimerRef = useRef(null)

  useLayoutEffect(() => {
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
