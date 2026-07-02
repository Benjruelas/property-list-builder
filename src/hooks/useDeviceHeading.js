import { useState, useEffect, useRef, useCallback } from 'react'

const needsIOSPermission =
  typeof DeviceOrientationEvent !== 'undefined' &&
  typeof DeviceOrientationEvent.requestPermission === 'function'

/**
 * Smoothed compass heading (0-360, 0 = North).
 *
 * Returns { getHeading, subscribeHeading, requestOrientation, needsGesture }.
 * Heading updates are delivered through the subscription (and readable via
 * `getHeading()`) instead of React state so multi-Hz orientation events never
 * re-render the component tree — consumers apply them imperatively.
 * On iOS, `needsGesture` is true until the user has tapped and orientation
 * permission has been granted for this page load.  Call `requestOrientation()`
 * from a user-gesture handler (onClick) when `needsGesture` is true.
 */
export function useDeviceHeading(enabled = false) {
  const [needsGesture, setNeedsGesture] = useState(needsIOSPermission)
  const headingRef = useRef(null)
  const subscribersRef = useRef(new Set())
  const smoothedRef = useRef(null)
  const lastEmittedRef = useRef(null)
  const rafPendingRef = useRef(false)
  const listeningRef = useRef(false)
  const grantedRef = useRef(false)

  const getHeading = useCallback(() => headingRef.current, [])

  const subscribeHeading = useCallback((fn) => {
    subscribersRef.current.add(fn)
    return () => subscribersRef.current.delete(fn)
  }, [])

  const emitHeading = useCallback((value) => {
    headingRef.current = value
    for (const fn of subscribersRef.current) {
      try {
        fn(value)
      } catch {
        /* subscriber errors must not break the sensor pipeline */
      }
    }
  }, [])

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
      emitHeading(raw)
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
        emitHeading(current)
        return
      }
      let emitDelta = current - lastEmittedRef.current
      if (emitDelta > 180) emitDelta -= 360
      if (emitDelta < -180) emitDelta += 360
      if (Math.abs(emitDelta) >= MIN_DELTA) {
        lastEmittedRef.current = current
        emitHeading(current)
      }
    })
  }, [emitHeading])

  const startListening = useCallback(() => {
    if (listeningRef.current) return
    listeningRef.current = true
    window.addEventListener(eventName, handleOrientation, { passive: true })
  }, [eventName, handleOrientation])

  const markGranted = useCallback(() => {
    grantedRef.current = true
    setNeedsGesture(false)
    startListening()
  }, [startListening])

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
  useEffect(() => {
    if (!enabled || !needsIOSPermission || grantedRef.current) return
    DeviceOrientationEvent.requestPermission()
      .then((state) => {
        if (state === 'granted') markGranted()
      })
      .catch(() => {})
  }, [enabled, markGranted])

  /**
   * Call from a React onClick handler to satisfy iOS gesture requirement.
   * Returns a Promise<boolean> indicating whether permission was freshly granted.
   */
  const requestOrientation = useCallback(async () => {
    if (!needsIOSPermission || grantedRef.current) return false
    try {
      const state = await DeviceOrientationEvent.requestPermission()
      if (state === 'granted') {
        markGranted()
        return true
      }
    } catch { /* denied */ }
    return false
  }, [markGranted])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (listeningRef.current) {
        window.removeEventListener(eventName, handleOrientation)
        listeningRef.current = false
      }
    }
  }, [eventName, handleOrientation])

  return { getHeading, subscribeHeading, requestOrientation, needsGesture }
}
