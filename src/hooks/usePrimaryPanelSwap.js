import { useInsertionEffect, useRef, useState } from 'react'

const PRIMARY_SWAP_MS = 280

/**
 * Coordinates primary panel crossfades when switching between list panels
 * (Leads ↔ Deals ↔ Reports, etc.).
 *
 * Uses useInsertionEffect so swap flags exist before Radix Presence samples
 * styles in child useLayoutEffect hooks. Also exposes `outgoingRoot` so the
 * outgoing panel can keep `open={true}` until the crossfade finishes.
 *
 * @param {string | null | undefined} primaryRoot
 * @returns {{ active: boolean, outgoingRoot: string | null }}
 */
export function usePrimaryPanelSwap(primaryRoot) {
  const prevPrimaryRef = useRef(primaryRoot ?? null)
  const swapTimerRef = useRef(null)
  const [swap, setSwap] = useState({ active: false, outgoingRoot: null })

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
      root.dataset.primaryPanelSwapOutgoing = prev
      setSwap({ active: true, outgoingRoot: prev })
      swapTimerRef.current = window.setTimeout(() => {
        root.removeAttribute('data-primary-panel-swap')
        root.removeAttribute('data-primary-panel-swap-outgoing')
        setSwap({ active: false, outgoingRoot: null })
        swapTimerRef.current = null
      }, PRIMARY_SWAP_MS)
    } else if (!root.dataset.primaryPanelSwap) {
      root.removeAttribute('data-primary-panel-swap-outgoing')
      setSwap((s) => (s.active ? { active: false, outgoingRoot: null } : s))
    }

    prevPrimaryRef.current = next

    return () => {
      if (swapTimerRef.current) {
        window.clearTimeout(swapTimerRef.current)
        swapTimerRef.current = null
      }
    }
  }, [primaryRoot])

  return swap
}
