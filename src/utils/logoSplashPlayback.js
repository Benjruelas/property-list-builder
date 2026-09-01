/** @type {Promise<void> | null} */
let playSetupInFlight = null

/** @deprecated Cover sizing replaced mobile zoom; kept for older imports/tests. */
export const LOGO_SPLASH_SCALE_MOBILE = 1
export const LOGO_SPLASH_SCALE_DESKTOP = 1
export const LOGO_SPLASH_DESKTOP_MIN_WIDTH_PX = 768

/** window key — optional layout hint (no longer required for cover video). */
export const BOOT_LOGO_LAYOUT_KEY = '__bootLogoLayout'

/**
 * Always prefer painting the real <video> (object-fit: cover).
 * Canvas mirroring was abandoned after iOS 26 media regressions.
 *
 * @returns {boolean}
 */
export function prefersDirectLogoVideo() {
  return true
}

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

export function clearBootLogoLayout() {
  if (typeof window === 'undefined') return
  try {
    delete window[BOOT_LOGO_LAYOUT_KEY]
  } catch {
    window[BOOT_LOGO_LAYOUT_KEY] = undefined
  }
}

/**
 * @param {{ lockedW: number, lockedH: number, videoW: number, videoH: number, scale: number, dpr: number }} args
 * @returns {{ dx: number, dy: number, dw: number, dh: number, fit: number }}
 * @deprecated Canvas splash path removed; kept for unit tests.
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
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {boolean}
 */
export function isLogoSplashGreyPlaceholder(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max <= 12) return false
  return (max - min) <= 28 && max <= 220
}

/** @deprecated Use isLogoSplashGreyPlaceholder */
export function isUsableLogoSplashPlateSample(r, g, b) {
  return !isLogoSplashGreyPlaceholder(r, g, b)
}

/** @returns {number} */
export function getLogoSplashScale() {
  return 1
}

/**
 * Full-bleed cover layout for the visible logo <video>.
 *
 * @param {HTMLVideoElement} video
 */
export function applyDirectLogoVideoLayout(video) {
  if (!video) return
  video.classList.add('is-cover')
  video.style.removeProperty('--ks-logo-splash-scale')
  video.style.removeProperty('--ks-boot-logo-w')
  video.style.removeProperty('--ks-boot-logo-h')
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
 * @param {HTMLVideoElement} video
 * @returns {boolean}
 */
export function isLogoSplashActivelyPlaying(video) {
  if (!video) return false
  if (video.ended) return false
  if (video.paused) return false
  return (video.currentTime || 0) > 0.05
}

/**
 * Muted logo playback. Continues an in-progress play by default (no seek).
 *
 * @param {HTMLVideoElement} video
 * @param {{ restart?: boolean }} [opts]
 */
export async function beginLogoSplashPlayback(video, opts = {}) {
  const restart = opts.restart === true
  const run = async () => {
    configureLogoVideoElement(video)
    if (!restart && isLogoSplashActivelyPlaying(video)) {
      try {
        await video.play()
      } catch {
        /* already playing / autoplay race */
      }
      return
    }
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

/**
 * Remount the media source (iOS 26 Home Screen / PWA can stick on frame 0).
 *
 * @param {HTMLVideoElement} video
 * @param {string} src
 */
export async function remountLogoSplashSource(video, src) {
  const base = (src || video.getAttribute('src') || video.currentSrc || '').split('?')[0]
  if (!base) return
  configureLogoVideoElement(video)
  try {
    video.pause()
  } catch {
    /* ignore */
  }
  try {
    video.removeAttribute('src')
    video.load()
  } catch {
    /* ignore */
  }
  video.src = `${base}?splash=${Date.now()}`
  try {
    video.load()
  } catch {
    /* ignore */
  }
  await beginLogoSplashPlayback(video, { restart: true })
}

/**
 * @param {HTMLVideoElement} video
 * @param {{ onStalled?: () => void, timeoutMs?: number }} [opts]
 * @returns {() => void}
 */
export function watchLogoSplashProgress(video, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 900
  const onStalled = opts.onStalled
  if (!video) return () => {}

  let cancelled = false
  const startTime = video.currentTime || 0
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()

  const tick = () => {
    if (cancelled) return
    if (video.ended || (video.currentTime || 0) > startTime + 0.08) return
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    if (now - startedAt >= timeoutMs) {
      onStalled?.()
      return
    }
    requestAnimationFrame(tick)
  }

  const onPlaying = () => {
    if (!cancelled) requestAnimationFrame(tick)
  }
  video.addEventListener('playing', onPlaying, { once: true })
  if (!video.paused || (video.currentTime || 0) > 0) {
    requestAnimationFrame(tick)
  }

  return () => {
    cancelled = true
    video.removeEventListener('playing', onPlaying)
  }
}
