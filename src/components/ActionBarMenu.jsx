import {
  List,
  Circle,
  Route,
  Send,
  UserSearch,
  Users2,
  Settings,
  User,
  FileText,
  Briefcase,
  Calendar,
  ListTodo,
  Bell,
} from 'lucide-react'
import { QuoteIcon } from './icons/QuoteIcon'
import { PipeIcon } from './PipeIcon'

const OVERFLOW_PRIMARY = [
  { id: 'pipes', label: 'Pipes', Icon: PipeIcon, tour: 'menu-pipes' },
  { id: 'tasks', label: 'Tasks', Icon: ListTodo, tour: 'menu-tasks' },
  { id: 'schedule', label: 'Schedule', Icon: Calendar, tour: 'menu-schedule' },
  { id: 'leads', label: 'Leads', Icon: UserSearch, tour: 'menu-leads' },
  { id: 'deals', label: 'Deals', Icon: Briefcase, tour: 'menu-deals' },
  { id: 'quotes', label: 'Quotes', Icon: QuoteIcon, tour: 'menu-quotes' },
  { id: 'activity', label: 'Activity', Icon: Bell, tour: 'menu-notifications' },
]

/**
 * Overflow menu for the floating action bar (and former desktop hamburger).
 */
export function ActionBarMenu({
  show,
  onClose,
  overflowPrimaryIds = [],
  onOpenPipes,
  onOpenTasks,
  onOpenSchedule,
  onOpenLeads,
  onOpenDeals,
  onOpenQuotes,
  onOpenActivity,
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
  /** { right, bottom } px from viewport edges — anchors menu above the Menu button */
  anchor = null,
  className = 'mobile-action-bar-menu',
  backdropClassName = 'mobile-action-bar-menu-backdrop',
}) {
  if (!show || !anchor) return null

  const handlers = {
    pipes: onOpenPipes,
    tasks: onOpenTasks,
    schedule: onOpenSchedule,
    leads: onOpenLeads,
    deals: onOpenDeals,
    quotes: onOpenQuotes,
    activity: onOpenActivity,
  }

  const overflowSet = new Set(overflowPrimaryIds)
  const visibleOverflow = OVERFLOW_PRIMARY.filter((item) => {
    if (!overflowSet.has(item.id)) return false
    if (item.id === 'activity' && !currentUser) return false
    return true
  })

  const run = (fn) => {
    onClose?.()
    fn?.()
  }

  return (
    <>
      <div className={backdropClassName} onClick={onClose} aria-hidden="true" />
      <div
        className={`${className} map-panel hamburger-menu`}
        role="menu"
        style={
          anchor
            ? { right: `${anchor.right}px`, bottom: `${anchor.bottom}px`, left: 'auto' }
            : undefined
        }
      >
        {visibleOverflow.map(({ id, label, Icon, tour }) => (
          <button
            key={id}
            type="button"
            data-tour={tour}
            onClick={() => run(handlers[id])}
            className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1">{label}</span>
            {id === 'activity' && activityUnreadCount > 0 && (
              <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
                {activityUnreadCount > 99 ? '99+' : activityUnreadCount}
              </span>
            )}
          </button>
        ))}

        {visibleOverflow.length > 0 && (
          <div className="my-1 border-t hamburger-menu-divider" />
        )}

        <button
          type="button"
          data-tour="menu-lists"
          onClick={() => run(onOpenListPanel)}
          className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
        >
          <List className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1">Lists</span>
          {selectedListIds.length > 0 && (
            <Circle className="h-2 w-2 fill-amber-400 text-amber-400 flex-shrink-0" />
          )}
        </button>

        <button
          type="button"
          data-tour="menu-paths"
          onClick={() => run(onOpenPathsPanel)}
          className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
        >
          <Route className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1">Paths</span>
          {isPathTrackingActive && (
            <Circle className="h-2 w-2 fill-red-500 text-red-500 flex-shrink-0" />
          )}
        </button>

        <button
          type="button"
          data-tour="menu-outreach"
          onClick={() => run(onOpenOutreach)}
          className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
        >
          <Send className="h-4 w-4 flex-shrink-0" />
          <span>Outreach</span>
        </button>

        <button
          type="button"
          data-tour="menu-forms"
          onClick={() => run(onOpenForms)}
          className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
        >
          <FileText className="h-4 w-4 flex-shrink-0" />
          <span>Forms</span>
        </button>

        <button
          type="button"
          data-tour="menu-teams"
          onClick={() => run(onOpenTeamsPanel)}
          className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
        >
          <Users2 className="h-4 w-4 flex-shrink-0" />
          <span>Teams</span>
        </button>

        <div className="my-1 border-t hamburger-menu-divider" />

        {currentUser ? (
          <>
            <div className="px-4 py-2 border-b hamburger-menu-user">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {currentUser.displayName || 'User'}
              </p>
              <p className="text-xs text-gray-600 truncate">{currentUser.email}</p>
            </div>
            <button
              type="button"
              data-tour="menu-settings"
              onClick={() => run(onOpenSettings)}
              className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
            >
              <Settings className="h-4 w-4 flex-shrink-0" />
              <span>Settings</span>
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => run(onLogin)}
            className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
          >
            <User className="h-4 w-4 flex-shrink-0" />
            <span>Sign In</span>
          </button>
        )}
      </div>
    </>
  )
}
