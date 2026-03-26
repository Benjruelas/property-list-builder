import { useState } from 'react'
import { createPortal } from 'react-dom'
import { MapPin, Compass } from 'lucide-react'

const LS_KEY = 'permissions_granted'

/**
 * Check whether the user has already dismissed the permission prompt.
 * Used by App to skip the overlay on subsequent loads.
 */
export function hasGrantedPermissions() {
  try {
    return localStorage.getItem(LS_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Full-screen overlay that requests Location and Device Orientation permissions
 * via a user tap. iOS requires DeviceOrientationEvent.requestPermission() to be
 * called synchronously from a user gesture — no async work before it.
 *
 * Flow on tap:
 * 1. Request orientation FIRST (needs gesture context on iOS)
 * 2. Then request location (doesn't need gesture context)
 * 3. Persist flag + dismiss regardless of grant/deny
 */
export function PermissionPrompt({ onComplete }) {
  const [requesting, setRequesting] = useState(false)

  async function handleGrant() {
    if (requesting) return
    setRequesting(true)

    // Orientation MUST be requested first and synchronously from the gesture.
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        await DeviceOrientationEvent.requestPermission()
      } catch {
        // denied or unavailable
      }
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
    onComplete()
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
