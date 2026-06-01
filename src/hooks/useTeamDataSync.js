import { useEffect, useRef } from 'react'

const SYNC_INTERVAL_MS = 30000

/**
 * Poll shared team data while the tab is visible.
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
    const id = setInterval(runRefresh, SYNC_INTERVAL_MS)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(id)
    }
  }, [enabled])
}

export default useTeamDataSync
