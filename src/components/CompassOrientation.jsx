import { useEffect, useRef } from 'react'

/**
 * Controls compass-based map rotation using a smoothed heading value.
 * Rotation is independent of follow-mode: the map stays oriented to
 * the user's heading even while they pan around freely.
 * Skips tiny changes (< 2 degrees) to keep the map calm during idle.
 *
 * Heading updates arrive via subscription (not props/state) so multi-Hz
 * sensor events rotate the map imperatively without any React re-render.
 */
export function CompassOrientation({ isActive, mapRef, getHeading, subscribeHeading }) {
  const lastBearingRef = useRef(null)

  useEffect(() => {
    const apply = (heading) => {
      const map = mapRef?.current
      if (!map || typeof map.setBearing !== 'function' || heading == null) return
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

    if (!isActive) {
      const map = mapRef?.current
      if (map && typeof map.setBearing === 'function' && lastBearingRef.current !== 0) {
        map.setBearing(0)
        lastBearingRef.current = 0
      }
      return undefined
    }

    apply(getHeading?.())
    return subscribeHeading ? subscribeHeading(apply) : undefined
  }, [mapRef, isActive, getHeading, subscribeHeading])

  return null
}
