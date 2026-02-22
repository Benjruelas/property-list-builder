import { useState, useEffect } from 'react'

/**
 * Listens to DeviceOrientation and returns compass heading in degrees (0-360, 0 = North).
 * On iOS, events only fire after DeviceOrientationEvent.requestPermission() is granted.
 * On non-iOS, usually works without permission.
 */
export function useDeviceHeading() {
  const [heading, setHeading] = useState(null)

  useEffect(() => {
    const eventName = 'ondeviceorientationabsolute' in window
      ? 'deviceorientationabsolute'
      : 'deviceorientation'

    const handleOrientation = (e) => {
      let angle = e.webkitCompassHeading ?? e.alpha

      if (angle == null) return

      // Safari iOS: webkitCompassHeading is clockwise from north
      if (!e.absolute && e.webkitCompassHeading != null) {
        angle = 360 - angle
      }

      // Older browsers: adjust for device orientation
      if (!e.absolute && typeof window.orientation === 'number') {
        angle = (angle - window.orientation + 360) % 360
      }

      setHeading(((angle % 360) + 360) % 360)
    }

    window.addEventListener(eventName, handleOrientation, { passive: true })

    return () => {
      window.removeEventListener(eventName, handleOrientation)
    }
  }, [])

  return heading
}
