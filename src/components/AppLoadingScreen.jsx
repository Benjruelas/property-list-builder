import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { APP_LOADING_MESSAGES } from '@/config/appLoadingMessages'

/** Keep the splash up long enough to read the brand lockup (~1.5s). */
const MIN_VISIBLE_MS = 1500
/** Match `.app-loading-screen.is-exiting` animation duration. */
const FADE_OUT_MS = 700
/** Official white lockup from the designer pack (fist + KnockScout + tagline). */
const LOCKUP_SRC = '/brand/lockup-variant-2.svg'

function loadingPortalTarget() {
  // #modal-root sits at max z-index (map chrome / FAB / action bar live there).
  // Portaling here keeps the splash above that chrome; body alone cannot.
  return document.getElementById('modal-root') || document.body
}

/**
 * Full-screen KnockScout boot splash (auth + basemap + first map paint).
 * Portaled above map chrome; hands off from #initial-loader in index.html on mount.
 * Fades out before unmounting so the map eases in underneath.
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
  const screenRef = useRef(null)
  const shownAtRef = useRef(0)
  const onVisibleChangeRef = useRef(onVisibleChange)
  onVisibleChangeRef.current = onVisibleChange

  useLayoutEffect(() => {
    window.__removeInitialLoader?.()
  }, [])

  // Stay "visible" through the fade so FAB / chrome stay hidden until opacity hits 0.
  useEffect(() => {
    onVisibleChangeRef.current?.(mounted)
  }, [mounted])

  useEffect(() => {
    if (active) {
      shownAtRef.current = Date.now()
      setExiting(false)
      setMounted(true)
      return undefined
    }
    if (!mounted || exiting) return undefined

    const elapsed = Date.now() - shownAtRef.current
    const delay = Math.max(0, MIN_VISIBLE_MS - elapsed)
    const t = window.setTimeout(() => setExiting(true), delay)
    return () => window.clearTimeout(t)
  }, [active, mounted, exiting])

  // Double rAF ensures the browser paints opacity:1 before the exit animation starts.
  useLayoutEffect(() => {
    if (!exiting || !screenRef.current) return undefined

    const el = screenRef.current
    el.classList.remove('is-exiting')
    void el.offsetHeight

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
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const t = window.setTimeout(
      () => {
        setMounted(false)
        setExiting(false)
      },
      reduceMotion ? 0 : FADE_OUT_MS
    )
    return () => window.clearTimeout(t)
  }, [exiting])

  if (typeof document === 'undefined' || !mounted) return null

  return createPortal(
    <div
      ref={screenRef}
      className="app-loading-screen app-loading-screen--visible"
      role="status"
      aria-live="polite"
      aria-label={message}
      aria-hidden={exiting || undefined}
    >
      <div className="app-loading-screen__bg" aria-hidden>
        <div className="app-loading-screen__wash" />
        <div className="app-loading-screen__aurora app-loading-screen__aurora--a" />
        <div className="app-loading-screen__aurora app-loading-screen__aurora--b" />
        <div className="app-loading-screen__aurora app-loading-screen__aurora--c" />
        <div className="app-loading-screen__sheen" />
      </div>

      <div className="app-loading-screen__content">
        <div className="app-loading-screen__mark">
          <div className="app-loading-screen__bloom" />
          <img
            src={LOCKUP_SRC}
            alt="KnockScout"
            className="app-loading-screen__lockup"
            width={320}
            height={98}
            decoding="async"
          />
        </div>

        <span className="app-loading-screen__tagline">{message}</span>

        <div className="app-loading-screen__progress" aria-hidden>
          <div className="app-loading-screen__progress-fill" />
        </div>
      </div>
    </div>,
    loadingPortalTarget()
  )
}

export default AppLoadingScreen
