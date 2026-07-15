import { useRef, useState, useLayoutEffect, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'

const DESKTOP_BAR_MQ = '(min-width: 768px)'

function useDesktopActionBarElevated() {
  const [elevated, setElevated] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(DESKTOP_BAR_MQ).matches
  )

  useLayoutEffect(() => {
    const mq = window.matchMedia(DESKTOP_BAR_MQ)
    const onChange = () => setElevated(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return elevated
}
import {
  Calendar,
  List,
  ListTodo,
  Menu,
  UserSearch,
  Briefcase,
  Bell,
  FileText,
  ClipboardList,
  Route,
  Send,
  Settings,
  User,
  Circle,
  Camera,
} from 'lucide-react'
import { QuoteIcon } from './icons/QuoteIcon'
import { cn } from '@/lib/utils'
import { PipeIcon } from './PipeIcon'
import { useActionBarLayout } from '@/hooks/useActionBarLayout'
import { prefetchPanel } from '@/utils/panelChunks'
import { ActionBarMenu } from './ActionBarMenu'

const BAR_PREFETCH_KEY = {
  pipes: 'dealPipeline',
  tasks: 'tasks',
  schedule: 'schedule',
  leads: 'leads',
  deals: 'deals',
  quotes: 'quotes',
  forms: 'forms',
  reports: 'reports',
  paths: 'paths',
  outreach: 'outreach',
  settings: 'settings',
}

/**
 * FloatingActionBar — responsive bottom dock (phone → desktop).
 * Mobile: Pipes, Tasks, Schedule, and Menu overflow.
 * Desktop (768+): every action on the bar — no Menu.
 */

const ITEM_DEFS = {
  pipes: { label: 'Deal Pipe', Icon: PipeIcon },
  tasks: { label: 'Tasks', Icon: ListTodo },
  schedule: { label: 'Schedule', Icon: Calendar },
  leads: { label: 'Lead Pipe', Icon: UserSearch },
  deals: { label: 'Deals', Icon: Briefcase },
  quotes: { label: 'Quotes', Icon: QuoteIcon },
  forms: { label: 'Forms', Icon: ClipboardList },
  reports: { label: 'Reports', Icon: FileText },
  lists: { label: 'Lists', Icon: List },
  activity: { label: 'Activity', Icon: Bell },
  paths: { label: 'Paths', Icon: Route },
  outreach: { label: 'Outreach', Icon: Send },
  settings: { label: 'Settings', Icon: Settings },
  photoMode: { label: 'Photo Mode', Icon: Camera },
  login: { label: 'Sign In', Icon: User },
  menu: { label: 'Menu', Icon: Menu },
}

export function MobileActionBar({
  activeId = null,
  onOpenPipes,
  onOpenTasks,
  onOpenSchedule,
  onOpenLeads,
  onOpenDeals,
  onOpenQuotes,
  onOpenReports,
  onOpenActivity,
  showMenu = false,
  setShowMenu,
  onOpenListPanel,
  selectedListIds = [],
  onOpenPathsPanel,
  isPathTrackingActive,
  onOpenOutreach,
  onOpenForms,
  onOpenSettings,
  onOpenPhotoMode,
  currentUser,
  onLogin,
  activityUnreadCount = 0,
}) {
  const elevateBar = useDesktopActionBarElevated()
  const { barIds, overflowPrimaryIds, isDesktop } = useActionBarLayout()
  const menuBtnRef = useRef(null)
  const [menuAnchor, setMenuAnchor] = useState(null)

  useEffect(() => {
    if (isDesktop && showMenu) setShowMenu?.(false)
  }, [isDesktop, showMenu, setShowMenu])

  const updateMenuAnchor = useCallback(() => {
    const el = menuBtnRef.current
    if (!el) {
      setMenuAnchor(null)
      return
    }
    const btnRect = el.getBoundingClientRect()
    const barRect = el.closest('.mobile-action-bar-inner')?.getBoundingClientRect()
    const anchorRight = barRect
      ? window.innerWidth - barRect.right
      : window.innerWidth - btnRect.right
    setMenuAnchor({
      right: Math.max(12, anchorRight),
      bottom: Math.max(12, window.innerHeight - btnRect.top + 16),
    })
  }, [])

  useLayoutEffect(() => {
    if (!showMenu) {
      setMenuAnchor(null)
      return undefined
    }
    updateMenuAnchor()
    window.addEventListener('resize', updateMenuAnchor)
    window.addEventListener('scroll', updateMenuAnchor, true)
    return () => {
      window.removeEventListener('resize', updateMenuAnchor)
      window.removeEventListener('scroll', updateMenuAnchor, true)
    }
  }, [showMenu, barIds, updateMenuAnchor])

  useEffect(() => {
    if (!showMenu || isDesktop) return
    prefetchPanel('outreach')
    prefetchPanel('paths')
    prefetchPanel('settings')
  }, [showMenu, isDesktop])

  const handlers = {
    pipes: onOpenPipes,
    tasks: onOpenTasks,
    schedule: onOpenSchedule,
    leads: onOpenLeads,
    deals: onOpenDeals,
    quotes: onOpenQuotes,
    reports: onOpenReports,
    lists: onOpenListPanel,
    forms: onOpenForms,
    activity: onOpenActivity,
    paths: onOpenPathsPanel,
    outreach: onOpenOutreach,
    settings: onOpenSettings,
    photoMode: onOpenPhotoMode,
    login: onLogin,
    menu: () => setShowMenu?.(!showMenu),
  }

  const computedActiveId = !isDesktop && showMenu ? 'menu' : activeId

  const chrome = (
    <>
      <ActionBarMenu
        show={!isDesktop && showMenu}
        onClose={() => setShowMenu?.(false)}
        barIds={barIds}
        overflowPrimaryIds={overflowPrimaryIds}
        onOpenPipes={onOpenPipes}
        onOpenTasks={onOpenTasks}
        onOpenSchedule={onOpenSchedule}
        onOpenLeads={onOpenLeads}
        onOpenDeals={onOpenDeals}
        onOpenQuotes={onOpenQuotes}
        onOpenReports={onOpenReports}
        onOpenActivity={onOpenActivity}
        onOpenListPanel={onOpenListPanel}
        selectedListIds={selectedListIds}
        onOpenPathsPanel={onOpenPathsPanel}
        isPathTrackingActive={isPathTrackingActive}
        onOpenOutreach={onOpenOutreach}
        onOpenForms={onOpenForms}
        onOpenSettings={onOpenSettings}
        currentUser={currentUser}
        onLogin={onLogin}
        activityUnreadCount={activityUnreadCount}
        anchor={menuAnchor}
      />
      <nav
        className={cn('mobile-action-bar', elevateBar && 'mobile-action-bar--elevated')}
        role="navigation"
        aria-label="Primary actions"
        data-action-bar-count={barIds.length}
      >
        <div className="mobile-action-bar-inner">
          {barIds.map((id) => {
            const resolvedId = id === 'settings' && !currentUser ? 'login' : id
            const def = ITEM_DEFS[resolvedId]
            if (!def) return null
            const { label, Icon } = def
            const active = computedActiveId === id || (id === 'settings' && computedActiveId === 'login')
            const tourId = id === 'menu' ? 'action-bar-menu' : `action-bar-${id}`
            return (
              <button
                key={id}
                ref={id === 'menu' ? menuBtnRef : undefined}
                type="button"
                onClick={() => handlers[resolvedId]?.()}
                onPointerEnter={() => {
                  const key = BAR_PREFETCH_KEY[id]
                  if (key) prefetchPanel(key)
                }}
                className={cn('mobile-action-bar-btn', active && 'is-active')}
                aria-label={label}
                title={label}
                aria-expanded={id === 'menu' ? showMenu : undefined}
                data-tour={tourId}
              >
                <span className="mobile-action-bar-icon-wrap">
                  <Icon className="h-6 w-6" />
                  {id === 'activity' && activityUnreadCount > 0 && (
                    <span className="mobile-action-bar-badge" aria-hidden>
                      {activityUnreadCount > 99 ? '99+' : activityUnreadCount}
                    </span>
                  )}
                  {id === 'lists' && selectedListIds.length > 0 && (
                    <Circle className="mobile-action-bar-dot mobile-action-bar-dot--amber" aria-hidden />
                  )}
                  {id === 'paths' && isPathTrackingActive && (
                    <Circle className="mobile-action-bar-dot mobile-action-bar-dot--red" aria-hidden />
                  )}
                </span>
                <span className="mobile-action-bar-label">{label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )

  if (!elevateBar || typeof document === 'undefined') return chrome
  return createPortal(chrome, document.getElementById('modal-root') || document.body)
}
