import { useEffect, useRef, useState } from 'react'
import { CloudOff, CloudUpload, CheckCircle2 } from 'lucide-react'
import { useOfflineStatus } from '../contexts/OfflineStatusContext'

/**
 * Persistent offline / queued-changes indicator.
 * Sits below the safe-area top edge so it doesn't collide with toasts.
 */
export function OfflineBanner() {
  const { online, queuedCount, syncing, lastSyncedAt } = useOfflineStatus()
  const [showSynced, setShowSynced] = useState(false)
  const prevSynced = useRef(lastSyncedAt)

  useEffect(() => {
    if (lastSyncedAt && lastSyncedAt !== prevSynced.current) {
      prevSynced.current = lastSyncedAt
      setShowSynced(true)
      const t = setTimeout(() => setShowSynced(false), 2500)
      return () => clearTimeout(t)
    }
    return undefined
  }, [lastSyncedAt])

  if (online && queuedCount === 0 && !syncing && !showSynced) return null

  let Icon = CloudUpload
  let message = ''
  let tone = 'info'

  if (!online) {
    Icon = CloudOff
    tone = 'warning'
    message = queuedCount > 0
      ? `Offline · ${queuedCount} change${queuedCount === 1 ? '' : 's'} waiting to sync`
      : 'Offline · viewing cached map data'
  } else if (syncing) {
    Icon = CloudUpload
    tone = 'info'
    message = queuedCount > 0
      ? `Syncing ${queuedCount} change${queuedCount === 1 ? '' : 's'}…`
      : 'Syncing…'
  } else if (queuedCount > 0) {
    Icon = CloudUpload
    tone = 'info'
    message = `${queuedCount} change${queuedCount === 1 ? '' : 's'} waiting to sync`
  } else if (showSynced) {
    Icon = CheckCircle2
    tone = 'success'
    message = 'All changes synced'
  }

  const toneClass =
    tone === 'warning'
      ? 'bg-amber-500/95 text-white'
      : tone === 'success'
        ? 'bg-emerald-600/95 text-white'
        : 'bg-sky-600/95 text-white'

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed left-1/2 z-[99990] -translate-x-1/2 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium shadow-md pointer-events-none ${toneClass}`}
      style={{ top: 'calc(56px + env(safe-area-inset-top, 0px))' }}
    >
      <Icon size={14} className={syncing ? 'animate-pulse' : undefined} aria-hidden />
      <span>{message}</span>
    </div>
  )
}
