import { useEffect, useRef, useImperativeHandle, forwardRef, useState, useMemo } from 'react'
import { Source, Layer } from 'react-map-gl/maplibre'
import { createKalmanFilter, smoothPath } from '../utils/pathSmoothing'

const LIVE_COLOR = '#ef4444'
const LIVE_GLOW = 'rgba(239, 68, 68, 0.3)'

const SAVED_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
  '#06b6d4', '#f97316', '#6366f1', '#14b8a6', '#e11d48',
]

function toLineGeoJSON(points) {
  if (!points || points.length < 2) return { type: 'FeatureCollection', features: [] }
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: points.map(p => [p.lng, p.lat]),
      },
      properties: {},
    }],
  }
}

const PathTracker = forwardRef(function PathTracker({ mapRef, isTracking, userLocation, savedPathsToShow = [], smoothingLevel = 'normal' }, ref) {
  const kalmanRef = useRef(null)
  const rawPointsRef = useRef([])
  const filteredPointsRef = useRef([])
  const [liveGeoJSON, setLiveGeoJSON] = useState({ type: 'FeatureCollection', features: [] })

  useImperativeHandle(ref, () => ({
    getRawPoints: () => rawPointsRef.current,
    getFilteredPoints: () => filteredPointsRef.current,
    reset() {
      rawPointsRef.current = []
      filteredPointsRef.current = []
      if (kalmanRef.current) kalmanRef.current.reset()
      setLiveGeoJSON({ type: 'FeatureCollection', features: [] })
    }
  }))

  useEffect(() => {
    if (!isTracking) {
      setLiveGeoJSON({ type: 'FeatureCollection', features: [] })
      return
    }
    kalmanRef.current = createKalmanFilter()
    rawPointsRef.current = []
    filteredPointsRef.current = []
  }, [isTracking])

  useEffect(() => {
    if (!isTracking || !userLocation || typeof userLocation.lat !== 'number') return
    const { lat, lng, accuracy } = userLocation
    rawPointsRef.current.push({ lat, lng, accuracy: accuracy || 10, timestamp: Date.now() })
    if (!kalmanRef.current) kalmanRef.current = createKalmanFilter()
    const filtered = kalmanRef.current.update(lat, lng, accuracy || 10)
    filteredPointsRef.current.push(filtered)
    if (filteredPointsRef.current.length >= 2) {
      setLiveGeoJSON(toLineGeoJSON(filteredPointsRef.current))
    }
  }, [isTracking, userLocation])

  const savedGeoJSONs = useMemo(() => {
    return savedPathsToShow.map((path, idx) => {
      const smoothed = smoothPath(
        (path.points || []).map(p => ({ lat: p.lat, lng: p.lng })),
        smoothingLevel
      )
      if (smoothed.length < 2) return null
      const color = SAVED_COLORS[idx % SAVED_COLORS.length]
      return { id: path.id, geojson: toLineGeoJSON(smoothed), color, glow: color + '4D' }
    }).filter(Boolean)
  }, [savedPathsToShow, smoothingLevel])

  return (
    <>
      {/* Live tracking path */}
      <Source id="path-live" type="geojson" data={liveGeoJSON}>
        <Layer
          id="path-live-glow"
          type="line"
          paint={{ 'line-color': LIVE_GLOW, 'line-width': 10, 'line-opacity': 0.6 }}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        />
        <Layer
          id="path-live-stroke"
          type="line"
          paint={{ 'line-color': LIVE_COLOR, 'line-width': 4, 'line-opacity': 1 }}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        />
      </Source>
      {/* Saved paths */}
      {savedGeoJSONs.map((item) => (
        <Source key={item.id} id={`path-saved-${item.id}`} type="geojson" data={item.geojson}>
          <Layer
            id={`path-saved-glow-${item.id}`}
            type="line"
            paint={{ 'line-color': item.glow, 'line-width': 10, 'line-opacity': 0.6 }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
          <Layer
            id={`path-saved-stroke-${item.id}`}
            type="line"
            paint={{ 'line-color': item.color, 'line-width': 4, 'line-opacity': 1 }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
        </Source>
      ))}
    </>
  )
})

export default PathTracker
