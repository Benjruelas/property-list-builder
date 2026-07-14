import { useEffect, useState } from 'react'
import { isPanelChunkLoaded, loadPanelChunk } from '../utils/panelChunks'

/**
 * Wait until a lazy panel chunk is loaded before mounting its Dialog.
 * Avoids Suspense swapping PanelListLoadingShell (dialog #1) for the real panel (dialog #2).
 */
export function useLazyPanelReady(panelKey, active) {
  const [ready, setReady] = useState(() => isPanelChunkLoaded(panelKey))

  useEffect(() => {
    if (!active) return undefined
    if (isPanelChunkLoaded(panelKey)) {
      setReady(true)
      return undefined
    }
    let cancelled = false
    loadPanelChunk(panelKey)
      .then(() => {
        if (!cancelled) setReady(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [active, panelKey])

  return ready
}
