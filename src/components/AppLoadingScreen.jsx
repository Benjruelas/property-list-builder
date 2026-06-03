import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'

const MIN_VISIBLE_MS = 550
const LOGO_SRC = '/icon-512.png'

/**
 * Full-screen KnockScout boot splash (auth + first map load).
 * Portaled above the app; exits with a short minimum display time to avoid flicker.
 */
export function AppLoadingScreen({ active }) {
  const [visible, setVisible] = useState(active)
  const shownAtRef = useRef(0)

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
    <AnimatePresence mode="wait">
      {visible && (
        <motion.div
          className="app-loading-screen"
          role="status"
          aria-live="polite"
          aria-label="Loading KnockScout"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="app-loading-screen__bg" aria-hidden>
            <motion.div
              className="app-loading-screen__orb app-loading-screen__orb--a"
              animate={{
                x: [0, 28, -12, 0],
                y: [0, -20, 14, 0],
                scale: [1, 1.12, 0.95, 1],
              }}
              transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="app-loading-screen__orb app-loading-screen__orb--b"
              animate={{
                x: [0, -24, 18, 0],
                y: [0, 22, -10, 0],
                scale: [1, 0.92, 1.08, 1],
              }}
              transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="app-loading-screen__grid"
              animate={{ opacity: [0.35, 0.55, 0.35] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>

          <div className="app-loading-screen__content">
            <motion.div
              className="app-loading-screen__logo-wrap"
              initial={{ scale: 0.82, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            >
              <motion.div
                className="app-loading-screen__ring"
                animate={{ rotate: 360 }}
                transition={{ duration: 2.8, repeat: Infinity, ease: 'linear' }}
              />
              <motion.div
                className="app-loading-screen__ring app-loading-screen__ring--inner"
                animate={{ rotate: -360 }}
                transition={{ duration: 4.2, repeat: Infinity, ease: 'linear' }}
              />
              <motion.img
                src={LOGO_SRC}
                alt=""
                className="app-loading-screen__logo"
                width={88}
                height={88}
                initial={{ scale: 0.9 }}
                animate={{ scale: [1, 1.04, 1] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              />
            </motion.div>

            <motion.div
              className="app-loading-screen__brand"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="app-loading-screen__name">KnockScout</span>
              <motion.span
                className="app-loading-screen__tagline"
                animate={{ opacity: [0.45, 0.85, 0.45] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                Loading your map…
              </motion.span>
            </motion.div>

            <motion.div
              className="app-loading-screen__progress"
              initial={{ opacity: 0, scaleX: 0.6 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ delay: 0.25, duration: 0.45 }}
            >
              <motion.div
                className="app-loading-screen__progress-fill"
                animate={{ x: ['-100%', '120%'] }}
                transition={{ duration: 1.35, repeat: Infinity, ease: 'easeInOut' }}
              />
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

export default AppLoadingScreen
