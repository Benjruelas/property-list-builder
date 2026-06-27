import { useState, useEffect, useCallback } from 'react'

/**
 * Screen position for the parcel popup: anchored above the parcel on the map.
 * Updates on map move/zoom and viewport resize.
 */
export function usePopupPosition(mapRef, lat, lng) {
  const [pos, setPos] = useState(null)

  const update = useCallback(() => {
    const map = mapRef?.current
    if (!map || lat == null || lng == null) {
      setPos(null)
      return
    }
    try {
      const point = map.project([lng, lat])
      const rect = map.getCanvas().getBoundingClientRect()
      setPos({
        x: rect.left + point.x,
        y: rect.top + point.y,
      })
    } catch {
      setPos(null)
    }
  }, [mapRef, lat, lng])

  useEffect(() => {
    const map = mapRef?.current
    if (!map || lat == null || lng == null) {
      setPos(null)
      return undefined
    }

    update()
    map.on('move', update)
    map.on('zoom', update)
    map.on('resize', update)

    window.addEventListener('resize', update)
    const vv = window.visualViewport
    if (vv) {
      vv.addEventListener('resize', update)
      vv.addEventListener('scroll', update)
    }

    return () => {
      map.off('move', update)
      map.off('zoom', update)
      map.off('resize', update)
      window.removeEventListener('resize', update)
      if (vv) {
        vv.removeEventListener('resize', update)
        vv.removeEventListener('scroll', update)
      }
    }
  }, [update, mapRef, lat, lng])

  return pos
}
