import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Smoothed compass heading (0-360, 0 = North).
 *
 * @param {boolean} enabled - When true, attach the orientation listener.
 *   Pass `permissionsReady` from the PermissionPrompt flow so the listener
 *   starts only after iOS has granted DeviceOrientation access via user gesture.
 */
export function useDeviceHeading(enabled = false) {
  const [heading, setHeading] = useState(null)
  const smoothedRef = useRef(null)
  const lastEmittedRef = useRef(null)
  const rafPendingRef = useRef(false)

  const ALPHA = 0.15
  const MIN_DELTA = 1

  useEffect(() => {
    if (!enabled) return

    const eventName = 'ondeviceorientationabsolute' in window
      ? 'deviceorientationabsolute'
      : 'deviceorientation'

    const handleOrientation = (e) => {
      let angle = e.webkitCompassHeading ?? e.alpha
      if (angle == null) return

      if (!e.absolute && e.webkitCompassHeading != null) {
        angle = 360 - angle
      }
      if (!e.absolute && typeof window.orientation === 'number') {
        angle = (angle - window.orientation + 360) % 360
      }

      const raw = ((angle % 360) + 360) % 360

      if (smoothedRef.current === null) {
        smoothedRef.current = raw
        lastEmittedRef.current = raw
        setHeading(raw)
        return
      }

      let delta = raw - smoothedRef.current
      if (delta > 180) delta -= 360
      if (delta < -180) delta += 360

      smoothedRef.current = ((smoothedRef.current + ALPHA * delta) % 360 + 360) % 360

      if (rafPendingRef.current) return
      rafPendingRef.current = true

      requestAnimationFrame(() => {
        rafPendingRef.current = false
        const current = smoothedRef.current
        if (lastEmittedRef.current === null) {
          lastEmittedRef.current = current
          setHeading(current)
          return
        }
        let emitDelta = current - lastEmittedRef.current
        if (emitDelta > 180) emitDelta -= 360
        if (emitDelta < -180) emitDelta += 360
        if (Math.abs(emitDelta) >= MIN_DELTA) {
          lastEmittedRef.current = current
          setHeading(current)
        }
      })
    }

    window.addEventListener(eventName, handleOrientation, { passive: true })
    return () => {
      window.removeEventListener(eventName, handleOrientation)
    }
  }, [enabled])

  return heading
}
