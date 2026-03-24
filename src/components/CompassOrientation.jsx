import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'

/**
 * Controls compass-based map rotation using a smoothed heading value.
 * Respects follow-mode: only updates bearing when isFollowing is true.
 * Skips tiny changes (< 2 degrees) to keep the map calm during idle.
 * Requires map to have rotate: true (leaflet-rotate).
 */
export function CompassOrientation({ isActive, heading, isFollowing }) {
  const map = useMap()
  const disabledNativeRef = useRef(false)
  const lastBearingRef = useRef(null)

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
      if (lastBearingRef.current !== 0) {
        map.setBearing(0)
        lastBearingRef.current = 0
      }
      return
    }

    if (isFollowing && heading != null) {
      const target = -heading
      if (lastBearingRef.current != null) {
        let delta = target - lastBearingRef.current
        if (delta > 180) delta -= 360
        if (delta < -180) delta += 360
        if (Math.abs(delta) < 2) return
      }
      map.setBearing(target)
      lastBearingRef.current = target
    }
  }, [map, isActive, isFollowing, heading])

  return null
}
