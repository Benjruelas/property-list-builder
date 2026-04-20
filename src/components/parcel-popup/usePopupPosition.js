import { useState, useEffect, useCallback } from 'react'

function getViewportCenter() {
  if (typeof window === 'undefined') return { x: 0, y: 0 }
  const vv = window.visualViewport
  if (vv) {
    return {
      x: vv.offsetLeft + vv.width / 2,
      y: vv.offsetTop + vv.height / 2,
    }
  }
  return {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  }
}

/**
 * Screen position for the parcel popup: always the viewport center (not tied to map projection).
 * Updates on resize / visualViewport so it stays centered on mobile (URL bar, etc.).
 */
export function usePopupPosition(_mapRef, lat, lng) {
  const [pos, setPos] = useState(null)

  const update = useCallback(() => {
    if (lat == null || lng == null) {
      setPos(null)
      return
    }
    setPos(getViewportCenter())
  }, [lat, lng])

  useEffect(() => {
    update()
    window.addEventListener('resize', update)
    const vv = window.visualViewport
    if (vv) {
      vv.addEventListener('resize', update)
      vv.addEventListener('scroll', update)
    }
    return () => {
      window.removeEventListener('resize', update)
      if (vv) {
        vv.removeEventListener('resize', update)
        vv.removeEventListener('scroll', update)
      }
    }
  }, [update])

  return pos
}
