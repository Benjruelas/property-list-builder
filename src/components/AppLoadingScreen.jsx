import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { APP_LOADING_MESSAGES } from '@/config/appLoadingMessages'
import {
  clearBootLogoLayout,
  scheduleLogoSplashComplete,
  LOGO_SPLASH_ANIM_MS,
  LOGO_SPLASH_WEBP_SRC,
  LOGO_SPLASH_POSTER_SRC,
} from '@/utils/logoSplashPlayback'

/** Match `.app-loading-screen.is-exiting` / `#initial-loader.is-exiting` duration. */
const FADE_OUT_MS = 320
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
 * Uses an animated WebP <img> (not <video>) so iOS 26 Home Screen / PWA
 * media regressions cannot freeze the logo mark.
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
  const [host, setHost] = useState(() => (
    typeof document !== 'undefined'
      && document.getElementById(BOOT_LOADER_ID)
      && !prefersReducedMotion()
      ? 'boot'
      : 'portal'
  ))

  const screenRef = useRef(null)
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
      window.__removeInitialLoader?.()
      clearBootLogoLayout()
      setHost('portal')
      return undefined
    }

    const boot = document.getElementById(BOOT_LOADER_ID)

    const markCompleted = () => {
      if (playCompletedRef.current) return
      playCompletedRef.current = true
      setPlayCompleted(true)
      tryExit()
    }

    if (boot) {
      setHost('boot')
      window.__bootSplashOwnedByReact = true
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

      // Drop any leftover video/canvas from older builds.
      boot.querySelectorAll('video, canvas').forEach((el) => el.remove())

      // Leave the HTML WebP src alone so React mount does not restart mid-animation.

      const cancel = scheduleLogoSplashComplete(markCompleted, LOGO_SPLASH_ANIM_MS)
      return () => cancel()
    }

    setHost('portal')
    window.__removeInitialLoader?.()
    const cancel = scheduleLogoSplashComplete(markCompleted, LOGO_SPLASH_ANIM_MS)
    return () => cancel()
  }, [message, reduceMotion])

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
        <div className="app-loading-screen__video-slot">
          {reduceMotion ? (
            <img
              src={LOGO_SPLASH_POSTER_SRC}
              alt="KnockScout"
              className="app-loading-screen__logo-anim app-loading-screen__logo-anim--static"
            />
          ) : (
            <img
              src={`${LOGO_SPLASH_WEBP_SRC}?t=portal`}
              alt=""
              className="app-loading-screen__logo-anim"
              aria-hidden="true"
            />
          )}
        </div>
      </div>
    </div>,
    loadingPortalTarget()
  )
}

export default AppLoadingScreen
