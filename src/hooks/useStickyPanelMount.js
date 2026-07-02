import { useEffect, useState } from 'react'

/** How long a closed panel stays mounted before being released (ms). */
const IDLE_UNMOUNT_MS = 90_000

/**
 * Keep a lazy panel mounted after its first open so reopening does not remount
 * the full tree — but release it after it has been closed for a while so idle
 * panels don't hold their DOM/state/memory forever.
 * @param  {...boolean} openFlags — any true value means the panel (or a nested frame) is active
 */
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
