import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { APP_LOADING_MESSAGES } from '@/config/appLoadingMessages'

const MIN_VISIBLE_MS = 400
const EMBLEM_SRC = '/brand/emblem-white.svg'
const WORDMARK_SRC = '/brand/wordmark-white.svg'

function loadingPortalTarget() {
  // #modal-root sits at max z-index (map chrome / FAB / action bar live there).
  // Portaling here keeps the splash above that chrome; body alone cannot.
  return document.getElementById('modal-root') || document.body
}

/**
 * Full-screen KnockScout boot splash (auth + basemap + first map paint).
 * Portaled above map chrome; hands off from #initial-loader in index.html on mount.
 *
 * @param {{ active: boolean, message?: string, onVisibleChange?: (visible: boolean) => void }} props
 */
export function AppLoadingScreen({
  active,
  message = APP_LOADING_MESSAGES.mapAuth,
  onVisibleChange,
}) {
  const [visible, setVisible] = useState(active)
  const shownAtRef = useRef(0)
  const onVisibleChangeRef = useRef(onVisibleChange)
  onVisibleChangeRef.current = onVisibleChange

  useLayoutEffect(() => {
    window.__removeInitialLoader?.()
  }, [])

  useEffect(() => {
    onVisibleChangeRef.current?.(visible)
  }, [visible])

  useEffect(() => {
    if (active) {
      shownAtRef.current = Date.now()
      setVisible(true)
      return undefined
    }
    const elapsed = Date.now() - shownAtRef.current
    const delay = Math.max(0, MIN_VISIBLE_MS - elapsed)
    const t = window.setTimeout(() => setVisible(false), delay)
    return () => window.clearTimeout(t)
  }, [active])

  if (typeof document === 'undefined') return null

  return createPortal(
    visible ? (
      <div
        className="app-loading-screen app-loading-screen--visible"
        role="status"
        aria-live="polite"
        aria-label={message}
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
            <div className="app-loading-screen__orbit" aria-hidden />
            <img
              src={EMBLEM_SRC}
              alt=""
              className="app-loading-screen__emblem"
              width={92}
              height={120}
              decoding="async"
            />
          </div>

          <div className="app-loading-screen__brand">
            <img
              src={WORDMARK_SRC}
              alt="KnockScout"
              className="app-loading-screen__wordmark"
              width={220}
              height={29}
              decoding="async"
            />
            <span className="app-loading-screen__tagline">{message}</span>
          </div>

          <div className="app-loading-screen__progress" aria-hidden>
            <div className="app-loading-screen__progress-fill" />
          </div>
        </div>
      </div>
    ) : null,
    loadingPortalTarget()
  )
}

export default AppLoadingScreen
