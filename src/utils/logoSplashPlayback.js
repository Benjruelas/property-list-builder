/** If playback advanced this far while muted, restart with sound so A/V match the logo intro. */
export const SOUND_SYNC_RESTART_SEC = 0.12

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
 * Muted play first, then unmute — required for autoplay policies on most browsers.
 *
 * @param {HTMLVideoElement} video
 */
async function playMutedThenUnmute(video) {
  setVideoMuted(video, true)
  try {
    await video.play()
  } catch {
    return false
  }

  setVideoMuted(video, false)
  video.volume = 1
  try {
    await video.play()
    return true
  } catch {
    setVideoMuted(video, true)
    try {
      await video.play()
    } catch {
      /* gesture unlock */
    }
    return false
  }
}

/**
 * @param {HTMLVideoElement} video
 * @param {{ forceFromStart?: boolean }} [options]
 */
export async function syncLogoVideoAudio(video, { forceFromStart = false } = {}) {
  const restart =
    forceFromStart
    || video.ended
    || (!video.paused && video.currentTime > SOUND_SYNC_RESTART_SEC)

  if (restart) {
    try {
      video.currentTime = 0
    } catch {
      /* ignore */
    }
  }

  await playMutedThenUnmute(video)
}

/**
 * @param {HTMLVideoElement} video
 */
export function installLogoGestureAudioUnlock(video) {
  gestureUnlockVideo = video
  if (gestureUnlockInstalled) return
  gestureUnlockInstalled = true

  const unlock = () => {
    const el = gestureUnlockVideo
    if (el) void syncLogoVideoAudio(el, { forceFromStart: true })
  }

  window.addEventListener('pointerdown', unlock, { once: true, capture: true })
  window.addEventListener('keydown', unlock, { once: true, capture: true })
  window.addEventListener('touchstart', unlock, { once: true, capture: true })
}

/**
 * @param {HTMLVideoElement} video
 * @param {{ resyncAudio?: boolean }} [options]
 */
export async function ensureLogoVideoPlaying(video, { resyncAudio = false } = {}) {
  if (playSetupInFlight) {
    await playSetupInFlight
    return
  }

  playSetupInFlight = (async () => {
    configureLogoVideoElement(video)
    installLogoGestureAudioUnlock(video)

    if (resyncAudio) {
      await syncLogoVideoAudio(video)
      return
    }

    if (video.paused || video.ended) {
      setVideoMuted(video, true)
      if (video.ended) {
        try {
          video.currentTime = 0
        } catch {
          /* ignore */
        }
      }
      try {
        await video.play()
      } catch {
        return
      }
    }

    await playMutedThenUnmute(video)
  })()

  try {
    await playSetupInFlight
  } finally {
    playSetupInFlight = null
  }
}
