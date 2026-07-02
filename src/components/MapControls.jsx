import { Navigation, CheckSquare, Square, Compass, Route, Plus, X, Camera } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'

const MAP_CHROME_BTN = 'map-chrome-btn shadow-lg touch-manipulation'

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
  /** Quick Photo Mode — geolocate, resolve parcel, jump straight to camera. Desktop users get this on the action bar instead. */
  onQuickPhotoMode,
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
        className={MAP_CHROME_BTN}
        title="Recenter map"
      >
        <Navigation />
      </Button>
      <Button
        data-tour="compass"
        onClick={runAction(onToggleCompass)}
        size="icon"
        variant={isCompassActive ? "glass" : "glass-outline"}
        className={cn(
          MAP_CHROME_BTN,
          isCompassActive && "bg-amber-500/80 hover:bg-amber-600/90 border-amber-400/50 text-white"
        )}
        title={isCompassActive ? "Disable compass (map faces your direction)" : "Enable compass (orient map to face your direction)"}
      >
        <Compass />
      </Button>
      {onQuickPhotoMode && (
        <Button
          data-tour="photo-mode"
          onClick={runAction(onQuickPhotoMode)}
          size="icon"
          variant="glass"
          className={cn(MAP_CHROME_BTN, 'md:hidden')}
          title="Photo Mode — find this property and start shooting"
        >
          <Camera />
        </Button>
      )}
      <div className="map-chrome-slot relative flex shrink-0 items-center justify-center">
        {multiSelectAddToListMode && (
          <Button
            type="button"
            size="icon"
            variant="glass"
            onClick={runAction(() => onCancelMultiSelect?.())}
            className={cn(
              MAP_CHROME_BTN,
              'absolute right-full top-1/2 z-10 mr-2 -translate-y-1/2 bg-red-600/90 hover:bg-red-700/95 border-red-400/60 text-white'
            )}
            title="Cancel multi-select and clear selection"
          >
            <X strokeWidth={2.5} />
          </Button>
        )}
        {multiSelectAddToListMode ? (
          <Button
            data-tour="multi-select"
            onClick={runAction(() => onOpenListPanel())}
            size="icon"
            variant="glass"
            className={cn(
              MAP_CHROME_BTN,
              'shrink-0 bg-blue-600/90 hover:bg-blue-700/95 border-blue-400/60 text-white'
            )}
            title={`Add ${multiSelectParcelCount} selected parcel${multiSelectParcelCount === 1 ? "" : "s"} to a list`}
          >
            <Plus strokeWidth={2.5} />
          </Button>
        ) : (
          <Button
            data-tour="multi-select"
            onClick={runAction(onToggleMultiSelect)}
            size="icon"
            variant={isMultiSelectActive ? "glass" : "glass-outline"}
            className={cn(
              MAP_CHROME_BTN,
              'shrink-0',
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
            {isMultiSelectActive ? <CheckSquare /> : <Square />}
          </Button>
        )}
      </div>
      <Button
        data-tour="path-recording"
        onClick={runAction(onTogglePathTracking)}
        size="icon"
        variant={isPathTrackingActive ? "glass" : "glass-outline"}
        className={cn(
          MAP_CHROME_BTN,
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
        <Route />
      </Button>
    </div>
  )
}
