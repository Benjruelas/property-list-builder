import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  getQueuedCount,
  subscribeOutbox,
  flushOutbox,
  setOutboxGetToken,
  subscribeOutboxReplay,
} from '../utils/offlineMutate'
import { scheduleUserDataSync } from '../utils/userDataSync'
import { showToast } from '../components/ui/toast'

const OfflineStatusContext = createContext({
  online: true,
  queuedCount: 0,
  syncing: false,
  lastSyncedAt: null,
})

export function useOfflineStatus() {
  return useContext(OfflineStatusContext)
}

/**
 * Tracks navigator.onLine + fetch-failure hints, outbox queue depth, and
 * flushes the outbox + user-data blob when connectivity returns.
 */
export function OfflineStatusProvider({ getToken, children }) {
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  )
  const [queuedCount, setQueuedCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState(null)

  const refreshCount = useCallback(() => {
    getQueuedCount()
      .then((n) => setQueuedCount(n))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (getToken) setOutboxGetToken(getToken)
  }, [getToken])

  useEffect(() => {
    refreshCount()
    return subscribeOutbox(() => refreshCount())
  }, [refreshCount])

  useEffect(() => {
    return subscribeOutboxReplay((event) => {
      if (event?.type === 'sync-complete' && event.flushed > 0) {
        setLastSyncedAt(Date.now())
      }
      refreshCount()
    })
  }, [refreshCount])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const goOnline = async () => {
      setOnline(true)
      setSyncing(true)
      try {
        if (getToken) {
          scheduleUserDataSync(getToken)
          await flushOutbox(getToken)
        }
      } finally {
        setSyncing(false)
        refreshCount()
      }
    }
    const goOffline = () => {
      setOnline(false)
      showToast('You\'re offline — changes will sync when you reconnect', 'warning', 4000)
    }

    // Detect offline via failed fetches (navigator.onLine can be wrong).
    const onFetchFailure = () => {
      if (navigator.onLine === false) setOnline(false)
    }
    window.addEventListener('offline-detected', onFetchFailure)

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    if (navigator.onLine) {
      // Warm flush in case items were left from a previous session.
      goOnline()
    }
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('offline-detected', onFetchFailure)
    }
  }, [getToken, refreshCount])

  const value = useMemo(
    () => ({ online, queuedCount, syncing, lastSyncedAt }),
    [online, queuedCount, syncing, lastSyncedAt],
  )

  return (
    <OfflineStatusContext.Provider value={value}>
      {children}
    </OfflineStatusContext.Provider>
  )
}
