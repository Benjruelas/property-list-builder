import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, ChevronDown, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogDescription } from './ui/dialog'
import { PanelHeader, PANEL_LIST_HEADER_CLASS, PANEL_LIST_HEADER_STYLE } from './ui/panel-header'
import { fetchFeed, markFeedSeen, feedItemKey, collectUnseenKeys } from '../utils/feed'
import { cn } from '@/lib/utils'

const FEED_UNSEEN_COLOR = '#60a5fa'

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

function FeedItemRow({ item, isSessionNew, isAdmin, onOpen }) {
  const isActivity = item.source === 'activity'
  const label = isActivity ? item.summary : item.title
  const detail = !isActivity && item.body ? item.body : null

  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={() => onOpen(item)}
        className={cn(
          'map-panel-list-item w-full max-w-full min-w-0 text-left transition-colors flex gap-2.5 items-start box-border p-3 rounded-lg border border-solid',
          isSessionNew
            ? 'bg-white/[0.08] hover:bg-white/[0.12]'
            : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'
        )}
        style={isSessionNew ? { borderColor: `${FEED_UNSEEN_COLOR}cc` } : undefined}
      >
        {isSessionNew && (
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5"
            style={{ backgroundColor: FEED_UNSEEN_COLOR }}
            aria-hidden
          />
        )}
        {isActivity && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold uppercase mt-0.5">
            {actorInitial(item.actorEmail)}
          </span>
        )}
        <span className="min-w-0 flex-1 overflow-hidden">
          <div className="text-sm leading-snug flex items-center gap-2 min-w-0">
            <span className={cn('truncate min-w-0', !isActivity && isSessionNew && 'font-medium')}>{label}</span>
            {isActivity && isAdmin && item.audience === 'admin_only' && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30 uppercase shrink-0">Admin</span>
            )}
          </div>
          {detail && <div className="text-xs opacity-75 mt-0.5 line-clamp-2 break-words">{detail}</div>}
          <div className="text-[10px] opacity-50 mt-1">{formatWhen(item.createdAt)}</div>
        </span>
      </button>
    </li>
  )
}

