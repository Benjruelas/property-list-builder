import { useState } from 'react'
import { createPortal } from 'react-dom'
import { MapPin, Compass } from 'lucide-react'

const LS_KEY = 'permissions_granted'

export function hasGrantedPermissions() {
  try {
    return localStorage.getItem(LS_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Full-screen overlay requesting Location + Device Orientation.
 * iOS requires DeviceOrientationEvent.requestPermission() synchronously
 * from a user gesture — must be called FIRST before any other async work.
 *
 * @param onComplete(orientationGranted: boolean) — called when done;
 *   `orientationGranted` tells App whether the device orientation API is available.
 */
export function PermissionPrompt({ onComplete }) {
  const [requesting, setRequesting] = useState(false)

  async function handleGrant() {
    if (requesting) return
    setRequesting(true)

    let orientationGranted = false

    // Orientation MUST be requested first and synchronously from the gesture.
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const state = await DeviceOrientationEvent.requestPermission()
        orientationGranted = state === 'granted'
      } catch {
        // denied or unavailable
      }
    } else {
      // Non-iOS: orientation events don't need permission
      orientationGranted = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window
    }

    // Location — doesn't require gesture context, safe to call after await
    try {
      await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          () => resolve(),
          (err) => reject(err),
          { enableHighAccuracy: true, timeout: 10000 }
        )
      })
    } catch {
      // denied or timeout
    }

    try { localStorage.setItem(LS_KEY, '1') } catch { /* ignore */ }
    onComplete(orientationGranted)
  }

  const ui = (
    <div className="permission-prompt-overlay">
      <div className="permission-prompt-card">
        <div className="permission-prompt-icons">
          <div className="permission-prompt-icon">
            <MapPin className="h-8 w-8" />
          </div>
          <div className="permission-prompt-icon">
            <Compass className="h-8 w-8" />
          </div>
        </div>
        <h2 className="permission-prompt-title">Enable Location &amp; Orientation</h2>
        <p className="permission-prompt-desc">
          This app needs your location to show where you are on the map, and device orientation to rotate the map as you move.
        </p>
        <button
          type="button"
          className="permission-prompt-btn"
          onClick={handleGrant}
          disabled={requesting}
        >
          {requesting ? 'Requesting…' : 'Continue'}
        </button>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(ui, document.body) : null
}
