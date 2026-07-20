import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'

export const LOCATION_PERMISSION = Object.freeze({
  GRANTED: 'granted',
  PROMPT: 'prompt',
  DENIED: 'denied',
  UNSUPPORTED: 'unsupported',
})

/** Persists that the user previously attained a successful location grant. */
export const LOCATION_ACCESS_ATTAINED_KEY = 'location_access_attained'

const POSITION_ATTEMPTS = [
  { enableHighAccuracy: false, timeout: 28000, maximumAge: 300000 },
  { enableHighAccuracy: true, timeout: 35000, maximumAge: 0 },
]

export function hasAttainedLocationAccess() {
  try {
    return localStorage.getItem(LOCATION_ACCESS_ATTAINED_KEY) === '1'
  } catch {
    return false
  }
}

export function setLocationAccessAttained(attained = true) {
  try {
    if (attained) localStorage.setItem(LOCATION_ACCESS_ATTAINED_KEY, '1')
    else localStorage.removeItem(LOCATION_ACCESS_ATTAINED_KEY)
  } catch {
    /* ignore quota / private mode */
  }
}

/** Persist or clear the attained flag from a resolved permission state. */
export function syncLocationAccessAttained(state) {
  if (state === LOCATION_PERMISSION.GRANTED) setLocationAccessAttained(true)
  else if (state === LOCATION_PERMISSION.DENIED) setLocationAccessAttained(false)
}

/**
 * Whether a returning visit may silently probe getCurrentPosition when the
 * non-prompting permission check reports "prompt" (e.g. Safari without the
 * Permissions API). Never probes when access was never attained.
 */
export function shouldProbeLocationOnStartup(checkedState, attained = hasAttainedLocationAccess()) {
  return checkedState === LOCATION_PERMISSION.PROMPT && attained === true
}

export function normalizeNativeLocationPermission(result = {}) {
  const values = [result.location, result.coarseLocation].filter(Boolean)
  if (values.includes('granted')) return LOCATION_PERMISSION.GRANTED
  if (values.includes('prompt') || values.includes('prompt-with-rationale')) {
    return LOCATION_PERMISSION.PROMPT
  }
  return values.includes('denied')
    ? LOCATION_PERMISSION.DENIED
    : LOCATION_PERMISSION.UNSUPPORTED
}

export function isLocationPermissionDenied(error) {
  return error?.code === 1 ||
    error?.code === 'OS-PLUG-GLOC-0003' ||
    /denied|permission/i.test(error?.message || '')
}

/**
 * Inspect permission state without triggering browser or OS permission UI.
 */
export async function checkLocationPermission() {
  if (Capacitor.isNativePlatform()) {
    try {
      return normalizeNativeLocationPermission(await Geolocation.checkPermissions())
    } catch {
      return LOCATION_PERMISSION.UNSUPPORTED
    }
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return LOCATION_PERMISSION.UNSUPPORTED
  }

  if (!navigator.permissions?.query) return LOCATION_PERMISSION.PROMPT

  try {
    const result = await navigator.permissions.query({ name: 'geolocation' })
    if (result.state === 'granted') return LOCATION_PERMISSION.GRANTED
    if (result.state === 'denied') return LOCATION_PERMISSION.DENIED
    return LOCATION_PERMISSION.PROMPT
  } catch {
    // Safari versions without geolocation Permissions API support can still
    // request access from a user gesture.
    return LOCATION_PERMISSION.PROMPT
  }
}

/**
 * Request foreground location from a user gesture and return the first fix so
 * callers do not need to immediately request it a second time.
 */
export async function requestLocationAccess() {
  if (Capacitor.isNativePlatform()) {
    try {
      const state = normalizeNativeLocationPermission(
        await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] })
      )
      if (state !== LOCATION_PERMISSION.GRANTED) {
        syncLocationAccessAttained(state)
        return { state, position: null }
      }
      const position = await getCurrentPositionWithFallback()
      syncLocationAccessAttained(LOCATION_PERMISSION.GRANTED)
      return { state: LOCATION_PERMISSION.GRANTED, position }
    } catch (error) {
      const state = isLocationPermissionDenied(error)
        ? LOCATION_PERMISSION.DENIED
        : await checkLocationPermission()
      syncLocationAccessAttained(state)
      return { state, position: null, error }
    }
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return { state: LOCATION_PERMISSION.UNSUPPORTED, position: null }
  }

  try {
    const position = await getCurrentPositionWithFallback()
    syncLocationAccessAttained(LOCATION_PERMISSION.GRANTED)
    return { state: LOCATION_PERMISSION.GRANTED, position }
  } catch (error) {
    const state = isLocationPermissionDenied(error)
      ? LOCATION_PERMISSION.DENIED
      : await checkLocationPermission()
    syncLocationAccessAttained(state)
    return { state, position: null, error }
  }
}

/**
 * Desktop browsers often time out with high accuracy because GPS is absent.
 * Retry recoverable failures with high accuracy, but never retry denial.
 */
export async function getCurrentPositionWithFallback() {
  if (Capacitor.isNativePlatform()) {
    let lastError
    for (const options of POSITION_ATTEMPTS) {
      try {
        return await Geolocation.getCurrentPosition(options)
      } catch (error) {
        lastError = error
        if (isLocationPermissionDenied(error)) throw error
      }
    }
    throw lastError || new Error('Geolocation failed after retries')
  }

  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation not supported'))
      return
    }
    let i = 0
    let lastError
    const run = () => {
      if (i >= POSITION_ATTEMPTS.length) {
        reject(lastError || new Error('Geolocation failed after retries'))
        return
      }
      const opts = POSITION_ATTEMPTS[i++]
      navigator.geolocation.getCurrentPosition(
        resolve,
        (error) => {
          lastError = error
          if (isLocationPermissionDenied(error)) {
            reject(error)
            return
          }
          console.warn('[geolocation] getCurrentPosition attempt failed', error?.code, opts)
          run()
        },
        opts
      )
    }
    run()
  })
}

/** Continuous updates: prefer low accuracy on non-touch devices to avoid flaky watch on desktop. */
export function getWatchPositionOptions() {
  const touch =
    typeof navigator !== 'undefined' &&
    (navigator.maxTouchPoints > 0 ||
      (typeof window !== 'undefined' && 'ontouchstart' in window))
  return {
    enableHighAccuracy: touch,
    timeout: 25000,
    maximumAge: 15000,
  }
}

/**
 * Start native or browser tracking and return an idempotent cleanup callback.
 */
export async function watchLocation(onPosition, onError) {
  if (Capacitor.isNativePlatform()) {
    const id = await Geolocation.watchPosition(
      getWatchPositionOptions(),
      (position, error) => {
        if (error) onError?.(error)
        else if (position) onPosition(position)
      }
    )
    let cleared = false
    return () => {
      if (cleared) return
      cleared = true
      void Geolocation.clearWatch({ id })
    }
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('Geolocation not supported')
  }
  const id = navigator.geolocation.watchPosition(
    onPosition,
    onError,
    getWatchPositionOptions()
  )
  let cleared = false
  return () => {
    if (cleared) return
    cleared = true
    navigator.geolocation.clearWatch(id)
  }
}
