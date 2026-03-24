import { useState, useEffect } from 'react'
import { MapPin, Compass } from 'lucide-react'

/**
 * Full-screen overlay that requests Location and Device Orientation permissions.
 * iOS requires requestPermission() to originate from a user gesture (tap/click),
 * so this prompt collects a tap before firing the browser permission dialogs.
 *
 * Flow:
 * 1. Check if location is already granted → if not, show prompt
 * 2. On tap: request geolocation, then request orientation
 * 3. Dismiss once both are resolved (granted or denied)
 */
export function PermissionPrompt({ onComplete }) {
  const [visible, setVisible] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [step, setStep] = useState(null) // 'location' | 'orientation' | null

  useEffect(() => {
    let cancelled = false

    async function check() {
      // Check if we already have location permission
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const geo = await navigator.permissions.query({ name: 'geolocation' })
          if (geo.state === 'granted') {
            // Location already granted — check orientation
            if (needsOrientationPermission()) {
              if (!cancelled) setVisible(true)
              return
            }
            // Both already available
            onComplete()
            return
          }
        } catch {
          // permissions.query not supported for geolocation on some browsers
        }
      }

      // Can't determine permission state or not granted — show prompt
      if (!cancelled) setVisible(true)
    }

    check()
    return () => { cancelled = true }
  }, [onComplete])

  function needsOrientationPermission() {
    return typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function'
  }

  async function handleGrant() {
    if (requesting) return
    setRequesting(true)

    // Step 1: Location
    setStep('location')
    try {
      await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          () => resolve(),
          (err) => reject(err),
          { enableHighAccuracy: true, timeout: 10000 }
        )
      })
    } catch {
      // User denied or timeout — continue anyway
    }

    // Step 2: Orientation (iOS only)
    if (needsOrientationPermission()) {
      setStep('orientation')
      try {
        await DeviceOrientationEvent.requestPermission()
      } catch {
        // User denied — continue anyway
      }
    }

    setStep(null)
    setVisible(false)
    onComplete()
  }

  if (!visible) return null

  return (
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
        <h2 className="permission-prompt-title">Enable Location & Orientation</h2>
        <p className="permission-prompt-desc">
          This app needs access to your location to show your position on the map, and device orientation to rotate the map as you move.
        </p>
        {step && (
          <p className="permission-prompt-step">
            {step === 'location' ? 'Requesting location access…' : 'Requesting orientation access…'}
          </p>
        )}
        <button
          type="button"
          className="permission-prompt-btn"
          onClick={handleGrant}
          disabled={requesting}
        >
          {requesting ? 'Requesting…' : 'Allow Access'}
        </button>
      </div>
    </div>
  )
}
