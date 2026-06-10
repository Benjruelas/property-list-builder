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
  ClipboardList,
  Briefcase,
  Calendar,
  ListTodo,
  Bell,
  Camera,
} from 'lucide-react'
import { QuoteIcon } from './icons/QuoteIcon'
import { PipeIcon } from './PipeIcon'

/** Bar-primary items that only appear in the menu when they overflow off the action bar. */
const BAR_OVERFLOW_ONLY = [
  { id: 'pipes', label: 'Pipes', Icon: PipeIcon, tour: 'menu-pipes' },
  { id: 'tasks', label: 'Tasks', Icon: ListTodo, tour: 'menu-tasks' },
  { id: 'schedule', label: 'Schedule', Icon: Calendar, tour: 'menu-schedule' },
  { id: 'leads', label: 'Leads', Icon: UserSearch, tour: 'menu-leads' },
  { id: 'deals', label: 'Deals', Icon: Briefcase, tour: 'menu-deals' },
  { id: 'quotes', label: 'Quotes', Icon: QuoteIcon, tour: 'menu-quotes' },
  { id: 'forms', label: 'Forms', Icon: ClipboardList, tour: 'menu-forms' },
  { id: 'photos', label: 'Photos', Icon: Camera, tour: 'menu-photos' },
  { id: 'reports', label: 'Reports', Icon: FileText, tour: 'menu-reports' },
]

const TOOLS_MENU = [
  { id: 'lists', label: 'Lists', Icon: List, tour: 'menu-lists' },
  { id: 'paths', label: 'Paths', Icon: Route, tour: 'menu-paths' },
  { id: 'outreach', label: 'Outreach', Icon: Send, tour: 'menu-outreach' },
  { id: 'teams', label: 'Teams', Icon: Users2, tour: 'menu-teams' },
]

function MenuDivider() {
  return <div className="my-1 border-t hamburger-menu-divider" role="separator" />
}

function MenuButton({ tour, onClick, Icon, label, trailing = null }) {
  return (
    <button
      type="button"
      data-tour={tour}
      onClick={onClick}
      className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1">{label}</span>
      {trailing}
    </button>
  )
}

/**
 * Overflow menu for the floating action bar (and former desktop hamburger).
 */
export function ActionBarMenu({
  show,
  onClose,
  barIds = [],
  overflowPrimaryIds = [],
  onOpenPipes,
  onOpenTasks,
  onOpenSchedule,
  onOpenLeads,
  onOpenDeals,
  onOpenQuotes,
  onOpenPhotos,
  onOpenReports,
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
    photos: onOpenPhotos,
    reports: onOpenReports,
    lists: onOpenListPanel,
    forms: onOpenForms,
    activity: onOpenActivity,
    paths: onOpenPathsPanel,
    outreach: onOpenOutreach,
    teams: onOpenTeamsPanel,
  }

  const onBarSet = new Set(barIds.filter((id) => id !== 'menu'))
  const overflowSet = new Set(overflowPrimaryIds)

  const overflowMenuItems = BAR_OVERFLOW_ONLY.filter(
    (item) => overflowSet.has(item.id) && !onBarSet.has(item.id)
  )

  const toolsMenuItems = TOOLS_MENU.filter((item) => !onBarSet.has(item.id))

  const showActivityInMenu = currentUser && !onBarSet.has('activity')
  const showOverflowSection = overflowMenuItems.length > 0
  const showToolsSection = toolsMenuItems.length > 0
  const showTopDivider = showActivityInMenu && (showOverflowSection || showToolsSection)
  const showMiddleDivider = showOverflowSection && showToolsSection

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
        {showActivityInMenu && (
          <MenuButton
            tour="menu-notifications"
            Icon={Bell}
            label="Activity"
            onClick={() => run(onOpenActivity)}
            trailing={
              activityUnreadCount > 0 ? (
                <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
                  {activityUnreadCount > 99 ? '99+' : activityUnreadCount}
                </span>
              ) : null
            }
          />
        )}

        {showTopDivider && <MenuDivider />}

        {overflowMenuItems.map(({ id, label, Icon, tour }) => (
          <MenuButton
            key={id}
            tour={tour}
            Icon={Icon}
            label={label}
            onClick={() => run(handlers[id])}
          />
        ))}

        {showMiddleDivider && <MenuDivider />}

        {toolsMenuItems.map(({ id, label, Icon, tour }) => (
          <MenuButton
            key={id}
            tour={tour}
            Icon={Icon}
            label={label}
            onClick={() => run(handlers[id])}
            trailing={
              id === 'lists' && selectedListIds.length > 0 ? (
                <Circle className="h-2 w-2 fill-amber-400 text-amber-400 flex-shrink-0" />
              ) : id === 'paths' && isPathTrackingActive ? (
                <Circle className="h-2 w-2 fill-red-500 text-red-500 flex-shrink-0" />
              ) : null
            }
          />
        ))}

        <MenuDivider />

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
