import { useEffect, useRef } from 'react'

const SYNC_BASE_MS = 30000
const SYNC_JITTER_MS = 10000

function nextSyncDelayMs() {
  return SYNC_BASE_MS + Math.floor(Math.random() * SYNC_JITTER_MS)
}

/**
 * Poll shared team data while the tab is visible.
 * Uses jittered intervals so clients don't sync in lockstep.
 */
export function useTeamDataSync({ enabled, refreshPipelines, refreshLeads, hydrateSharedAssets }) {
  const refreshRef = useRef({ refreshPipelines, refreshLeads, hydrateSharedAssets })
  refreshRef.current = { refreshPipelines, refreshLeads, hydrateSharedAssets }

  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    const runRefresh = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      const { refreshPipelines, refreshLeads, hydrateSharedAssets } = refreshRef.current
      await refreshPipelines?.()
      await refreshLeads?.()
      if (!cancelled) await hydrateSharedAssets?.()
    }

    runRefresh()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') runRefresh()
    }

    document.addEventListener('visibilitychange', onVisibility)

    let timeoutId
    const schedule = () => {
      timeoutId = setTimeout(() => {
        runRefresh()
        schedule()
      }, nextSyncDelayMs())
    }
    schedule()

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      clearTimeout(timeoutId)
    }
  }, [enabled])
}

export default useTeamDataSync
