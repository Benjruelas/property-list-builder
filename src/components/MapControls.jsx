import { Navigation, Compass, Camera } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'
import { MAP_CHROME_BTN, MAP_CHROME_STACK_RIGHT } from '@/lib/mapChrome'

export function MapControls({
  onRecenter,
  locationPermission,
  onToggleCompass,
  isCompassActive,
  /** Called before every map-control action to dismiss any open parcel popup */
  onCloseParcelPopup,
  /** Quick Photo Mode — geolocate, resolve parcel, jump straight to camera. */
  onQuickPhotoMode,
}) {
  const locationUnavailable = locationPermission != null && locationPermission !== 'granted'
  // Run any map-control action through this so the parcel popup auto-closes.
  const runAction = (fn) => (...args) => {
    onCloseParcelPopup?.()
    return fn?.(...args)
  }

  return (
    <div className={MAP_CHROME_STACK_RIGHT}>
      <Button
        data-tour="recenter"
        onClick={runAction(onRecenter)}
        size="icon"
        variant={locationUnavailable ? "glass-outline" : "glass"}
        className={cn(
          MAP_CHROME_BTN,
          locationUnavailable && "border-amber-400/70 text-amber-700 dark:text-amber-300"
        )}
        title={locationUnavailable ? "Enable location" : "Recenter map"}
        aria-label={locationUnavailable ? "Enable location" : "Recenter map"}
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
          className={MAP_CHROME_BTN}
          title="Photo Mode — find this property and start shooting"
        >
          <Camera />
        </Button>
      )}
    </div>
  )
}
