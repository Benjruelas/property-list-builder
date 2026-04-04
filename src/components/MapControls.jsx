import React from 'react'
import { Navigation, CheckSquare, Square, List, Circle, Phone, Send, User, LogOut, Menu, Compass, LayoutList, Route, Settings, Users, ListTodo, Calendar } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'
export function MapControls({ 
  onRecenter, 
  onToggleCompass,
  isCompassActive,
  onToggleMultiSelect, 
  isMultiSelectActive, 
  onOpenListPanel, 
  selectedListIds = [], 
  onOpenSkipTracedListPanel, 
  onOpenOutreach,
  onOpenDealPipeline,
  onOpenTasks,
  onOpenSchedule,
  onTogglePathTracking,
  isPathTrackingActive,
  onOpenPathsPanel,
  onOpenSettings,
  onOpenLeads,
  currentUser,
  onLogin,
  onLogout,
  showMenu,
  setShowMenu
}) {

  return (
    <div className="map-controls-stack absolute z-[1000] flex flex-col gap-2 sm:gap-2 md:gap-2" style={{ top: 'calc(12px + env(safe-area-inset-top, 0px))', right: 'calc(12px + env(safe-area-inset-right, 0px))' }}>
      <Button
        data-tour="recenter"
        onClick={onRecenter}
        size="icon"
        variant="glass"
        className="h-12 w-12 sm:h-10 sm:w-10 shadow-lg touch-manipulation"
        title="Recenter map"
      >
        <Navigation className="h-6 w-6 sm:h-5 sm:w-5" />
      </Button>
      <Button
        data-tour="compass"
        onClick={onToggleCompass}
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
      <Button
        data-tour="multi-select"
        onClick={onToggleMultiSelect}
        size="icon"
        variant={isMultiSelectActive ? "glass" : "glass-outline"}
        className={cn(
          "h-12 w-12 sm:h-10 sm:w-10 shadow-lg touch-manipulation",
          isMultiSelectActive && "bg-green-600/80 hover:bg-green-700/90 border-green-400/50 text-white",
          !currentUser && "opacity-50 cursor-not-allowed"
        )}
        disabled={!currentUser}
        title={!currentUser 
          ? "Sign in to use multi-select" 
          : isMultiSelectActive 
            ? "Multi-select ON - Click to turn off" 
            : "Multi-select OFF - Click to turn on"}
      >
        {isMultiSelectActive ? (
          <CheckSquare className="h-6 w-6 sm:h-5 sm:w-5" />
        ) : (
          <Square className="h-6 w-6 sm:h-5 sm:w-5" />
        )}
      </Button>
      <Button
        data-tour="path-recording"
        onClick={onTogglePathTracking}
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
      <div className="relative">
        <Button
          data-tour="menu"
          onClick={() => setShowMenu(!showMenu)}
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

              {/* Skip Traced Parcels Button */}
              <button
                data-tour="menu-skip-traced"
                onClick={() => {
                  setShowMenu(false)
                  onOpenSkipTracedListPanel()
                }}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
              >
                <Phone className="h-4 w-4 flex-shrink-0" />
                <span>Skip Traced Parcels</span>
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

              {/* Deal Pipeline Button */}
              <button
                data-tour="menu-pipeline"
                onClick={() => {
                  setShowMenu(false)
                  onOpenDealPipeline?.()
                }}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
              >
                <LayoutList className="h-4 w-4 flex-shrink-0" />
                <span>Deal Pipeline</span>
              </button>

              {/* Leads Button */}
              <button
                data-tour="menu-leads"
                onClick={() => {
                  setShowMenu(false)
                  onOpenLeads?.()
                }}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
              >
                <Users className="h-4 w-4 flex-shrink-0" />
                <span>Leads</span>
              </button>

              {/* Tasks — list by pipeline (not calendar) */}
              <button
                data-tour="menu-tasks"
                onClick={() => {
                  setShowMenu(false)
                  onOpenTasks?.()
                }}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
              >
                <ListTodo className="h-4 w-4 flex-shrink-0" />
                <span>Tasks</span>
              </button>

              {/* Schedule — calendar view */}
              <button
                data-tour="menu-schedule"
                onClick={() => {
                  setShowMenu(false)
                  onOpenSchedule?.()
                }}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
              >
                <Calendar className="h-4 w-4 flex-shrink-0" />
                <span>Schedule</span>
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
                  <button
                    onClick={async () => {
                      setShowMenu(false)
                      if (onLogout) {
                        await onLogout()
                      }
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
                  >
                    <LogOut className="h-4 w-4 flex-shrink-0" />
                    <span>Sign Out</span>
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

