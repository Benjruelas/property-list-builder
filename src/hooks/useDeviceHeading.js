import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Listens to DeviceOrientation and returns a smoothed compass heading (0-360, 0 = North).
 * Uses a low-pass filter to eliminate jitter from noisy sensor data.
 *
 * On iOS, events only fire after requestPermission() is granted.
 * Call requestPermission() from a user gesture, or pass requestOnMount=true
 * to auto-request when the hook mounts (requires prior user gesture context on iOS 13+).
 */
export function useDeviceHeading(requestOnMount = false) {
  const [heading, setHeading] = useState(null)
  const [permissionState, setPermissionState] = useState('unknown') // 'unknown' | 'granted' | 'denied' | 'not-needed'
  const smoothedRef = useRef(null)
  const lastEmittedRef = useRef(null)
  const rafPendingRef = useRef(false)
  const listenerAttachedRef = useRef(false)

  const ALPHA = 0.15
  const MIN_DELTA = 1

  const eventName = typeof window !== 'undefined' && 'ondeviceorientationabsolute' in window
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

  const attachListener = useCallback(() => {
    if (listenerAttachedRef.current) return
    listenerAttachedRef.current = true
    window.addEventListener(eventName, handleOrientation, { passive: true })
  }, [eventName, handleOrientation])

  const requestPermission = useCallback(async () => {
    if (typeof DeviceOrientationEvent === 'undefined') {
      setPermissionState('not-needed')
      attachListener()
      return 'not-needed'
    }
    if (typeof DeviceOrientationEvent.requestPermission !== 'function') {
      setPermissionState('not-needed')
      attachListener()
      return 'not-needed'
    }
    try {
      const result = await DeviceOrientationEvent.requestPermission()
      setPermissionState(result)
      if (result === 'granted') attachListener()
      return result
    } catch (err) {
      console.warn('DeviceOrientation permission error:', err)
      setPermissionState('denied')
      return 'denied'
    }
  }, [attachListener])

  useEffect(() => {
    if (typeof DeviceOrientationEvent === 'undefined') {
      attachListener()
      return
    }
    if (typeof DeviceOrientationEvent.requestPermission !== 'function') {
      attachListener()
      return
    }
    if (requestOnMount) {
      requestPermission()
    }

    return () => {
      if (listenerAttachedRef.current) {
        window.removeEventListener(eventName, handleOrientation)
        listenerAttachedRef.current = false
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { heading, permissionState, requestPermission }
}
