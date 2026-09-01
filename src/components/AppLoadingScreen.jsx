import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { APP_LOADING_MESSAGES } from '@/config/appLoadingMessages'
import {
  configureLogoVideoElement,
  beginLogoSplashPlayback,
  remountLogoSplashSource,
  watchLogoSplashProgress,
  clearBootLogoLayout,
  applyDirectLogoVideoLayout,
} from '@/utils/logoSplashPlayback'

/** Match `.app-loading-screen.is-exiting` / `#initial-loader.is-exiting` duration. */
const FADE_OUT_MS = 320
/** Fallback if `ended` never fires (decode error). */
const PLAY_FALLBACK_MS = 4500
const LOGO_VIDEO_SRC = '/brand/knockscout-LogoMark-on-black.mp4'
const LOGO_POSTER_SRC = '/brand/knockscout-LogoMark-on-black-poster.png'
const BOOT_VIDEO_ID = 'boot-logo-video'
const BOOT_LOADER_ID = 'initial-loader'
const LOGO_PLATE = '#000000'

function loadingPortalTarget() {
  return document.getElementById('modal-root') || document.body
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Full-screen KnockScout boot splash.
 * Prefers the HTML `#initial-loader` video in place (no DOM reparent — that
 * glitches on iOS). Falls back to a portal video for public pages.
 *
 * @param {{ active: boolean, message?: string, onVisibleChange?: (visible: boolean) => void }} props
 */
export function AppLoadingScreen({
  active,
  message = APP_LOADING_MESSAGES.mapAuth,
  onVisibleChange,
}) {
  const reduceMotion = prefersReducedMotion()
  const [mounted, setMounted] = useState(active)
  const [exiting, setExiting] = useState(false)
  const [playCompleted, setPlayCompleted] = useState(() => reduceMotion)
  /** 'boot' = reuse #initial-loader; 'portal' = React-owned overlay */
  const [host, setHost] = useState(() => (
    typeof document !== 'undefined'
      && document.getElementById(BOOT_LOADER_ID)
      && document.getElementById(BOOT_VIDEO_ID)
      && !prefersReducedMotion()
      ? 'boot'
      : 'portal'
  ))

  const screenRef = useRef(null)
  const stageRef = useRef(null)
  const videoRef = useRef(null)
  const activeRef = useRef(active)
  const playCompletedRef = useRef(playCompleted)
  const exitingRef = useRef(false)
  const onVisibleChangeRef = useRef(onVisibleChange)
  onVisibleChangeRef.current = onVisibleChange
  activeRef.current = active
  playCompletedRef.current = playCompleted

  const tryExit = () => {
    if (exitingRef.current) return
    if (!playCompletedRef.current) return
    if (reduceMotion && activeRef.current) return
    exitingRef.current = true
    setExiting(true)
  }

  useLayoutEffect(() => {
    if (reduceMotion) {
      // Drop HTML boot chrome; portal shows the static poster.
      window.__removeInitialLoader?.()
      clearBootLogoLayout()
      setHost('portal')
      return undefined
    }

    const boot = document.getElementById(BOOT_LOADER_ID)
    let video = boot?.querySelector('video') || document.getElementById(BOOT_VIDEO_ID)
    const useBoot = !!(boot && video instanceof HTMLVideoElement)

    let cancelProgressWatch = () => {}
    let stopEnsure = () => {}

    const markCompleted = () => {
      if (playCompletedRef.current) return
      playCompletedRef.current = true
      setPlayCompleted(true)
      try {
        video?.pause()
      } catch {
        /* ignore */
      }
      tryExit()
    }

    if (useBoot) {
      setHost('boot')
      // Keep the element where HTML put it — moving a playing <video> on iOS
      // restarts/glitches the animation.
      window.__removeInitialLoader = null
      boot.classList.add(
        'app-loading-screen',
        'app-loading-screen--visible',
        'app-loading-screen--video',
      )
      boot.setAttribute('role', 'status')
      boot.setAttribute('aria-live', 'polite')
      boot.setAttribute('aria-label', message)
      screenRef.current = boot

      // Drop leftover canvas from older boots if present.
      boot.querySelectorAll('canvas').forEach((c) => c.remove())

      // Keep id for Strict Mode remount; query via loader as fallback.
      video.className = 'app-loading-screen__video is-cover'
      video.setAttribute('aria-hidden', 'true')
      configureLogoVideoElement(video)
      applyDirectLogoVideoLayout(video)
      videoRef.current = video

      if (video.ended || (video.currentTime > 0 && video.paused && video.readyState >= 2
        && video.duration > 0 && video.currentTime >= video.duration - 0.05)) {
        markCompleted()
      }
    } else {
      setHost('portal')
      window.__removeInitialLoader?.()
      video = null
    }

    const bindVideo = (el) => {
      if (!el) return () => {}
      video = el
      videoRef.current = el
      const onEnded = () => markCompleted()
      el.addEventListener('ended', onEnded)

      const fallbackTimer = window.setTimeout(() => {
        if (!playCompletedRef.current) markCompleted()
      }, PLAY_FALLBACK_MS)

      const ensurePlaying = () => {
        if (playCompletedRef.current || el.ended) return
        void beginLogoSplashPlayback(el, { restart: false })
      }
      void beginLogoSplashPlayback(el, { restart: false })
      el.addEventListener('loadeddata', ensurePlaying)
      el.addEventListener('canplay', ensurePlaying)
      const playRetryTimer = window.setTimeout(ensurePlaying, 200)
      const playRetryTimer2 = window.setTimeout(ensurePlaying, 800)

      let stallRecovered = false
      cancelProgressWatch = watchLogoSplashProgress(el, {
        timeoutMs: 900,
        onStalled: () => {
          if (stallRecovered || playCompletedRef.current) return
          stallRecovered = true
          void remountLogoSplashSource(el, LOGO_VIDEO_SRC).then(() => {
            applyDirectLogoVideoLayout(el)
          })
        },
      })

      return () => {
        window.clearTimeout(fallbackTimer)
        window.clearTimeout(playRetryTimer)
        window.clearTimeout(playRetryTimer2)
        el.removeEventListener('ended', onEnded)
        el.removeEventListener('loadeddata', ensurePlaying)
        el.removeEventListener('canplay', ensurePlaying)
        cancelProgressWatch()
      }
    }

    if (video) {
      stopEnsure = bindVideo(video)
      return () => {
        stopEnsure()
      }
    }

    return undefined
  }, [message, reduceMotion])

  // Portal-only: create the cover video inside the portal stage.
  useLayoutEffect(() => {
    if (host !== 'portal' || reduceMotion) return undefined
    const stage = stageRef.current
    if (!stage) return undefined
    // Boot path already bound a video.
    if (videoRef.current && document.body.contains(videoRef.current)
      && !stage.contains(videoRef.current)) {
      return undefined
    }

    let video = videoRef.current
    if (!(video instanceof HTMLVideoElement) || !stage.contains(video)) {
      video = document.createElement('video')
      video.src = LOGO_VIDEO_SRC
      video.setAttribute('aria-hidden', 'true')
      video.className = 'app-loading-screen__video is-cover'
      configureLogoVideoElement(video)
      applyDirectLogoVideoLayout(video)
      stage.replaceChildren(video)
      videoRef.current = video
    }

    const markCompleted = () => {
      if (playCompletedRef.current) return
      playCompletedRef.current = true
      setPlayCompleted(true)
      try {
        video.pause()
      } catch {
        /* ignore */
      }
      tryExit()
    }

    const onEnded = () => markCompleted()
    video.addEventListener('ended', onEnded)
    const fallbackTimer = window.setTimeout(() => {
      if (!playCompletedRef.current) markCompleted()
    }, PLAY_FALLBACK_MS)

    const ensurePlaying = () => {
      if (playCompletedRef.current || video.ended) return
      void beginLogoSplashPlayback(video, { restart: false })
    }
    void beginLogoSplashPlayback(video, { restart: false })
    video.addEventListener('loadeddata', ensurePlaying)
    video.addEventListener('canplay', ensurePlaying)
    const playRetryTimer = window.setTimeout(ensurePlaying, 200)
    const playRetryTimer2 = window.setTimeout(ensurePlaying, 800)

    let stallRecovered = false
    const cancelProgressWatch = watchLogoSplashProgress(video, {
      timeoutMs: 900,
      onStalled: () => {
        if (stallRecovered || playCompletedRef.current) return
        stallRecovered = true
        void remountLogoSplashSource(video, LOGO_VIDEO_SRC).then(() => {
          applyDirectLogoVideoLayout(video)
        })
      },
    })

    return () => {
      window.clearTimeout(fallbackTimer)
      window.clearTimeout(playRetryTimer)
      window.clearTimeout(playRetryTimer2)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('loadeddata', ensurePlaying)
      video.removeEventListener('canplay', ensurePlaying)
      cancelProgressWatch()
    }
  }, [host, reduceMotion])

  useEffect(() => {
    onVisibleChangeRef.current?.(mounted)
  }, [mounted])

  useEffect(() => {
    if (active && (!playCompleted || reduceMotion)) {
      exitingRef.current = false
      setExiting(false)
      setMounted(true)
      return undefined
    }
    if (!mounted || exiting) return undefined
    tryExit()
    return undefined
  }, [active, mounted, exiting, playCompleted, reduceMotion])

  useLayoutEffect(() => {
    if (!exiting) return undefined

    const el = host === 'boot'
      ? (screenRef.current || document.getElementById(BOOT_LOADER_ID))
      : screenRef.current
    if (!el) return undefined

    el.classList.remove('is-exiting')
    void el.offsetHeight

    const video = videoRef.current
    if (video && !video.paused) {
      try { video.pause() } catch { /* ignore */ }
    }

    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        el.classList.add('is-exiting')
        el.setAttribute('aria-hidden', 'true')
      })
    })

    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [exiting, host])

  useEffect(() => {
    if (!exiting) return undefined
    const t = window.setTimeout(
      () => {
        if (host === 'boot') {
          const boot = document.getElementById(BOOT_LOADER_ID) || screenRef.current
          boot?.remove()
        }
        setMounted(false)
        setExiting(false)
        exitingRef.current = false
        clearBootLogoLayout()
      },
      reduceMotion ? 0 : FADE_OUT_MS
    )
    return () => window.clearTimeout(t)
  }, [exiting, host, reduceMotion])

  if (typeof document === 'undefined' || !mounted) return null

  // Boot host: HTML #initial-loader is the visible splash — no portal.
  if (host === 'boot' && !reduceMotion) return null

  return createPortal(
    <div
      ref={screenRef}
      className="app-loading-screen app-loading-screen--visible app-loading-screen--video"
      role="status"
      aria-live="polite"
      aria-label={message}
      aria-hidden={exiting || undefined}
      style={{ background: LOGO_PLATE }}
    >
      <div className="app-loading-screen__content app-loading-screen__content--video">
        <div ref={stageRef} className="app-loading-screen__video-slot">
          {reduceMotion ? (
            <img
              src={LOGO_POSTER_SRC}
              alt="KnockScout"
              className="app-loading-screen__video app-loading-screen__video--static"
            />
          ) : null}
        </div>
      </div>
    </div>,
    loadingPortalTarget()
  )
}

export default AppLoadingScreen
