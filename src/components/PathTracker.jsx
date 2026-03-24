import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { createKalmanFilter, smoothPath } from '../utils/pathSmoothing'

const PATH_PANE_NAME = 'pathPane'
const PATH_PANE_Z = '500'

const LIVE_COLOR = '#ef4444'
const LIVE_GLOW = 'rgba(239, 68, 68, 0.3)'

const SAVED_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
  '#06b6d4', '#f97316', '#6366f1', '#14b8a6', '#e11d48',
]

function ensurePane(map) {
  if (!map.getPane(PATH_PANE_NAME)) {
    const rotatePane = map.getPane('rotatePane')
    const pane = map.createPane(PATH_PANE_NAME, rotatePane || undefined)
    if (pane) {
      pane.style.pointerEvents = 'none'
      pane.style.zIndex = PATH_PANE_Z
    }
  }
}

function createStyledPolyline(latlngs, color, glow, animated) {
  const outer = L.polyline(latlngs, {
    color: glow,
    weight: 10,
    opacity: 0.6,
    lineCap: 'round',
    lineJoin: 'round',
    pane: PATH_PANE_NAME,
    interactive: false,
    className: animated ? 'path-glow-pulse' : undefined
  })
  const inner = L.polyline(latlngs, {
    color,
    weight: 4,
    opacity: 1,
    lineCap: 'round',
    lineJoin: 'round',
    pane: PATH_PANE_NAME,
    interactive: false,
    className: animated ? 'path-line-pulse' : undefined
  })
  return L.layerGroup([outer, inner])
}

const PathTracker = forwardRef(function PathTracker({ isTracking, userLocation, savedPathsToShow = [], smoothingLevel = 'normal' }, ref) {
  const map = useMap()
  const kalmanRef = useRef(null)
  const rawPointsRef = useRef([])
  const filteredPointsRef = useRef([])
  const liveLayerRef = useRef(null)
  const savedLayersRef = useRef(new Map())

  useImperativeHandle(ref, () => ({
    getRawPoints: () => rawPointsRef.current,
    getFilteredPoints: () => filteredPointsRef.current,
    reset() {
      rawPointsRef.current = []
      filteredPointsRef.current = []
      if (kalmanRef.current) kalmanRef.current.reset()
      if (liveLayerRef.current) {
        liveLayerRef.current.remove()
        liveLayerRef.current = null
      }
    }
  }))

  useEffect(() => {
    ensurePane(map)
  }, [map])

  // Live tracking
  useEffect(() => {
    if (!isTracking) {
      if (liveLayerRef.current) {
        liveLayerRef.current.remove()
        liveLayerRef.current = null
      }
      return
    }

    kalmanRef.current = createKalmanFilter()
    rawPointsRef.current = []
    filteredPointsRef.current = []
  }, [isTracking])

  useEffect(() => {
    if (!isTracking || !userLocation || typeof userLocation.lat !== 'number') return

    const { lat, lng, accuracy } = userLocation

    rawPointsRef.current.push({
      lat, lng,
      accuracy: accuracy || 10,
      timestamp: Date.now()
    })

    if (!kalmanRef.current) kalmanRef.current = createKalmanFilter()
    const filtered = kalmanRef.current.update(lat, lng, accuracy || 10)
    filteredPointsRef.current.push(filtered)

    const latlngs = filteredPointsRef.current.map(p => [p.lat, p.lng])

    if (latlngs.length < 2) return

    if (liveLayerRef.current) {
      liveLayerRef.current.remove()
    }
    liveLayerRef.current = createStyledPolyline(latlngs, LIVE_COLOR, LIVE_GLOW, true)
    liveLayerRef.current.addTo(map)
  }, [isTracking, userLocation, map])

  // Saved paths (re-render when smoothingLevel changes)
  const prevSmoothingRef = useRef(smoothingLevel)
  useEffect(() => {
    const currentIds = new Set(savedPathsToShow.map(p => p.id))
    const levelChanged = prevSmoothingRef.current !== smoothingLevel
    prevSmoothingRef.current = smoothingLevel

    savedLayersRef.current.forEach((layer, id) => {
      if (!currentIds.has(id) || levelChanged) {
        layer.remove()
        savedLayersRef.current.delete(id)
      }
    })

    savedPathsToShow.forEach((path, idx) => {
      if (savedLayersRef.current.has(path.id)) return

      const smoothed = smoothPath(
        (path.points || []).map(p => ({ lat: p.lat, lng: p.lng })),
        smoothingLevel
      )
      if (smoothed.length < 2) return

      const latlngs = smoothed.map(p => [p.lat, p.lng])
      const color = SAVED_COLORS[idx % SAVED_COLORS.length]
      const glow = color + '4D'

      const layer = createStyledPolyline(latlngs, color, glow, false)
      layer.addTo(map)
      savedLayersRef.current.set(path.id, layer)
    })
  }, [savedPathsToShow, map, smoothingLevel])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (liveLayerRef.current) liveLayerRef.current.remove()
      savedLayersRef.current.forEach(layer => layer.remove())
      savedLayersRef.current.clear()
    }
  }, [])

  return null
})

export default PathTracker
