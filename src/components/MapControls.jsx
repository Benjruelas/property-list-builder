import { Navigation, CheckSquare, Square, List, Circle, Send, User, Menu, Compass, Route, Settings, UserSearch, Users2, Plus, X, FileText, Calendar, ListTodo } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'

/**
 * Hardware pipe icon (L-shaped section with rectangular flanges on both open
 * ends). Kept in sync with the MobileActionBar glyph so desktop/mobile share
 * the same "Pipes" visual identity.
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

export function MapControls({ 
  onRecenter, 
  onToggleCompass,
  isCompassActive,
  onToggleMultiSelect, 
  isMultiSelectActive, 
  /** When multi-select is on, number of parcels currently selected (from parent Set size) */
  multiSelectParcelCount = 0,
  onCancelMultiSelect,
  onOpenListPanel, 
  selectedListIds = [], 
  onOpenOutreach,
  onTogglePathTracking,
  isPathTrackingActive,
  onOpenPathsPanel,
  onOpenTeamsPanel,
  onOpenSettings,
  onOpenLeads,
  onOpenForms,
  onOpenPipes,
  onOpenTasks,
  onOpenSchedule,
  currentUser,
  onLogin,
  onLogout,
  showMenu,
  setShowMenu,
  /** When true, the hamburger menu button is hidden at mobile breakpoints
   *  (e.g. because the MobileActionBar is rendering the menu instead). */
  hideMenuOnMobile = false,
  /** Called before every map-control action to dismiss any open parcel popup */
  onCloseParcelPopup,
}) {
  const multiSelectAddToListMode = isMultiSelectActive && multiSelectParcelCount > 0
  // Run any map-control action through this so the parcel popup auto-closes.
  const runAction = (fn) => (...args) => {
    onCloseParcelPopup?.()
    return fn?.(...args)
  }

  return (
    <div className="map-controls-stack absolute z-[1000] flex flex-col items-end gap-2 sm:gap-2 md:gap-2" style={{ top: 'calc(12px + env(safe-area-inset-top, 0px))', right: 'calc(12px + env(safe-area-inset-right, 0px))' }}>
      <Button
        data-tour="recenter"
        onClick={runAction(onRecenter)}
        size="icon"
        variant="glass"
        className="h-12 w-12 sm:h-10 sm:w-10 shadow-lg touch-manipulation"
        title="Recenter map"
      >
        <Navigation className="h-6 w-6 sm:h-5 sm:w-5" />
      </Button>
      <Button
        data-tour="compass"
        onClick={runAction(onToggleCompass)}
        size="icon"
        variant={isCompassActive ? "glass" : "glass-outline"}
        className={cn(
          "h-12 w-12 sm:h-10 sm:w-10 shadow-lg touch-manipulation",
          isCompassActive && "bg-amber-500/80 hover:bg-amber-600/90 border-amber-400/50 text-white"
        )}
        title={isCompassActive ? "Disable compass (map faces your direction)" : "Enable compass (orient map to face your direction)"}
      >
        <Compass className="h-6 w-6 sm:h-5 sm:w-5" />
      </Button>
      {/* Fixed slot size matches other controls; X is absolutely positioned so column width stays 48px */}
      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center sm:h-10 sm:w-10">
        {multiSelectAddToListMode && (
          <Button
            type="button"
            size="icon"
            variant="glass"
            onClick={runAction(() => onCancelMultiSelect?.())}
            className="absolute right-full top-1/2 z-10 mr-2 h-12 w-12 -translate-y-1/2 shadow-lg touch-manipulation bg-red-600/90 hover:bg-red-700/95 border-red-400/60 text-white sm:h-10 sm:w-10"
            title="Cancel multi-select and clear selection"
          >
            <X className="h-6 w-6 sm:h-5 sm:w-5" strokeWidth={2.5} />
          </Button>
        )}
        {multiSelectAddToListMode ? (
          <Button
            data-tour="multi-select"
            onClick={runAction(() => onOpenListPanel())}
            size="icon"
            variant="glass"
            className="h-12 w-12 shrink-0 shadow-lg touch-manipulation bg-blue-600/90 hover:bg-blue-700/95 border-blue-400/60 text-white sm:h-10 sm:w-10"
            title={`Add ${multiSelectParcelCount} selected parcel${multiSelectParcelCount === 1 ? "" : "s"} to a list`}
          >
            <Plus className="h-6 w-6 sm:h-5 sm:w-5" strokeWidth={2.5} />
          </Button>
        ) : (
          <Button
            data-tour="multi-select"
            onClick={runAction(onToggleMultiSelect)}
            size="icon"
            variant={isMultiSelectActive ? "glass" : "glass-outline"}
            className={cn(
              "h-12 w-12 shrink-0 shadow-lg touch-manipulation sm:h-10 sm:w-10",
              isMultiSelectActive && "bg-green-600/80 hover:bg-green-700/90 border-green-400/50 text-white",
              !currentUser && "opacity-50 cursor-not-allowed"
            )}
            disabled={!currentUser}
            title={
              !currentUser
                ? "Sign in to use multi-select"
                : isMultiSelectActive
                  ? "Multi-select ON - Click to turn off"
                  : "Multi-select OFF - Click to turn on"
            }
          >
            {isMultiSelectActive ? (
              <CheckSquare className="h-6 w-6 sm:h-5 sm:w-5" />
            ) : (
              <Square className="h-6 w-6 sm:h-5 sm:w-5" />
            )}
          </Button>
        )}
      </div>
      <Button
        data-tour="path-recording"
        onClick={runAction(onTogglePathTracking)}
        size="icon"
        variant={isPathTrackingActive ? "glass" : "glass-outline"}
        className={cn(
          "h-12 w-12 sm:h-10 sm:w-10 shadow-lg touch-manipulation",
          isPathTrackingActive &&
            "path-tracking-active bg-red-600/80 hover:bg-red-700/90 border-red-400/50 text-white",
          !currentUser && "opacity-50 cursor-not-allowed"
        )}
        disabled={!currentUser}
        title={!currentUser
          ? "Sign in to record paths"
          : isPathTrackingActive
            ? "Recording path - tap to stop & save"
            : "Start recording path"}
      >
        <Route className="h-6 w-6 sm:h-5 sm:w-5" />
      </Button>
      
      {/* Menu Dropdown */}
      <div className={cn("relative", hideMenuOnMobile && "map-controls-menu--hide-mobile")}>
        <Button
          data-tour="menu"
          onClick={runAction(() => {
            const next = !showMenu
            if (next && isMultiSelectActive) {
              onCancelMultiSelect?.()
            }
            setShowMenu(next)
          })}
          size="icon"
          variant="glass-outline"
          className={cn(
            "h-12 w-12 sm:h-10 sm:w-10 shadow-lg touch-manipulation",
            showMenu && "bg-white/20 border-white/40"
          )}
          title="Menu"
        >
          <Menu className="h-6 w-6 sm:h-5 sm:w-5" />
        </Button>
        {showMenu && (
          <>
            <div 
              className="fixed inset-0 z-[999]" 
              onClick={() => setShowMenu(false)}
            />
            <div className="map-panel hamburger-menu absolute right-full top-0 mr-2 rounded-xl min-w-[200px] z-[1000] py-2">
              {/* Pipes / Tasks / Schedule — surfaced here on desktop since the
                  MobileActionBar is hidden at md+. Keep them at the top so
                  primary deal-flow actions are one menu-open away. */}
              {onOpenPipes && (
                <button
                  data-tour="menu-pipes"
                  onClick={() => {
                    setShowMenu(false)
                    onOpenPipes()
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
                >
                  <PipeIcon className="h-4 w-4 flex-shrink-0" />
                  <span>Pipes</span>
                </button>
              )}

              {onOpenTasks && (
                <button
                  data-tour="menu-tasks"
                  onClick={() => {
                    setShowMenu(false)
                    onOpenTasks()
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
                >
                  <ListTodo className="h-4 w-4 flex-shrink-0" />
                  <span>Tasks</span>
                </button>
              )}

              {onOpenSchedule && (
                <button
                  data-tour="menu-schedule"
                  onClick={() => {
                    setShowMenu(false)
                    onOpenSchedule()
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
                >
                  <Calendar className="h-4 w-4 flex-shrink-0" />
                  <span>Schedule</span>
                </button>
              )}

              {(onOpenPipes || onOpenTasks || onOpenSchedule) && (
                <div className="my-1 border-t border-gray-200" />
              )}

              {/* Lists Button */}
              <button
                data-tour="menu-lists"
                onClick={() => {
                  setShowMenu(false)
                  onOpenListPanel()
                }}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
              >
                <List className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1">Lists</span>
                {selectedListIds.length > 0 && (
                  <Circle className="h-2 w-2 fill-amber-400 text-amber-400 flex-shrink-0" />
                )}
              </button>

              {/* Paths Button */}
              <button
                data-tour="menu-paths"
                onClick={() => {
                  setShowMenu(false)
                  onOpenPathsPanel?.()
                }}
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
                onClick={() => {
                  setShowMenu(false)
                  onOpenOutreach?.()
                }}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
              >
                <Send className="h-4 w-4 flex-shrink-0" />
                <span>Outreach</span>
              </button>

              {/* Leads */}
              <button
                data-tour="menu-leads"
                onClick={() => {
                  setShowMenu(false)
                  onOpenLeads?.()
                }}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
              >
                <UserSearch className="h-4 w-4 flex-shrink-0" />
                <span>Leads</span>
              </button>

              {/* Forms */}
              <button
                data-tour="menu-forms"
                onClick={() => {
                  setShowMenu(false)
                  onOpenForms?.()
                }}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
              >
                <FileText className="h-4 w-4 flex-shrink-0" />
                <span>Forms</span>
              </button>

              {/* Teams */}
              <button
                data-tour="menu-teams"
                onClick={() => {
                  setShowMenu(false)
                  onOpenTeamsPanel?.()
                }}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
              >
                <Users2 className="h-4 w-4 flex-shrink-0" />
                <span>Teams</span>
              </button>

              {/* Divider */}
              <div className="my-1 border-t border-gray-200" />

              {/* User Section */}
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
                    onClick={() => {
                      setShowMenu(false)
                      onOpenSettings?.()
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
                  >
                    <Settings className="h-4 w-4 flex-shrink-0" />
                    <span>Settings</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setShowMenu(false)
                    onLogin()
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
                >
                  <User className="h-4 w-4 flex-shrink-0" />
                  <span>Sign In</span>
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

