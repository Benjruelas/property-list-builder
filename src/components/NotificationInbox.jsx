import { useCallback, useEffect, useState } from 'react'
import { Bell, Check, ChevronDown, Loader2, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { Button } from './ui/button'
import { fetchNotifications, markNotificationsRead } from '../utils/notifications'
import { fetchActivity } from '../utils/activity'
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

function actorInitial(email) {
  const e = (email || '').trim()
  if (!e) return '?'
  return e.charAt(0).toUpperCase()
}

function ActivityFeedSection({
  activities,
  loading,
  teamFilter,
  onTeamFilterChange,
  teams,
  onOpenActivity,
  isAdmin = false,
}) {
  const filterTeams = teams?.length > 0 ? teams : []

  return (
    <div className="border-t border-white/15">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-white/[0.02]">
        <h4 className="text-xs font-semibold uppercase opacity-50 tracking-wide">Activity</h4>
        {filterTeams.length > 1 && (
          <div className="relative shrink-0">
            <select
              value={teamFilter || ''}
              onChange={(e) => onTeamFilterChange(e.target.value || null)}
              className="text-[11px] rounded-md pl-2 pr-6 py-1 bg-white/5 border border-white/15 appearance-none max-w-[140px] truncate"
              aria-label="Filter activity by team"
            >
              <option value="">All teams</option>
              {filterTeams.map((t) => (
                <option key={t.id} value={t.id}>{t.name || 'Team'}</option>
              ))}
            </select>
            <ChevronDown className="h-3 w-3 absolute right-1.5 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none" />
          </div>
        )}
      </div>
      {loading && activities.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-sm opacity-70">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading…
        </div>
      ) : activities.length === 0 ? (
        <p className="text-center py-8 text-sm opacity-50 px-4">No team activity yet.</p>
      ) : (
        <ul>
          {activities.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onOpenActivity?.(a.nav || a.entity)}
                className="w-full text-left px-4 py-3 border-b border-white/10 hover:bg-white/5 transition-colors flex gap-2.5"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold uppercase">
                  {actorInitial(a.actorEmail)}
                </span>
                <span className="min-w-0 flex-1">
                  <div className="text-sm leading-snug flex items-center gap-2 flex-wrap">
                    {a.summary}
                    {isAdmin && a.audience === 'admin_only' && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30 uppercase">Admin</span>
                    )}
                  </div>
                  <div className="text-[10px] opacity-50 mt-0.5">{formatWhen(a.createdAt)}</div>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function useNotificationInbox({ getToken, currentUser, teams = [], teamMembership = null, onNavigate }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [activities, setActivities] = useState([])
  const [activityTeams, setActivityTeams] = useState([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [teamFilter, setTeamFilter] = useState(null)

  const refreshNotifications = useCallback(async () => {
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

  const refreshActivity = useCallback(async () => {
    if (!currentUser || !getToken) return
    setActivityLoading(true)
    try {
      const data = await fetchActivity(getToken, { teamId: teamFilter, limit: 50 })
      setActivities(data.activities || [])
      if (data.teams?.length) setActivityTeams(data.teams)
    } catch {
      /* ignore */
    } finally {
      setActivityLoading(false)
    }
  }, [currentUser, getToken, teamFilter])

  const refresh = useCallback(async () => {
    await Promise.all([refreshNotifications(), refreshActivity()])
  }, [refreshNotifications, refreshActivity])

  useEffect(() => {
    refreshNotifications()
    const id = setInterval(refresh, 60000)
    return () => clearInterval(id)
  }, [refresh, refreshNotifications])

  useEffect(() => {
    if (open) refresh()
  }, [open, refresh])

  useEffect(() => {
    if (currentUser) refreshActivity()
  }, [teamFilter, refreshActivity, currentUser])

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

  const handleOpenActivity = (nav) => {
    if (!nav?.type) return
    setOpen(false)
    onNavigate?.(nav)
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

  const displayTeams = activityTeams.length > 0 ? activityTeams : (teams || []).map((t) => ({ id: t.id, name: t.name }))

  const panel = open && currentUser && typeof document !== 'undefined' ? createPortal(
    <div className="notification-inbox-overlay fixed inset-0 z-[10050]">
      <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
      <div className="notification-inbox-panel map-panel absolute right-4 top-14 w-[min(92vw,380px)] max-h-[70vh] overflow-hidden flex flex-col rounded-xl shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/15 shrink-0">
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
        <div className="overflow-y-auto flex-1 min-h-0">
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
          <ActivityFeedSection
            activities={activities}
            loading={activityLoading}
            teamFilter={teamFilter}
            onTeamFilterChange={setTeamFilter}
            teams={displayTeams}
            onOpenActivity={handleOpenActivity}
            isAdmin={teamMembership?.role === 'admin'}
          />
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
