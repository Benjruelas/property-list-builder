/**
 * External store for the user's live GPS location.
 *
 * GPS fixes arrive ~1/sec while canvassing; holding them in App state
 * re-rendered the entire tree (map included) on every tick. Components that
 * genuinely need the location subscribe here instead — either imperatively
 * (map follow/centering, path tracking) or via the `useUserLocation` hook
 * (location marker), so only they update.
 */

import { useSyncExternalStore } from 'react'

let currentLocation = null
const listeners = new Set()

export function getUserLocation() {
  return currentLocation
}

export function setCurrentUserLocation(location) {
  currentLocation = location
  for (const fn of listeners) {
    try {
      fn(location)
    } catch {
      /* listener errors must not break the GPS pipeline */
    }
  }
}

/** Subscribe to location updates. Returns an unsubscribe function. */
export function subscribeUserLocation(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** React hook — re-renders only the calling component on GPS updates. */
export function useUserLocation() {
  return useSyncExternalStore(subscribeUserLocation, getUserLocation)
}
