/** @type {Promise<void> | null} */
let playSetupInFlight = null

/** Logo size vs viewport-fitted contain (1 = fit). Mobile uses a slight zoom to hide edge artifacts. */
export const LOGO_SPLASH_SCALE_MOBILE = 1.875
export const LOGO_SPLASH_SCALE_DESKTOP = 1.0
export const LOGO_SPLASH_DESKTOP_MIN_WIDTH_PX = 768

/** window key shared with index.html boot canvas mirror */
export const BOOT_LOGO_LAYOUT_KEY = '__bootLogoLayout'

/**
 * True on Apple mobile WebKit (Safari, Home Screen, Capacitor iOS) where
 * video→canvas mirroring and PWA media resume are unreliable (esp. iOS 26+).
 *
 * @returns {boolean}
 */
export function prefersDirectLogoVideo() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  try {
    if (window.Capacitor?.getPlatform?.() === 'ios') return true
  } catch {
    /* ignore */
  }
  const ua = navigator.userAgent || ''
  if (/iP(hone|od|ad)/.test(ua)) return true
  // iPadOS “desktop” UA
  if (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1) return true
  return false
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
 * Size/position the visible <video> inside the locked boot box so iOS viewport
 * growth only expands the black plate (matches canvas logoDrawRect anchoring).
 *
 * @param {HTMLVideoElement} video
 * @param {{ w?: number, h?: number } | null} [layout]
 */
export function applyDirectLogoVideoLayout(video, layout) {
  if (!video) return
  const locked = layout || getBootLogoLayout()
  const scale = getLogoSplashScale()
  video.classList.add('is-direct')
  video.style.setProperty('--ks-logo-splash-scale', String(scale))
  if (locked?.w > 0 && locked?.h > 0) {
    video.style.setProperty('--ks-boot-logo-w', `${locked.w}px`)
    video.style.setProperty('--ks-boot-logo-h', `${locked.h}px`)
  } else {
    video.style.setProperty('--ks-boot-logo-w', '100%')
    video.style.setProperty('--ks-boot-logo-h', '100%')
  }
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
 * True when the element is already advancing — do not seek to t=0 (restart).
 *
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
 * Muted logo playback. By default continues an in-progress play (HTML→React
 * handoff). Pass `{ restart: true }` to force t=0 (stall recovery / fresh el).
 * Concurrent callers are chained so each video still gets its own play().
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
 * Watch for currentTime advancing after play(). Invokes onStalled once if the
 * timeline stays frozen (iOS 26 PWA stuck-first-frame regression).
 *
 * @param {HTMLVideoElement} video
 * @param {{ onStalled?: () => void, timeoutMs?: number }} [opts]
 * @returns {() => void} cancel
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
  // Already moving / already frozen after a prior play()
  if (!video.paused || (video.currentTime || 0) > 0) {
    requestAnimationFrame(tick)
  }

  return () => {
    cancelled = true
    video.removeEventListener('playing', onPlaying)
  }
}
