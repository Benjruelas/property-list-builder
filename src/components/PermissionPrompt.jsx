import { useState } from 'react'
import { createPortal } from 'react-dom'
import { MapPin, Compass } from 'lucide-react'
import { requestLocationAccess } from '../utils/geolocation'

const ONBOARDING_KEY = 'location_permission_onboarding_complete'
const LEGACY_KEY = 'permissions_granted'

export function hasCompletedPermissionOnboarding() {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === '1' ||
      localStorage.getItem(LEGACY_KEY) === '1'
  } catch {
    return false
  }
}

// Kept for compatibility with callers outside the main bundle.
export const hasGrantedPermissions = hasCompletedPermissionOnboarding

/**
 * Full-screen overlay requesting Location + Device Orientation.
 * iOS requires DeviceOrientationEvent.requestPermission() synchronously
 * from a user gesture — must be called FIRST before any other async work.
 *
 * @param onComplete({ orientationGranted, locationState, position }) — called
 * when onboarding is done. Completion is independent from either permission.
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

    // Location is requested only from this explicit gesture. The first fix is
    // returned to App so startup does not immediately ask for it again.
    const location = await requestLocationAccess()

    try { localStorage.setItem(ONBOARDING_KEY, '1') } catch { /* ignore */ }
    onComplete({
      orientationGranted,
      locationState: location.state,
      position: location.position,
    })
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

  return typeof document !== 'undefined'
    ? createPortal(ui, document.getElementById('modal-root') || document.body)
    : null
}
