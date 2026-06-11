import { useEffect, useState } from 'react'

/**
 * Keep a lazy panel mounted after its first open so reopening does not remount the full tree.
 * @param  {...boolean} openFlags — any true value means the panel (or a nested frame) is active
 */
export function useStickyPanelMount(...openFlags) {
  const active = openFlags.some(Boolean)
  const [mounted, setMounted] = useState(active)
  useEffect(() => {
    if (active) setMounted(true)
  }, [active])
  return mounted || active
}
