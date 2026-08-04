import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { APP_LOADING_MESSAGES } from '@/config/appLoadingMessages'
import {
  configureLogoVideoElement,
  beginLogoSplashPlayback,
  getLogoSplashScale,
  getBootLogoLayout,
  setBootLogoLayout,
  clearBootLogoLayout,
  logoDrawRect,
  isUsableLogoSplashPlateSample,
} from '@/utils/logoSplashPlayback'

/** Match `.app-loading-screen.is-exiting` animation duration. */
const FADE_OUT_MS = 320
/** Fallback if `ended` never fires (decode error). */
const PLAY_FALLBACK_MS = 4500
const LOGO_VIDEO_SRC = '/brand/knockscout-LogoMark-on-black.mp4'
const LOGO_POSTER_SRC = '/brand/knockscout-LogoMark-on-black-poster.png'
const BOOT_VIDEO_ID = 'boot-logo-video'
const LOGO_PLATE = '#000000'

function loadingPortalTarget() {
  // #modal-root sits at max z-index (map chrome / FAB / action bar live there).
  // Portaling here keeps the splash above that chrome; body alone cannot.
  return document.getElementById('modal-root') || document.body
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Logo size vs viewport-fitted contain — see getLogoSplashScale(). */
/** Cover this fraction of the drawn video height at top + bottom (hides edge black lines). */
const EDGE_COVER_RATIO = 0.035
const EDGE_COVER_MIN_PX = 3
/** Extra top band — hides hairline above the logo plate. */
const EDGE_COVER_TOP_RATIO = 0.12
const EDGE_COVER_TOP_MIN_PX = 14

/**
 * Full-bleed canvas: fill plate black, draw logo contained & centered at getLogoSplashScale().
 * Plate fill is sampled from the rendered video so edges don’t show a hairline.
 */
function startCanvasMirror(video, canvas) {
  let ctx = null
  try {
    ctx = canvas.getContext('2d', { alpha: false, colorSpace: 'srgb' })
  } catch {
    ctx = canvas.getContext('2d', { alpha: false })
  }
  if (!ctx) return () => {}

  let raf = 0
  let stopped = false
  let plateFill = LOGO_PLATE
  const probe = document.createElement('canvas')
  probe.width = 48
  probe.height = 48
  let probeCtx = null
  try {
    probeCtx = probe.getContext('2d', { alpha: false, colorSpace: 'srgb' })
  } catch {
    probeCtx = probe.getContext('2d', { alpha: false })
  }

  const fillPlate = () => {
    ctx.fillStyle = plateFill
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  const syncSize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const cssW = Math.max(1, Math.round(canvas.clientWidth || window.innerWidth))
    const cssH = Math.max(1, Math.round(canvas.clientHeight || window.innerHeight))
    // Prefer HTML boot lock so handoff does not re-center in a taller viewport.
    const locked = getBootLogoLayout() || setBootLogoLayout(cssW, cssH) || { w: cssW, h: cssH }
    const w = Math.round(cssW * dpr)
    const h = Math.round(cssH * dpr)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      fillPlate()
    }
    return { cssW, cssH, dpr, lockedW: locked.w, lockedH: locked.h }
  }

  const paint = () => {
    const { dpr, lockedW, lockedH } = syncSize()
    fillPlate()

    if (!(video.readyState >= 2 && video.videoWidth > 0) || !probeCtx) return

    probeCtx.drawImage(video, 0, 0, probe.width, probe.height)
    let r = 0
    let g = 0
    let b = 0
    try {
      ;[r, g, b] = probeCtx.getImageData(4, 4, 1, 1).data
    } catch {
      return
    }

    // iOS can expose a mid-grey placeholder frame before decode; never let that
    // become the full-screen plateFill (reads as a grey flash before the MP4).
    if (!isUsableLogoSplashPlateSample(r, g, b)) {
      fillPlate()
      return
    }

    plateFill = `rgb(${r},${g},${b})`
    fillPlate()

    const { dx, dy, dw, dh } = logoDrawRect({
      lockedW,
      lockedH,
      videoW: video.videoWidth,
      videoH: video.videoHeight,
      scale: getLogoSplashScale(),
      dpr,
    })
    ctx.drawImage(video, dx, dy, dw, dh)

    // Plate-colored bands over the top/bottom video edges (hide black scan lines).
    const coverBottom = Math.max(EDGE_COVER_MIN_PX * dpr, Math.round(dh * EDGE_COVER_RATIO))
    const coverTop = Math.max(EDGE_COVER_TOP_MIN_PX * dpr, Math.round(dh * EDGE_COVER_TOP_RATIO))
    ctx.fillStyle = plateFill
    ctx.fillRect(dx, dy, dw, coverTop)
    ctx.fillRect(dx, dy + dh - coverBottom, dw, coverBottom)
  }

  syncSize()
  fillPlate()

  const onResize = () => {
    syncSize()
    paint()
  }
  window.addEventListener('resize', onResize)

  const draw = () => {
    if (stopped) return
    paint()
    raf = requestAnimationFrame(draw)
  }

  draw()
  return () => {
    stopped = true
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', onResize)
  }
}

