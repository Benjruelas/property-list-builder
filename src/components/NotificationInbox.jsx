import { useCallback, useEffect, useState } from 'react'
import { Bell, Check, Loader2, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { Button } from './ui/button'
import { fetchNotifications, markNotificationsRead } from '../utils/notifications'
import { cn } from '@/lib/utils'

function formatWhen(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    })
  } catch {
    return ''
  }
}

export function useNotificationInbox({ getToken, currentUser, onNavigate }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)

  const refresh = useCallback(async () => {
    if (!currentUser || !getToken) return
    setLoading(true)
    try {
      const data = await fetchNotifications(getToken)
      setNotifications(data.notifications || [])
      setUnreadCount(data.unreadCount || 0)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [currentUser, getToken])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 60000)
    return () => clearInterval(id)
  }, [refresh])

  useEffect(() => {
    if (open) refresh()
  }, [open, refresh])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (ev) => {
      if (ev.data?.type === 'NOTIFICATION_CLICK') {
        onNavigate?.(ev.data.data)
        refresh()
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [onNavigate, refresh])

  const handleOpenItem = async (n) => {
    if (!n.read && getToken) {
      try {
        const data = await markNotificationsRead(getToken, { ids: [n.id] })
        setNotifications(data.notifications || [])
        setUnreadCount(data.unreadCount || 0)
      } catch {
        /* ignore */
      }
    }
    setOpen(false)
    onNavigate?.(n.data || { type: n.type })
  }

  const handleMarkAllRead = async () => {
    if (!getToken) return
    try {
      const data = await markNotificationsRead(getToken, { markAllRead: true })
      setNotifications(data.notifications || [])
      setUnreadCount(0)
    } catch {
      /* ignore */
    }
  }

  const panel = open && currentUser && typeof document !== 'undefined' ? createPortal(
    <div className="notification-inbox-overlay fixed inset-0 z-[10050]">
      <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
      <div className="notification-inbox-panel map-panel absolute right-4 top-14 w-[min(92vw,380px)] max-h-[70vh] overflow-hidden flex flex-col rounded-xl shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/15">
          <h3 className="font-semibold text-sm">Notifications</h3>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={handleMarkAllRead}>
                <Check className="h-3.5 w-3.5 mr-1" /> Mark all read
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {loading && notifications.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-sm opacity-70">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading…
            </div>
          ) : notifications.length === 0 ? (
            <p className="text-center py-10 text-sm opacity-60 px-4">No notifications yet.</p>
          ) : (
            <ul>
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleOpenItem(n)}
                    className={cn(
                      'w-full text-left px-4 py-3 border-b border-white/10 hover:bg-white/5 transition-colors',
                      !n.read && 'bg-blue-500/10'
                    )}
                  >
                    <div className="font-medium text-sm">{n.title}</div>
                    {n.body && <div className="text-xs opacity-75 mt-0.5 line-clamp-2">{n.body}</div>}
                    <div className="text-[10px] opacity-50 mt-1">{formatWhen(n.createdAt)}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  ) : null

  const openInbox = useCallback(() => setOpen(true), [])

  const MenuItem = useCallback(({ onSelect }) => {
    if (!currentUser) return null
    return (
      <button
        type="button"
        data-tour="menu-notifications"
        onClick={() => {
          onSelect?.()
          setOpen(true)
        }}
        className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
      >
        <Bell className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1">Notifications</span>
        {unreadCount > 0 && (
          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
    )
  }, [currentUser, unreadCount])

  return {
    unreadCount,
    open,
    setOpen,
    openInbox,
    panel,
    MenuItem,
  }
}

/** @deprecated Use useNotificationInbox — kept for any external imports */
export function NotificationInbox(props) {
  const inbox = useNotificationInbox(props)
  if (!props.currentUser) return null
  return (
    <>
      <button
        type="button"
        onClick={() => inbox.setOpen((v) => !v)}
        className="relative map-control-btn flex items-center justify-center"
        title="Notifications"
        aria-label={`Notifications${inbox.unreadCount ? `, ${inbox.unreadCount} unread` : ''}`}
      >
        <Bell className="h-5 w-5" />
        {inbox.unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {inbox.unreadCount > 99 ? '99+' : inbox.unreadCount}
          </span>
        )}
      </button>
      {inbox.panel}
    </>
  )
}

export default NotificationInbox
