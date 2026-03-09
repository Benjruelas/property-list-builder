import React, { useState } from 'react'
import { Navigation, CheckSquare, Square, List, Circle, Phone, Mail, MessageSquare, User, LogOut, Menu, Compass, LayoutList, Calendar, Settings } from 'lucide-react'
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
  onOpenEmailTemplates,
  onOpenTextTemplates,
  onOpenDealPipeline,
  onOpenSchedule,
  onOpenSettings,
  currentUser,
  onLogin,
  onLogout
}) {
  const [showMenu, setShowMenu] = useState(false)

  return (
    <div className="map-controls-stack absolute z-[1000] flex flex-col gap-2 sm:gap-2 md:gap-2" style={{ top: 'calc(12px + env(safe-area-inset-top, 0px))', right: 'calc(12px + env(safe-area-inset-right, 0px))' }}>
      <Button
        onClick={onRecenter}
        size="icon"
        variant="glass"
        className="h-12 w-12 sm:h-10 sm:w-10 shadow-lg touch-manipulation"
        title="Recenter map"
      >
        <Navigation className="h-6 w-6 sm:h-5 sm:w-5" />
      </Button>
      <Button
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
      
      {/* Menu Dropdown */}
      <div className="relative">
        <Button
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
            <div className="map-panel hamburger-menu absolute right-0 top-14 rounded-xl min-w-[200px] z-[1000] py-2">
              {/* Lists Button */}
              <button
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

              {/* Skip Traced Parcels Button */}
              <button
                onClick={() => {
                  setShowMenu(false)
                  onOpenSkipTracedListPanel()
                }}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
              >
                <Phone className="h-4 w-4 flex-shrink-0" />
                <span>Skip Traced Parcels</span>
              </button>

              {/* Email Templates Button */}
              <button
                onClick={() => {
                  setShowMenu(false)
                  onOpenEmailTemplates()
                }}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
              >
                <Mail className="h-4 w-4 flex-shrink-0" />
                <span>Email Templates</span>
              </button>

              {/* Text Message Templates Button */}
              <button
                onClick={() => {
                  setShowMenu(false)
                  onOpenTextTemplates?.()
                }}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
              >
                <MessageSquare className="h-4 w-4 flex-shrink-0" />
                <span>Text Templates</span>
              </button>

              {/* Pipelines Button */}
              <button
                onClick={() => {
                  setShowMenu(false)
                  onOpenDealPipeline?.()
                }}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
              >
                <LayoutList className="h-4 w-4 flex-shrink-0" />
                <span>Pipelines</span>
              </button>

              {/* Schedule Button */}
              <button
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
                  {onOpenSettings && (
                    <button
                      onClick={() => {
                        setShowMenu(false)
                        onOpenSettings()
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm text-gray-900 flex items-center gap-3 transition-colors hamburger-menu-btn"
                    >
                      <Settings className="h-4 w-4 flex-shrink-0" />
                      <span>Settings</span>
                    </button>
                  )}
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

