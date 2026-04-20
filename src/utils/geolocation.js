/**
 * Desktop browsers (and installed PWAs) often time out or fail when
 * enableHighAccuracy is true — GPS isn't available and Wi‑Fi/IP fixes are coarse.
 * Try a coarse fix first, then high accuracy.
 *
 * @returns {Promise<GeolocationPosition>}
 */
export function getCurrentPositionWithFallback() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation not supported'))
      return
    }
    const attempts = [
      { enableHighAccuracy: false, timeout: 28000, maximumAge: 300000 },
      { enableHighAccuracy: true, timeout: 35000, maximumAge: 0 },
    ]
    let i = 0
    const run = () => {
      if (i >= attempts.length) {
        reject(new Error('Geolocation failed after retries'))
        return
      }
      const opts = attempts[i++]
      navigator.geolocation.getCurrentPosition(
        resolve,
        (err) => {
          console.warn('[geolocation] getCurrentPosition attempt failed', err?.code, opts)
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
    (navigator.maxTouchPoints > 0 || 'ontouchstart' in window)
  return {
    enableHighAccuracy: touch,
    timeout: 25000,
    maximumAge: 15000,
  }
}
