/** @type {Promise<void> | null} */
let playSetupInFlight = null

/** @type {HTMLVideoElement | null} */
let gestureUnlockVideo = null

let gestureUnlockInstalled = false

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
  video.volume = 1
}

/**
 * @param {HTMLVideoElement} video
 */
export function setVideoMuted(video, muted) {
  video.muted = muted
  video.defaultMuted = muted
  if (muted) video.setAttribute('muted', '')
  else video.removeAttribute('muted')
}

/**
 * One timeline: pause, seek 0, muted play, then unmute without seeking again.
 *
 * @param {HTMLVideoElement} video
 */
export async function beginLogoSplashPlayback(video) {
  configureLogoVideoElement(video)
  installLogoGestureAudioUnlock(video)

  try {
    video.pause()
  } catch {
    /* ignore */
  }

  setVideoMuted(video, true)
  try {
    video.currentTime = 0
  } catch {
    /* ignore */
  }

  try {
    await video.play()
  } catch {
    return
  }

  setVideoMuted(video, false)
  video.volume = 1

  if (video.paused) {
    try {
      await video.play()
    } catch {
      setVideoMuted(video, true)
      try {
        await video.play()
      } catch {
        /* gesture unlock */
      }
    }
  }
}

/**
 * @param {HTMLVideoElement} video
 */
export function installLogoGestureAudioUnlock(video) {
  gestureUnlockVideo = video
  if (gestureUnlockInstalled || typeof window === 'undefined') return
  gestureUnlockInstalled = true

  const unlock = () => {
    const el = gestureUnlockVideo
    if (el) void beginLogoSplashPlayback(el)
  }

  window.addEventListener('pointerdown', unlock, { once: true, capture: true })
  window.addEventListener('keydown', unlock, { once: true, capture: true })
  window.addEventListener('touchstart', unlock, { once: true, capture: true })
}

/** @deprecated alias — always starts the single synced timeline from 0. */
export async function ensureLogoVideoPlaying(video) {
  if (playSetupInFlight) {
    await playSetupInFlight
    return
  }
  playSetupInFlight = beginLogoSplashPlayback(video)
  try {
    await playSetupInFlight
  } finally {
    playSetupInFlight = null
  }
}

/** @deprecated */
export async function syncLogoVideoAudio(video) {
  await beginLogoSplashPlayback(video)
}
