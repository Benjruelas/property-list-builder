import { useEffect } from 'react'
import { useMap } from 'react-leaflet'

/**
 * Enables/disables compass-based map rotation based on device orientation.
 * Requires map to have rotate: true (leaflet-rotate).
 */
export function CompassOrientation({ isActive }) {
  const map = useMap()

  useEffect(() => {
    if (!map || !map.compassBearing) return

    if (isActive) {
      map.compassBearing.enable()
    } else {
      map.compassBearing.disable()
      if (map.setBearing) {
        map.setBearing(0)
      }
    }

    return () => {
      if (map.compassBearing && map.compassBearing.enabled) {
        map.compassBearing.disable()
      }
    }
  }, [map, isActive])

  return null
}
