import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bell, ChevronDown, Loader2, Search, UserSearch, Briefcase, CheckSquare, List, Route, FileText, ScrollText, Users2, Activity } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogDescription } from './ui/dialog'
import { mapListDialogOpen, listPanelObscuredByDetail } from './ui/panelDialogUtils'
import { useObscuredPanelRoot } from '@/hooks/useObscuredPanelRoot'
import { isFeedItemNavActionable } from '@/navigation/feedNavigation'
import { PanelHeader, PANEL_LIST_HEADER_CLASS, PANEL_LIST_HEADER_STYLE } from './ui/panel-header'
const ACTIVITY_FEED_ROW_CLASS =
  'map-panel-list-item leads-panel-list-item flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98] transition-all cursor-pointer w-full text-left'
import {
  fetchFeed,
  markFeedSeen,
  feedItemKey,
  collectUnseenKeys,
  FEED_TABS,
  filterFeedItems,
  countFeedItemsByTab,
  feedItemCategoryLabel,
  feedItemBadgeClassName,
  feedItemIconKind,
} from '../utils/feed'
import { cn } from '@/lib/utils'

function formatWhen(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function ActivityTabs({ activeTab, onChange, counts }) {
  return (
    <div className="flex gap-4 flex-wrap" role="tablist" aria-label="Activity type">
      {FEED_TABS.map(({ id, label }) => {
        const isActive = activeTab === id
        const count = counts[id] ?? 0
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(id)}
            className={cn(
              'pb-1.5 text-sm font-medium border-b-2 transition-opacity',
              isActive ? 'opacity-100 border-white/70' : 'opacity-50 border-transparent hover:opacity-80'
            )}
          >
            {label}
            <span className="text-xs opacity-60 ml-1">{count}</span>
          </button>
        )
      })}
    </div>
  )
}

const FEED_ICON_MAP = {
  lead: UserSearch,
  deal: Briefcase,
  task: CheckSquare,
  list: List,
  path: Route,
  form: FileText,
  quote: ScrollText,
  team: Users2,
  notification: Bell,
  activity: Activity,
}

function FeedCategoryBadge({ label, className }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 max-w-full text-[10px] px-2 py-0.5 rounded-md border uppercase tracking-wide font-medium',
        className
      )}
    >
      <span className="truncate">{label}</span>
    </span>
  )
}

function FeedItemRow({ item, isSessionNew, isAdmin, onOpen }) {
  const isActivity = item.source === 'activity'
  const primary = isActivity ? item.summary : item.title
  const secondary = !isActivity && item.body ? item.body : null
  const groupedMeta = item.collapseCount > 1 ? `${item.collapseCount} grouped updates` : null
  const category = feedItemCategoryLabel(item)
  const iconKind = feedItemIconKind(item)
  const RowIcon = FEED_ICON_MAP[iconKind] || Activity
  const when = formatWhen(item.createdAt)

  const handleOpen = () => onOpen(item)

  return (
    <li className="min-w-0">
      <div
        role="button"
        tabIndex={0}
        onMouseDown={(e) => {
          if (e.button === 0) e.preventDefault()
        }}
        onClick={handleOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleOpen()
          }
        }}
        className={cn(
          ACTIVITY_FEED_ROW_CLASS,
          isSessionNew && 'border-[#60a5fa]/80 bg-white/[0.08] hover:bg-white/[0.12]'
        )}
      >
        <RowIcon className="h-5 w-5 shrink-0 opacity-70" aria-hidden />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="font-medium panel-item-title truncate">{primary}</span>
            <FeedCategoryBadge label={category} className={feedItemBadgeClassName(item)} />
            {isSessionNew && (
              <span className="inline-flex shrink-0 text-[10px] px-2 py-0.5 rounded-md border uppercase tracking-wide font-medium border-[#60a5fa]/40 bg-[#60a5fa]/20 text-[#93c5fd]">
                New
              </span>
            )}
            {isActivity && isAdmin && item.audience === 'admin_only' && (
              <span className="inline-flex shrink-0 text-[10px] px-2 py-0.5 rounded-md border uppercase tracking-wide font-medium bg-amber-500/20 text-amber-300 border-amber-400/30">
                Admin
              </span>
            )}
          </div>
          {secondary ? (
            <p className="panel-item-body opacity-70 truncate">{secondary}</p>
          ) : null}
          {groupedMeta ? (
            <p className="panel-item-meta opacity-50 truncate">{groupedMeta}</p>
          ) : null}
          {when ? (
            <p className="panel-item-meta opacity-50 truncate">{when}</p>
          ) : null}
        </div>
      </div>
    </li>
  )
}

