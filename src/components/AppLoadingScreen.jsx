import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { APP_LOADING_MESSAGES } from '@/config/appLoadingMessages'

const MIN_VISIBLE_MS = 400
const LOGO_SRC = '/emblem-white.png'

/**
 * Full-screen KnockScout boot splash (auth + basemap + first map paint).
 * Portaled above the app; hands off from #initial-loader in index.html on mount.
 */
export function AppLoadingScreen({
  active,
  message = APP_LOADING_MESSAGES.mapAuth,
}) {
  const [visible, setVisible] = useState(active)
  const shownAtRef = useRef(0)

  useLayoutEffect(() => {
    window.__removeInitialLoader?.()
  }, [])

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
          <div className="app-loading-screen__orb app-loading-screen__orb--a" />
          <div className="app-loading-screen__orb app-loading-screen__orb--b" />
          <div className="app-loading-screen__grid" />
        </div>

        <div className="app-loading-screen__content">
          <div className="app-loading-screen__logo-wrap">
            <div className="app-loading-screen__ring" />
            <div className="app-loading-screen__ring app-loading-screen__ring--inner" />
            <img
              src={LOGO_SRC}
              alt=""
              className="app-loading-screen__logo"
              width={88}
              height={88}
            />
          </div>

          <div className="app-loading-screen__brand">
            <span className="app-loading-screen__name">KnockScout</span>
            <span className="app-loading-screen__tagline">{message}</span>
          </div>

          <div className="app-loading-screen__progress">
            <div className="app-loading-screen__progress-fill" />
          </div>
        </div>
      </div>
    ) : null,
    document.body
  )
}

export default AppLoadingScreen
