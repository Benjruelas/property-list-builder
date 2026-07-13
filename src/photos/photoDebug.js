/** Structured console logs for the photo pipeline — filter DevTools by `[PhotoPipeline]`. */

const PREFIX = '[PhotoPipeline]'
const PHOTO_DEBUG = import.meta.env.DEV || import.meta.env.VITE_PHOTO_DEBUG === '1'

function basePayload(step, message, data) {
  return {
    step,
    message,
    at: new Date().toISOString(),
    ...data,
  }
}

export function photoLog(step, message, data = {}) {
  if (!PHOTO_DEBUG) return
  console.log(`${PREFIX} ${step} — ${message}`, basePayload(step, message, data))
}

export function photoLogWarn(step, message, data = {}) {
  if (!PHOTO_DEBUG) return
  console.warn(`${PREFIX} ${step} — ${message}`, basePayload(step, message, data))
}

export function photoLogError(step, message, error, data = {}) {
  console.error(`${PREFIX} ${step} — ${message}`, basePayload(step, message, {
    error: error?.message || String(error),
    ...data,
  }))
}

export function photoLogCameraEnvironment() {
  if (!PHOTO_DEBUG || typeof window === 'undefined') return
  photoLog('capture.env', 'Camera environment check', {
    secureContext: window.isSecureContext,
    protocol: window.location.protocol,
    host: window.location.host,
    online: typeof navigator !== 'undefined' ? navigator.onLine : null,
    hasMediaDevices: !!navigator.mediaDevices?.getUserMedia,
    hint: !window.isSecureContext
      ? 'Camera requires HTTPS (or localhost). Run: npm run dev:mobile'
      : null,
  })
}