export function ActivityPanel({
  isOpen,
  panelDockSlot,
  isFocused = true,
  topLayer = isFocused,
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
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  /** In stack but covered by destination — keep nav, crossfade under destination */
  const dialogOpen = mapListDialogOpen(isOpen)
  const dialogObscured = listPanelObscuredByDetail(isOpen, !isFocused)

  useEffect(() => {
    if (!isOpen) {
      setTab('all')
      setSearch('')
    }
  }, [isOpen])

  const panelRef = useRef(null)
  useObscuredPanelRoot(panelRef, dialogObscured)

  const tabCounts = useMemo(() => countFeedItemsByTab(items), [items])

  const filteredItems = useMemo(
    () => filterFeedItems(items, { tab, query: search }),
    [items, tab, search]
  )

  return (
    <Dialog
      open={dialogOpen}
      modal={false}
      onOpenChange={(open) => {
        // Ignore Radix dismiss when destination panels close — back button calls onClose directly.
        if (!open) return
      }}
    >
      <DialogContent
        ref={panelRef}
        className={cn(
          'map-panel list-panel activity-panel fullscreen-panel flex flex-col min-h-0 overflow-hidden p-0',
          dialogObscured && 'crm-list-under-detail crm-panel-obscured pointer-events-none',
        )}
        panelDockSlot={panelDockSlot}
        showCloseButton={false}
        hideOverlay
        suppressBackdrop
        topLayer={topLayer}
        onEscapeKeyDown={(e) => {
          if (!isFocused) {
            e.preventDefault()
            return
          }
          onClose?.()
        }}
      >
        <DialogHeader className={cn(PANEL_LIST_HEADER_CLASS, 'flex-shrink-0 pb-4')} style={PANEL_LIST_HEADER_STYLE}>
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
          className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain scrollbar-hide px-6 py-3"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="mb-3 space-y-2">
            <ActivityTabs activeTab={tab} onChange={setTab} counts={tabCounts} />
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-40 pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search activity…"
                className="w-full text-sm rounded-lg pl-9 pr-3 py-2"
                aria-label="Search activity"
              />
            </div>
          </div>

          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-sm opacity-70">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading…
            </div>
          ) : items.length === 0 ? (
            <p className="text-center py-10 text-sm opacity-60 px-4">No activity yet.</p>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm opacity-60">No activity matches your filters.</p>
            </div>
          ) : (
            <ul className="min-w-0 space-y-1.5 pb-1">
              {filteredItems.map((item) => (
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
  isFeedActive: controlledFeedActive,
  topLayer: controlledTopLayer,
  panelDockSlot,
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
  const feedActive = controlledFeedActive !== undefined ? controlledFeedActive : open
  const topLayer = controlledTopLayer !== undefined ? controlledTopLayer : feedActive
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
    openRef.current = feedActive
    if (!open) {
      setSessionNewKeys(new Set())
    }
  }, [open, feedActive])

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
    // Poll only while the tab is visible; refresh immediately on return so a
    // backgrounded phone doesn't burn LTE/battery on a 60s feed loop.
    const id = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        loadFeed({ replaceSessionKeys: false })
      }
    }, 60000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadFeed({ replaceSessionKeys: false })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [loadFeed])

  useEffect(() => {
    if (feedActive) loadFeed({ replaceSessionKeys: true })
  }, [feedActive, teamFilter, loadFeed])

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
    if (isFeedItemNavActionable(nav)) onNavigate?.(nav)
  }, [onNavigate])

  const displayTeams = feedTeams.length > 0 ? feedTeams : (teams || []).map((t) => ({ id: t.id, name: t.name }))
  const isAdmin = teamMembership?.role === 'admin'

  const panel = currentUser ? (
    <ActivityPanel
      isOpen={open}
      panelDockSlot={panelDockSlot}
      isFocused={feedActive}
      topLayer={topLayer}
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
