import { useRef, useState, useLayoutEffect, useCallback } from 'react'
import {
  Calendar,
  ListTodo,
  Menu,
  UserSearch,
  Briefcase,
  Bell,
} from 'lucide-react'
import { QuoteIcon } from './icons/QuoteIcon'
import { cn } from '@/lib/utils'
import { PipeIcon } from './PipeIcon'
import { useActionBarLayout } from '@/hooks/useActionBarLayout'
import { ActionBarMenu } from './ActionBarMenu'

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
  onOpenActivity,
  showMenu = false,
  setShowMenu,
  onOpenListPanel,
  selectedListIds = [],
  onOpenPathsPanel,
  isPathTrackingActive,
  onOpenOutreach,
  onOpenForms,
  onOpenTeamsPanel,
  onOpenSettings,
  currentUser,
  onLogin,
  activityUnreadCount = 0,
}) {
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

  const handlers = {
    pipes: onOpenPipes,
    tasks: onOpenTasks,
    schedule: onOpenSchedule,
    leads: onOpenLeads,
    deals: onOpenDeals,
    quotes: onOpenQuotes,
    activity: onOpenActivity,
    menu: () => setShowMenu?.(!showMenu),
  }

  const computedActiveId = showMenu ? 'menu' : activeId

  return (
    <>
      <ActionBarMenu
        show={showMenu}
        onClose={() => setShowMenu?.(false)}
        overflowPrimaryIds={overflowPrimaryIds}
        onOpenPipes={onOpenPipes}
        onOpenTasks={onOpenTasks}
        onOpenSchedule={onOpenSchedule}
        onOpenLeads={onOpenLeads}
        onOpenDeals={onOpenDeals}
        onOpenQuotes={onOpenQuotes}
        onOpenActivity={onOpenActivity}
        onOpenListPanel={onOpenListPanel}
        selectedListIds={selectedListIds}
        onOpenPathsPanel={onOpenPathsPanel}
        isPathTrackingActive={isPathTrackingActive}
        onOpenOutreach={onOpenOutreach}
        onOpenForms={onOpenForms}
        onOpenTeamsPanel={onOpenTeamsPanel}
        onOpenSettings={onOpenSettings}
        currentUser={currentUser}
        onLogin={onLogin}
        activityUnreadCount={activityUnreadCount}
        anchor={menuAnchor}
      />
      <nav
        className="mobile-action-bar"
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
}
