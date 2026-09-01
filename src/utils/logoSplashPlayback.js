/** @type {Promise<void> | null} */
let playSetupInFlight = null

/** @type {Promise<string> | null} */
let blobUrlInFlight = null

/** @type {string | null} */
let cachedBlobUrl = null

/** @deprecated Cover sizing replaced mobile zoom; kept for older imports/tests. */
export const LOGO_SPLASH_SCALE_MOBILE = 1
export const LOGO_SPLASH_SCALE_DESKTOP = 1
export const LOGO_SPLASH_DESKTOP_MIN_WIDTH_PX = 768

/** window key — optional layout hint (no longer required for cover video). */
export const BOOT_LOGO_LAYOUT_KEY = '__bootLogoLayout'

/**
 * Always prefer painting the real <video> (object-fit: cover).
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
  video.setAttribute('autoplay', '')
  video.autoplay = true
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

/** Drop cached blob URL (tests / after splash exits). */
export function clearLogoSplashBlobCache() {
  blobUrlInFlight = null
  if (cachedBlobUrl) {
    try {
      URL.revokeObjectURL(cachedBlobUrl)
    } catch {
      /* ignore */
    }
  }
  cachedBlobUrl = null
  if (typeof window !== 'undefined') {
    try {
      delete window.__bootLogoBlobUrl
    } catch {
      window.__bootLogoBlobUrl = undefined
    }
  }
}

/**
 * Fetch the logo MP4 into a blob: URL. iOS 26 Home Screen / PWA often refuses
 * to advance HTTP-sourced video after relaunch; blob sources still play.
 *
 * @param {string} src
 * @param {{ bustCache?: boolean }} [opts]
 * @returns {Promise<string>}
 */
export async function fetchLogoSplashBlobUrl(src, opts = {}) {
  const base = (src || '').split('?')[0]
  if (!base) throw new Error('logo splash src missing')

  if (!opts.bustCache && cachedBlobUrl) return cachedBlobUrl
  if (!opts.bustCache && blobUrlInFlight) return blobUrlInFlight

  const run = (async () => {
    const url = opts.bustCache ? `${base}?splash=${Date.now()}` : base
    const res = await fetch(url, {
      cache: opts.bustCache ? 'reload' : 'force-cache',
      credentials: 'same-origin',
    })
    if (!res.ok) throw new Error(`logo splash fetch ${res.status}`)
    const blob = await res.blob()
    if (cachedBlobUrl) {
      try {
        URL.revokeObjectURL(cachedBlobUrl)
      } catch {
        /* ignore */
      }
    }
    cachedBlobUrl = URL.createObjectURL(blob)
    if (typeof window !== 'undefined') {
      window.__bootLogoBlobUrl = cachedBlobUrl
    }
    return cachedBlobUrl
  })()

  blobUrlInFlight = run
  try {
    return await run
  } finally {
    if (blobUrlInFlight === run) blobUrlInFlight = null
  }
}

/**
 * Attach a blob: URL via <source> (more reliable than video.src on iOS).
 *
 * @param {HTMLVideoElement} video
 * @param {string} objectUrl
 */
export function attachLogoSplashBlobSource(video, objectUrl) {
  configureLogoVideoElement(video)
  try {
    video.removeAttribute('src')
  } catch {
    /* ignore */
  }
  while (video.firstChild) {
    video.removeChild(video.firstChild)
  }
  const source = document.createElement('source')
  source.type = 'video/mp4'
  source.src = objectUrl
  video.appendChild(source)
  try {
    video.load()
  } catch {
    /* ignore */
  }
}

/**
 * Muted logo playback without seek-to-0 (seek+play is toxic on iOS WebKit).
 * Pass `{ restart: true }` only after a fresh source attach.
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
    // Soft play — never pause()+seek; that freezes iOS 26 PWA media sessions.
    try {
      await video.play()
    } catch {
      /* decode / autoplay blocked — caller may remount via blob */
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
 * Remount via a fresh blob: URL (iOS 26 stuck-first-frame recovery).
 *
 * @param {HTMLVideoElement} video
 * @param {string} src
 */
export async function remountLogoSplashSource(video, src) {
  const base = (src || video.getAttribute('src') || video.currentSrc || '').split('?')[0]
    || '/brand/knockscout-LogoMark-on-black.mp4'
  const objectUrl = await fetchLogoSplashBlobUrl(base, { bustCache: true })
  attachLogoSplashBlobSource(video, objectUrl)
  await beginLogoSplashPlayback(video, { restart: true })
}

/**
 * Load blob source + play. Preferred cold-start path for Apple WebKit.
 *
 * @param {HTMLVideoElement} video
 * @param {string} src
 * @param {{ bustCache?: boolean }} [opts]
 */
export async function playLogoSplashFromBlob(video, src, opts = {}) {
  const objectUrl = await fetchLogoSplashBlobUrl(src, opts)
  attachLogoSplashBlobSource(video, objectUrl)
  await beginLogoSplashPlayback(video, { restart: true })
  return objectUrl
}

/**
 * @param {HTMLVideoElement} video
 * @param {{ onStalled?: () => void, timeoutMs?: number }} [opts]
 * @returns {() => void}
 */
export function watchLogoSplashProgress(video, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 450
  const onStalled = opts.onStalled
  if (!video) return () => {}

  let cancelled = false
  const startTime = video.currentTime || 0
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
  let stalledFired = false

  const fireStalled = () => {
    if (cancelled || stalledFired) return
    stalledFired = true
    onStalled?.()
  }

  const tick = () => {
    if (cancelled || stalledFired) return
    if (video.ended || (video.currentTime || 0) > startTime + 0.08) return
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    if (now - startedAt >= timeoutMs) {
      fireStalled()
      return
    }
    requestAnimationFrame(tick)
  }

  const onPlaying = () => {
    if (!cancelled) requestAnimationFrame(tick)
  }
  video.addEventListener('playing', onPlaying, { once: true })
  // Always arm the watchdog — iOS can report paused=false while frozen at t=0.
  requestAnimationFrame(tick)
  // Wall-clock backup if rAF is throttled during boot.
  const wall = window.setTimeout(fireStalled, timeoutMs + 50)

  return () => {
    cancelled = true
    window.clearTimeout(wall)
    video.removeEventListener('playing', onPlaying)
  }
}