/**
 * Full-screen KnockScout boot splash.
 * Plays the brand logo MP4 once, then opens the app immediately — does not
 * keep waiting on auth/basemap after playback ends. Reduced-motion still
 * holds until `active` clears (no video end event).
 *
 * @param {{ active: boolean, message?: string, onVisibleChange?: (visible: boolean) => void }} props
 */
export function AppLoadingScreen({
  active,
  message = APP_LOADING_MESSAGES.mapAuth,
  onVisibleChange,
}) {
  const [mounted, setMounted] = useState(active)
  const [exiting, setExiting] = useState(false)
  const [playCompleted, setPlayCompleted] = useState(() => prefersReducedMotion())
  const reduceMotion = prefersReducedMotion()
  const screenRef = useRef(null)
  const stageRef = useRef(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
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
    // No MP4 end signal — keep covering until the caller marks inactive.
    if (reduceMotion && activeRef.current) return
    exitingRef.current = true
    setExiting(true)
  }

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage || prefersReducedMotion()) {
      window.__removeInitialLoader?.()
      // HTML boot may have locked layout; static/reduced-motion path does not use it.
      clearBootLogoLayout()
      return undefined
    }

    // Prefer the HTML boot video so playback continues across React mount.
    let video = document.getElementById(BOOT_VIDEO_ID)
    if (video instanceof HTMLVideoElement) {
      video.removeAttribute('id')
    } else {
      video = document.createElement('video')
      video.src = LOGO_VIDEO_SRC
      // No poster attr — iOS can flash a grey decoder frame; canvas stays black until a real frame.
      video.setAttribute('aria-hidden', 'true')
    }

    // Keep the media element off-screen; paint via canvas for sRGB-matched blues.
    video.className = 'app-loading-screen__video-source'
    configureLogoVideoElement(video)
    videoRef.current = video

    const canvas = document.createElement('canvas')
    canvas.className = 'app-loading-screen__video'
    canvas.setAttribute('aria-hidden', 'true')
    canvasRef.current = canvas

    stage.replaceChildren(video, canvas)
    // Paint one frozen frame before removing the HTML loader to avoid a gap/jump.
    const stopMirror = startCanvasMirror(video, canvas)
    window.__removeInitialLoader?.()

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

    void beginLogoSplashPlayback(video)

    return () => {
      window.clearTimeout(fallbackTimer)
      video.removeEventListener('ended', onEnded)
      stopMirror()
    }
  }, [])

  // Stay "visible" through the fade so FAB / chrome stay hidden until opacity hits 0.
  useEffect(() => {
    onVisibleChangeRef.current?.(mounted)
  }, [mounted])

  useEffect(() => {
    // After the logo has played, never remount just because auth/basemap are
    // still loading — open as soon as the MP4 ends.
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

  // Double rAF ensures the browser paints opacity:1 before the exit animation starts.
  useLayoutEffect(() => {
    if (!exiting || !screenRef.current) return undefined

    const el = screenRef.current
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
      })
    })

    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [exiting])

  useEffect(() => {
    if (!exiting) return undefined
    const reduceMotion = prefersReducedMotion()
    const t = window.setTimeout(
      () => {
        setMounted(false)
        setExiting(false)
        exitingRef.current = false
        // Allow a later splash (e.g. public pages) to capture a fresh lock.
        clearBootLogoLayout()
      },
      reduceMotion ? 0 : FADE_OUT_MS
    )
    return () => window.clearTimeout(t)
  }, [exiting])

  if (typeof document === 'undefined' || !mounted) return null

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
          {prefersReducedMotion() ? (
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
