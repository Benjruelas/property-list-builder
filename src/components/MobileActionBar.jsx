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
}

/**
 * FloatingActionBar — responsive bottom dock (phone → wide desktop).
 * Surfaces more primary actions as the viewport widens; overflow lives in Menu.
 */

const ITEM_DEFS = {
  pipes: { label: 'Pipes', Icon: PipeIcon },
  tasks: { label: 'Tasks', Icon: ListTodo },
  schedule: { label: 'Schedule', Icon: Calendar },
  leads: { label: 'Leads', Icon: UserSearch },
  deals: { label: 'Deals', Icon: Briefcase },
  quotes: { label: 'Quotes', Icon: QuoteIcon },
  forms: { label: 'Forms', Icon: ClipboardList },
  reports: { label: 'Reports', Icon: FileText },
  lists: { label: 'Lists', Icon: List },
  activity: { label: 'Activity', Icon: Bell },
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
  currentUser,
  onLogin,
  activityUnreadCount = 0,
}) {
  const elevateBar = useDesktopActionBarElevated()
  const { barIds, overflowPrimaryIds } = useActionBarLayout()
  const menuBtnRef = useRef(null)
  const [menuAnchor, setMenuAnchor] = useState(null)

  const updateMenuAnchor = useCallback(() => {
    const el = menuBtnRef.current
    if (!el) {
      setMenuAnchor(null)
      return
    }
    const r = el.getBoundingClientRect()
    setMenuAnchor({
      right: Math.max(12, window.innerWidth - r.right),
      bottom: Math.max(12, window.innerHeight - r.top + 16),
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
    if (!showMenu) return
    prefetchPanel('outreach')
    prefetchPanel('paths')
    prefetchPanel('settings')
  }, [showMenu])

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
    menu: () => setShowMenu?.(!showMenu),
  }

  const computedActiveId = showMenu ? 'menu' : activeId

  const chrome = (
    <>
      <ActionBarMenu
        show={showMenu}
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
            const def = ITEM_DEFS[id]
            if (!def) return null
            const { label, Icon } = def
            const active = computedActiveId === id
            const tourId = id === 'menu' ? 'action-bar-menu' : `action-bar-${id}`
            return (
              <button
                key={id}
                ref={id === 'menu' ? menuBtnRef : undefined}
                type="button"
                onClick={() => handlers[id]?.()}
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
