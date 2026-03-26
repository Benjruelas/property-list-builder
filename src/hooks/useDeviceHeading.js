import { useState, useEffect, useRef, useCallback } from 'react'

const needsIOSPermission =
  typeof DeviceOrientationEvent !== 'undefined' &&
  typeof DeviceOrientationEvent.requestPermission === 'function'

/**
 * Smoothed compass heading (0-360, 0 = North).
 *
 * On iOS, call the returned `requestOrientation()` from a user-gesture handler
 * (e.g. onClick on the root container) so Safari grants DeviceOrientation access.
 * The grant does NOT persist across page loads on iOS.
 */
export function useDeviceHeading(enabled = false) {
  const [heading, setHeading] = useState(null)
  const smoothedRef = useRef(null)
  const lastEmittedRef = useRef(null)
  const rafPendingRef = useRef(false)
  const listeningRef = useRef(false)
  const grantedRef = useRef(false)

  const ALPHA = 0.15
  const MIN_DELTA = 1

  const eventName =
    typeof window !== 'undefined' && 'ondeviceorientationabsolute' in window
      ? 'deviceorientationabsolute'
      : 'deviceorientation'

  const handleOrientation = useCallback((e) => {
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
  }, [])

  const startListening = useCallback(() => {
    if (listeningRef.current) return
    listeningRef.current = true
    window.addEventListener(eventName, handleOrientation, { passive: true })
  }, [eventName, handleOrientation])

  // Non-iOS: start listening immediately when enabled
  useEffect(() => {
    if (!enabled || needsIOSPermission) return
    startListening()
    return () => {
      window.removeEventListener(eventName, handleOrientation)
      listeningRef.current = false
    }
  }, [enabled, eventName, handleOrientation, startListening])

  // iOS: try the immediate (no-gesture) requestPermission on mount.
  // If it works (e.g. same session as the first prompt), start listening.
  useEffect(() => {
    if (!enabled || !needsIOSPermission || grantedRef.current) return
    DeviceOrientationEvent.requestPermission()
      .then((state) => {
        if (state === 'granted') {
          grantedRef.current = true
          startListening()
        }
      })
      .catch(() => {})
  }, [enabled, startListening])

  /**
   * Call this from a React onClick/onTouchStart handler so iOS Safari
   * recognises a user gesture and grants orientation permission.
   */
  const requestOrientation = useCallback(() => {
    if (!needsIOSPermission || grantedRef.current) return
    DeviceOrientationEvent.requestPermission()
      .then((state) => {
        if (state === 'granted') {
          grantedRef.current = true
          startListening()
        }
      })
      .catch(() => {})
  }, [startListening])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (listeningRef.current) {
        window.removeEventListener(eventName, handleOrientation)
        listeningRef.current = false
      }
    }
  }, [eventName, handleOrientation])

  return { heading, requestOrientation }
}
