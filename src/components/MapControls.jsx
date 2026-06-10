import { Navigation, CheckSquare, Square, Compass, Route, Plus, X } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'

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
  onTogglePathTracking,
  isPathTrackingActive,
  currentUser,
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
    </div>
  )
}

