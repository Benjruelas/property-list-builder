import { useEffect, useRef, useImperativeHandle, forwardRef, useState, useMemo } from 'react'
import { Source, Layer } from 'react-map-gl/maplibre'
import { createKalmanFilter, smoothPath } from '../utils/pathSmoothing'
import { getPathColor, pathGlowFromColor } from '../utils/pathColors'

const LIVE_COLOR = '#ef4444'
const LIVE_GLOW = 'rgba(239, 68, 68, 0.3)'

function toLineGeoJSON(points, properties = {}) {
  if (!points || points.length < 2) return { type: 'FeatureCollection', features: [] }
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: points.map((p) => [p.lng, p.lat]),
      },
      properties,
    }],
  }
}

const PathTracker = forwardRef(function PathTracker({
  mapRef,
  isTracking,
  userLocation,
  savedPathsToShow = [],
  pathColorMap,
  smoothingLevel = 'normal',
}, ref) {
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
    },
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

  const savedGeoJSON = useMemo(() => {
    const features = savedPathsToShow.map((path) => {
      const smoothed = smoothPath(
        (path.points || []).map((p) => ({ lat: p.lat, lng: p.lng })),
        smoothingLevel
      )
      if (smoothed.length < 2) return null
      const color = getPathColor(path.id, pathColorMap)
      return {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: smoothed.map((p) => [p.lng, p.lat]),
        },
        properties: {
          pathId: path.id,
          color,
          glow: pathGlowFromColor(color),
        },
      }
    }).filter(Boolean)

    return { type: 'FeatureCollection', features }
  }, [savedPathsToShow, pathColorMap, smoothingLevel])

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
      {/* Saved paths — one source, per-feature colors */}
      {savedGeoJSON.features.length > 0 && (
        <Source id="paths-saved" type="geojson" data={savedGeoJSON}>
          <Layer
            id="paths-saved-glow"
            type="line"
            paint={{
              'line-color': ['get', 'glow'],
              'line-width': 10,
              'line-opacity': 0.6,
            }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
          <Layer
            id="paths-saved-stroke"
            type="line"
            paint={{
              'line-color': ['get', 'color'],
              'line-width': 4,
              'line-opacity': 1,
            }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
        </Source>
      )}
    </>
  )
})

export default PathTracker
