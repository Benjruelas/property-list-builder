import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'

/**
 * Controls compass-based map rotation using a smoothed heading value.
 * Respects follow-mode: only updates bearing when isFollowing is true.
 * Requires map to have rotate: true (leaflet-rotate).
 */
export function CompassOrientation({ isActive, heading, isFollowing }) {
  const map = useMap()
  const disabledNativeRef = useRef(false)

  useEffect(() => {
    if (!map || !map.compassBearing) return

    if (map.compassBearing.enabled && !disabledNativeRef.current) {
      map.compassBearing.disable()
      disabledNativeRef.current = true
    }
  }, [map])

  useEffect(() => {
    if (!map || !map.setBearing) return

    if (!isActive) {
      map.setBearing(0)
      return
    }

    if (isFollowing && heading != null) {
      map.setBearing(-heading)
    }
  }, [map, isActive, isFollowing, heading])

  return null
}
