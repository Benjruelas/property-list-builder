import { Calendar, ListTodo, Menu, List, Circle, Route, Send, UserSearch, Users2, Settings, User } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * MobileActionBar — permanent floating bottom action bar (macOS dock style).
 * Surfaces the four most frequent flows (Pipes, Tasks, Schedule, Menu)
 * outside the top-right control stack on mobile.
 */

/**
 * Hardware pipe icon — L-shaped (elbow) section of pipe with rectangular
 * flanges on both open ends, modelled after flaticon #148292. Drawn in
 * Lucide's line-icon style (24x24 viewBox, stroke="currentColor", round
 * joins/caps) so it inherits color and sizing like the other icons.
 */
function PipeIcon({ className, ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <rect x="3" y="2" width="8" height="3" rx="0.5" />
      <line x1="3.5" y1="3.5" x2="10.5" y2="3.5" />
      <rect x="19" y="12" width="3" height="8" rx="0.5" />
      <line x1="20.5" y1="12.5" x2="20.5" y2="19.5" />
      <path d="M5 5 L5 13 Q5 18 10 18 L19 18" />
      <path d="M9 5 L9 13 Q9 14 10 14 L19 14" />
    </svg>
  )
}

const ACTIONS = [
  { id: 'pipes',    label: 'Pipes',    Icon: PipeIcon },
  { id: 'tasks',    label: 'Tasks',    Icon: ListTodo },
  { id: 'schedule', label: 'Schedule', Icon: Calendar },
  { id: 'menu',     label: 'Menu',     Icon: Menu },
]

export function MobileActionBar({
  activeId = null,
  onOpenPipes,
  onOpenTasks,
  onOpenSchedule,
  /* Hamburger menu state + handlers (reused from App / MapControls). */
  showMenu = false,
  setShowMenu,
  onOpenListPanel,
  selectedListIds = [],
  onOpenPathsPanel,
  isPathTrackingActive,
  onOpenOutreach,
  onOpenLeads,
  onOpenTeamsPanel,
  onOpenSettings,
  currentUser,
  onLogin,
}) {
  const handlers = {
    pipes: onOpenPipes,
    tasks: onOpenTasks,
    schedule: onOpenSchedule,
    menu: () => setShowMenu?.(!showMenu),
  }
  const computedActiveId = showMenu ? 'menu' : activeId

  const renderButtons = () =>
    ACTIONS.map(({ id, label, Icon }) => {
      const active = computedActiveId === id
      return (
        <button
          key={id}
          type="button"
          onClick={() => handlers[id]?.()}
          className={cn('mobile-action-bar-btn', active && 'is-active')}
          aria-label={label}
          title={label}
          aria-expanded={id === 'menu' ? showMenu : undefined}
          data-tour={`action-bar-${id}`}
        >
          <Icon className="h-6 w-6" />
          <span className="mobile-action-bar-label">{label}</span>
        </button>
      )
    })

  const closeMenu = () => setShowMenu?.(false)

  const menuPopup = showMenu ? (
    <>
      <div
        className="mobile-action-bar-menu-backdrop"
        onClick={closeMenu}
        aria-hidden="true"
      />
      <div
        className="mobile-action-bar-menu map-panel hamburger-menu"
        role="menu"
      >
        <button
          data-tour="menu-lists"
          onClick={() => { closeMenu(); onOpenListPanel?.() }}
          className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
        >
          <List className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1">Lists</span>
          {selectedListIds.length > 0 && (
            <Circle className="h-2 w-2 fill-amber-400 text-amber-400 flex-shrink-0" />
          )}
        </button>

        <button
          data-tour="menu-paths"
          onClick={() => { closeMenu(); onOpenPathsPanel?.() }}
          className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
        >
          <Route className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1">Paths</span>
          {isPathTrackingActive && (
            <Circle className="h-2 w-2 fill-red-500 text-red-500 flex-shrink-0" />
          )}
        </button>

        <button
          data-tour="menu-outreach"
          onClick={() => { closeMenu(); onOpenOutreach?.() }}
          className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
        >
          <Send className="h-4 w-4 flex-shrink-0" />
          <span>Outreach</span>
        </button>

        <button
          data-tour="menu-leads"
          onClick={() => { closeMenu(); onOpenLeads?.() }}
          className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
        >
          <UserSearch className="h-4 w-4 flex-shrink-0" />
          <span>Leads</span>
        </button>

        <button
          data-tour="menu-teams"
          onClick={() => { closeMenu(); onOpenTeamsPanel?.() }}
          className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
        >
          <Users2 className="h-4 w-4 flex-shrink-0" />
          <span>Teams</span>
        </button>

        <div className="my-1 border-t border-gray-200" />

        {currentUser ? (
          <>
            <div className="px-4 py-2 border-b border-gray-200">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {currentUser.displayName || 'User'}
              </p>
              <p className="text-xs text-gray-600 truncate">
                {currentUser.email}
              </p>
            </div>
            <button
              data-tour="menu-settings"
              onClick={() => { closeMenu(); onOpenSettings?.() }}
              className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
            >
              <Settings className="h-4 w-4 flex-shrink-0" />
              <span>Settings</span>
            </button>
          </>
        ) : (
          <button
            onClick={() => { closeMenu(); onLogin?.() }}
            className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
          >
            <User className="h-4 w-4 flex-shrink-0" />
            <span>Sign In</span>
          </button>
        )}
      </div>
    </>
  ) : null

  return (
    <>
      {menuPopup}
      <nav
        className="mobile-action-bar"
        role="navigation"
        aria-label="Primary actions"
      >
        <div className="mobile-action-bar-inner">{renderButtons()}</div>
      </nav>
    </>
  )
}