export function ActivityPanel({
  isOpen,
  onClose,
  items,
  loading,
  sessionNewKeys,
  teamFilter,
  onTeamFilterChange,
  displayTeams,
  isAdmin,
  onOpenItem,
}) {
  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose?.() }}>
      <DialogContent
        className="map-panel list-panel activity-panel fullscreen-panel flex flex-col min-h-0 p-0"
        showCloseButton={false}
        hideOverlay
      >
        <DialogHeader className={cn(PANEL_LIST_HEADER_CLASS, 'flex-shrink-0 pb-3')} style={PANEL_LIST_HEADER_STYLE}>
          <DialogDescription className="sr-only">Notifications and team activity</DialogDescription>
          <PanelHeader onBack={onClose} title="Activity">
            {displayTeams.length > 1 && (
              <div className="relative shrink min-w-0 max-w-[9rem]">
                <select
                  value={teamFilter || ''}
                  onChange={(e) => onTeamFilterChange?.(e.target.value || null)}
                  className="text-[11px] rounded-md pl-2 pr-6 py-1.5 bg-white/5 border border-white/15 appearance-none w-full max-w-full truncate"
                  aria-label="Filter by team"
                >
                  <option value="">All teams</option>
                  {displayTeams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name || 'Team'}</option>
                  ))}
                </select>
                <ChevronDown className="h-3 w-3 absolute right-1.5 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none" />
              </div>
            )}
          </PanelHeader>
        </DialogHeader>

        <div
          className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto scrollbar-hide px-3 py-1"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-sm opacity-70">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading…
            </div>
          ) : items.length === 0 ? (
            <p className="text-center py-10 text-sm opacity-60 px-4">No activity yet.</p>
          ) : (
            <ul className="min-w-0 space-y-1.5 pb-1">
              {items.map((item) => (
                <FeedItemRow
                  key={feedItemKey(item)}
                  item={item}
                  isSessionNew={sessionNewKeys.has(feedItemKey(item))}
                  isAdmin={isAdmin}
                  onOpen={onOpenItem}
                />
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function useNotificationInbox({
  isOpen: controlledOpen,
  onOpenChange,
  getToken,
  currentUser,
  teams = [],
  teamMembership = null,
  onNavigate,
}) {
  const isControlled = controlledOpen !== undefined
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = isControlled ? controlledOpen : uncontrolledOpen
  const setOpen = useCallback((value) => {
    const next = typeof value === 'function' ? value(open) : value
    if (isControlled) onOpenChange?.(next)
    else setUncontrolledOpen(next)
  }, [isControlled, onOpenChange, open])

  const openRef = useRef(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [feedTeams, setFeedTeams] = useState([])
  const [teamFilter, setTeamFilter] = useState(null)
  const [sessionNewKeys, setSessionNewKeys] = useState(() => new Set())

  useEffect(() => {
    openRef.current = open
    if (!open) {
      setSessionNewKeys(new Set())
    }
  }, [open])

  const loadFeed = useCallback(async ({ replaceSessionKeys = false } = {}) => {
    if (!currentUser || !getToken) return

    const isPanelOpen = openRef.current
    setLoading(true)
    try {
      const data = await fetchFeed(getToken, {
        teamId: teamFilter,
        limit: 50,
        uid: currentUser.uid,
      })
      if (data.teams?.length) setFeedTeams(data.teams)

      const unseenKeys = collectUnseenKeys(data.items)
      let nextItems = data.items || []

      if (isPanelOpen) {
        setSessionNewKeys((prev) => {
          if (replaceSessionKeys) return unseenKeys
          const next = new Set(prev)
          for (const key of unseenKeys) next.add(key)
          return next
        })

        if (unseenKeys.size > 0 || data.unreadCount > 0) {
          const marked = await markFeedSeen(getToken, {
            markAllRead: true,
            teamId: teamFilter,
            uid: currentUser.uid,
          })
          nextItems = marked.items || []
        }

        setItems(nextItems)
        setUnreadCount(0)
      } else {
        setItems(nextItems)
        setUnreadCount(data.unreadCount || 0)
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [currentUser, getToken, teamFilter])

  useEffect(() => {
    loadFeed({ replaceSessionKeys: false })
    const id = setInterval(() => loadFeed({ replaceSessionKeys: false }), 60000)
    return () => clearInterval(id)
  }, [loadFeed])

  useEffect(() => {
    if (open) loadFeed({ replaceSessionKeys: true })
  }, [open, teamFilter, loadFeed])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (ev) => {
      if (ev.data?.type === 'NOTIFICATION_CLICK') {
        onNavigate?.(ev.data.data)
        loadFeed({ replaceSessionKeys: openRef.current })
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [onNavigate, loadFeed])

  const handleClose = useCallback(() => setOpen(false), [setOpen])

  const handleOpenItem = useCallback((item) => {
    const nav = item.nav || { type: item.type }
    if (nav?.type) onNavigate?.(nav)
  }, [onNavigate])

  const displayTeams = feedTeams.length > 0 ? feedTeams : (teams || []).map((t) => ({ id: t.id, name: t.name }))
  const isAdmin = teamMembership?.role === 'admin'

  const panel = currentUser ? (
    <ActivityPanel
      isOpen={open}
      onClose={handleClose}
      items={items}
      loading={loading}
      sessionNewKeys={sessionNewKeys}
      teamFilter={teamFilter}
      onTeamFilterChange={setTeamFilter}
      displayTeams={displayTeams}
      isAdmin={isAdmin}
      onOpenItem={handleOpenItem}
    />
  ) : null

  const openInbox = useCallback(() => setOpen(true), [setOpen])

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
        <span className="flex-1">Activity</span>
        {unreadCount > 0 && (
          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
    )
  }, [currentUser, unreadCount, setOpen])

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
        title="Activity"
        aria-label={`Activity${inbox.unreadCount ? `, ${inbox.unreadCount} unseen` : ''}`}
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
