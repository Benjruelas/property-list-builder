import { useEffect, useRef } from 'react'

/**
 * Controls compass-based map rotation using a smoothed heading value.
 * Rotation is independent of follow-mode: the map stays oriented to
 * the user's heading even while they pan around freely.
 * Skips tiny changes (< 2 degrees) to keep the map calm during idle.
 */
export function CompassOrientation({ isActive, heading, mapRef }) {
  const lastBearingRef = useRef(null)

  useEffect(() => {
    const map = mapRef?.current
    if (!map || typeof map.setBearing !== 'function') return

    if (!isActive) {
      if (lastBearingRef.current !== 0) {
        map.setBearing(0)
        lastBearingRef.current = 0
      }
      return
    }

    if (heading != null) {
      const target = heading
      if (lastBearingRef.current != null) {
        let delta = target - lastBearingRef.current
        if (delta > 180) delta -= 360
        if (delta < -180) delta += 360
        if (Math.abs(delta) < 2) return
      }
      map.setBearing(target)
      lastBearingRef.current = target
    }
  }, [mapRef, isActive, heading])

  return null
}
