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
export function useTeamDataSync({ enabled, refreshPipelines, refreshLeads }) {
  const refreshRef = useRef({ refreshPipelines, refreshLeads })
  refreshRef.current = { refreshPipelines, refreshLeads }

  useEffect(() => {
    if (!enabled) return

    const runRefresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      refreshRef.current.refreshPipelines?.()
      refreshRef.current.refreshLeads?.()
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
      document.removeEventListener('visibilitychange', onVisibility)
      clearTimeout(timeoutId)
    }
  }, [enabled])
}

export default useTeamDataSync
