/** @type {Promise<void> | null} */
let playSetupInFlight = null

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
