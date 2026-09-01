/** Duration of knockscout-LogoMark-on-black.webp (83 frames @ 20fps). */
export const LOGO_SPLASH_ANIM_MS = 4150

export const LOGO_SPLASH_WEBP_SRC = '/brand/knockscout-LogoMark-on-black.webp'
export const LOGO_SPLASH_POSTER_SRC = '/brand/knockscout-LogoMark-on-black-poster.png'

/** @deprecated Cover path removed; kept for older imports/tests. */
export const LOGO_SPLASH_SCALE_MOBILE = 1
export const LOGO_SPLASH_SCALE_DESKTOP = 1
export const LOGO_SPLASH_DESKTOP_MIN_WIDTH_PX = 768
export const BOOT_LOGO_LAYOUT_KEY = '__bootLogoLayout'

export function prefersDirectLogoVideo() {
  return false
}

export function getBootLogoLayout() {
  if (typeof window === 'undefined') return null
  const layout = window[BOOT_LOGO_LAYOUT_KEY]
  if (!layout || !(layout.w > 0) || !(layout.h > 0)) return null
  return { w: layout.w, h: layout.h }
}

export function setBootLogoLayout(w, h) {
  if (typeof window === 'undefined') return null
  const existing = getBootLogoLayout()
  if (existing) return existing
  if (!(w > 0) || !(h > 0)) return null
  const layout = { w: Math.round(w), h: Math.round(h) }
  window[BOOT_LOGO_LAYOUT_KEY] = layout
  return layout
}

export function clearBootLogoLayout() {
  if (typeof window === 'undefined') return
  try {
    delete window[BOOT_LOGO_LAYOUT_KEY]
  } catch {
    window[BOOT_LOGO_LAYOUT_KEY] = undefined
  }
}

/** @deprecated */
export function logoDrawRect({ lockedW, lockedH, videoW, videoH, scale, dpr }) {
  const fit = Math.min(lockedW / videoW, lockedH / videoH) * scale
  const dw = videoW * fit * dpr
  const dh = videoH * fit * dpr
  const dx = (lockedW * dpr - dw) / 2
  const dy = (lockedH * dpr - dh) / 2
  return { dx, dy, dw, dh, fit }
}

export function isLogoSplashGreyPlaceholder(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max <= 12) return false
  return (max - min) <= 28 && max <= 220
}

export function isUsableLogoSplashPlateSample(r, g, b) {
  return !isLogoSplashGreyPlaceholder(r, g, b)
}

export function getLogoSplashScale() {
  return 1
}

export function applyDirectLogoVideoLayout() {}

export function configureLogoVideoElement() {}

export function isLogoSplashActivelyPlaying() {
  return false
}

export function clearLogoSplashBlobCache() {}

export async function fetchLogoSplashBlobUrl() {
  return ''
}

export function attachLogoSplashBlobSource() {}

export async function beginLogoSplashPlayback() {}

export async function remountLogoSplashSource() {}

export async function playLogoSplashFromBlob() {
  return ''
}

export function watchLogoSplashProgress(_el, opts = {}) {
  // Image splash does not stall the way iOS video does; no-op cancel.
  void opts
  return () => {}
}

/**
 * Schedule splash completion after the WebP animation duration.
 *
 * @param {(completed: boolean) => void} onDone
 * @param {number} [ms]
 * @returns {() => void} cancel
 */
export function scheduleLogoSplashComplete(onDone, ms = LOGO_SPLASH_ANIM_MS) {
  const t = window.setTimeout(() => onDone(true), ms)
  return () => window.clearTimeout(t)
}
