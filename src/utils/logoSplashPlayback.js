/** @type {Promise<void> | null} */
let playSetupInFlight = null

/** Logo size vs viewport-fitted contain (1 = fit). Mobile uses a slight zoom to hide edge artifacts. */
export const LOGO_SPLASH_SCALE_MOBILE = 1.875
export const LOGO_SPLASH_SCALE_DESKTOP = 1.25
export const LOGO_SPLASH_DESKTOP_MIN_WIDTH_PX = 768

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
 *
 * @param {HTMLVideoElement} video
 */
export async function beginLogoSplashPlayback(video) {
  if (playSetupInFlight) {
    await playSetupInFlight
    return
  }

  playSetupInFlight = (async () => {
    configureLogoVideoElement(video)
    try {
      video.pause()
    } catch {
      /* ignore */
    }
    try {
      video.currentTime = 0
    } catch {
      /* ignore */
    }
    try {
      await video.play()
    } catch {
      /* decode / autoplay blocked */
    }
  })()

  try {
    await playSetupInFlight
  } finally {
    playSetupInFlight = null
  }
}
