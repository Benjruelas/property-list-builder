/** @type {Promise<void> | null} */
let playSetupInFlight = null

/** Logo size vs viewport-fitted contain (1 = fit). Mobile uses a slight zoom to hide edge artifacts. */
export const LOGO_SPLASH_SCALE_MOBILE = 1.875
export const LOGO_SPLASH_SCALE_DESKTOP = 1.0
export const LOGO_SPLASH_DESKTOP_MIN_WIDTH_PX = 768

/** window key shared with index.html boot canvas mirror */
export const BOOT_LOGO_LAYOUT_KEY = '__bootLogoLayout'

/**
 * @returns {{ w: number, h: number } | null}
 */
export function getBootLogoLayout() {
  if (typeof window === 'undefined') return null
  const layout = window[BOOT_LOGO_LAYOUT_KEY]
  if (!layout || !(layout.w > 0) || !(layout.h > 0)) return null
  return { w: layout.w, h: layout.h }
}

/**
 * Capture splash layout once (CSS px). Later calls return the existing lock.
 *
 * @param {number} w
 * @param {number} h
 * @returns {{ w: number, h: number } | null}
 */
export function setBootLogoLayout(w, h) {
  if (typeof window === 'undefined') return null
  const existing = getBootLogoLayout()
  if (existing) return existing
  if (!(w > 0) || !(h > 0)) return null
  const layout = { w: Math.round(w), h: Math.round(h) }
  window[BOOT_LOGO_LAYOUT_KEY] = layout
  return layout
}

/** Drop the boot layout lock so a later splash can capture a fresh one. */
export function clearBootLogoLayout() {
  if (typeof window === 'undefined') return
  try {
    delete window[BOOT_LOGO_LAYOUT_KEY]
  } catch {
    window[BOOT_LOGO_LAYOUT_KEY] = undefined
  }
}

/**
 * Device-pixel draw rect for the logo, centered in the locked CSS box.
 * Canvas may grow larger than the lock; dy/dx stay anchored to the lock.
 *
 * @param {{ lockedW: number, lockedH: number, videoW: number, videoH: number, scale: number, dpr: number }} args
 * @returns {{ dx: number, dy: number, dw: number, dh: number, fit: number }}
 */
export function logoDrawRect({ lockedW, lockedH, videoW, videoH, scale, dpr }) {
  const fit = Math.min(lockedW / videoW, lockedH / videoH) * scale
  const dw = videoW * fit * dpr
  const dh = videoH * fit * dpr
  const dx = (lockedW * dpr - dw) / 2
  const dy = (lockedH * dpr - dh) / 2
  return { dx, dy, dw, dh, fit }
}

/**
 * iOS often exposes a neutral grey placeholder before the first real decode
 * (including Capacitor-like dark greys around #111 and classic mid-greys).
 * Those frames must not be drawn (and must never become the full-screen plate).
 *
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {boolean}
 */
export function isLogoSplashGreyPlaceholder(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  // Near-black plate / real logo corners stay drawable (allow tiny decode noise).
  if (max <= 12) return false
  // Any near-neutral grey above near-black — skip (dark #111 through light grey).
  return (max - min) <= 28 && max <= 220
}

/** @deprecated Use isLogoSplashGreyPlaceholder — kept for older imports/tests. */
export function isUsableLogoSplashPlateSample(r, g, b) {
  return !isLogoSplashGreyPlaceholder(r, g, b)
}

/**
 * @returns {number}
 */
export function getLogoSplashScale() {
  if (typeof window === 'undefined') return LOGO_SPLASH_SCALE_MOBILE
  return window.matchMedia(`(min-width: ${LOGO_SPLASH_DESKTOP_MIN_WIDTH_PX}px)`).matches
    ? LOGO_SPLASH_SCALE_DESKTOP
    : LOGO_SPLASH_SCALE_MOBILE
}

/**
 * @param {HTMLVideoElement} video
 */
export function configureLogoVideoElement(video) {
  video.playsInline = true
  video.setAttribute('playsinline', '')
  video.setAttribute('webkit-playsinline', '')
  video.controls = false
  video.loop = false
  video.preload = 'auto'
  video.muted = true
  video.defaultMuted = true
  video.volume = 0
  video.setAttribute('muted', '')
}

/**
 * Muted logo playback from t=0 (reliable autoplay on mobile).
 * Concurrent callers are chained so each video still gets its own play() —
 * a prior in-flight setup must not swallow a later handoff play.
 *
 * @param {HTMLVideoElement} video
 */
export async function beginLogoSplashPlayback(video) {
  const run = async () => {
    configureLogoVideoElement(video)
    try {
      video.pause()
    } catch {
      /* ignore */
    }
    try {
      if (video.readyState >= 1) video.currentTime = 0
    } catch {
      /* ignore */
    }
    try {
      await video.play()
    } catch {
      /* decode / autoplay blocked — caller may retry on canplay */
    }
  }

  const prior = playSetupInFlight
  const next = (prior || Promise.resolve()).then(run, run)
  playSetupInFlight = next
  try {
    await next
  } finally {
    if (playSetupInFlight === next) playSetupInFlight = null
  }
}
