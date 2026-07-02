import { useEffect, useRef, useImperativeHandle, forwardRef, useMemo } from 'react'
import { Source, Layer } from 'react-map-gl/maplibre'
import { createKalmanFilter, smoothPath } from '../utils/pathSmoothing'
import { getPathColor, pathGlowFromColor } from '../utils/pathColors'
import { subscribeUserLocation } from '../utils/locationStore'

const LIVE_COLOR = '#ef4444'
const LIVE_GLOW = 'rgba(239, 68, 68, 0.3)'

// Cap in-memory tracking arrays so multi-hour shifts don't grow RAM without
// bound (~1 point/sec ⇒ 14k+ points on a 4-hour drive). When the cap is hit
// the older 80% of the path is decimated 2:1, preserving the recent tail.
const MAX_TRACK_POINTS = 10000

function decimateOlderPoints(points) {
  const cutoff = Math.floor(points.length * 0.8)
  const kept = []
  for (let i = 0; i < cutoff; i += 2) kept.push(points[i])
  for (let i = cutoff; i < points.length; i++) kept.push(points[i])
  return kept
}

const EMPTY_FC = { type: 'FeatureCollection', features: [] }

function toLineGeoJSON(points, properties = {}) {
  if (!points || points.length < 2) return EMPTY_FC
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
  savedPathsToShow = [],
  pathColorMap,
  smoothingLevel = 'normal',
}, ref) {
  const kalmanRef = useRef(null)
  const rawPointsRef = useRef([])
  const filteredPointsRef = useRef([])

  // Push line updates straight into the maplibre source instead of React
  // state: a GPS tick redraws the line without re-rendering any component.
  const setLiveData = (points) => {
    const src = mapRef?.current?.getSource?.('path-live')
    if (src) src.setData(toLineGeoJSON(points))
  }

  useImperativeHandle(ref, () => ({
    getRawPoints: () => rawPointsRef.current,
    getFilteredPoints: () => filteredPointsRef.current,
    reset() {
      rawPointsRef.current = []
      filteredPointsRef.current = []
      if (kalmanRef.current) kalmanRef.current.reset()
      setLiveData([])
    },
  }))

  useEffect(() => {
    if (!isTracking) {
      setLiveData([])
      return undefined
    }
    kalmanRef.current = createKalmanFilter()
    rawPointsRef.current = []
    filteredPointsRef.current = []
    setLiveData([])

    const unsubscribe = subscribeUserLocation((loc) => {
      if (!loc || typeof loc.lat !== 'number') return
      const { lat, lng, accuracy } = loc
      rawPointsRef.current.push({ lat, lng, accuracy: accuracy || 10, timestamp: Date.now() })
      if (rawPointsRef.current.length > MAX_TRACK_POINTS) {
        rawPointsRef.current = decimateOlderPoints(rawPointsRef.current)
      }
      if (!kalmanRef.current) kalmanRef.current = createKalmanFilter()
      const filtered = kalmanRef.current.update(lat, lng, accuracy || 10)
      filteredPointsRef.current.push(filtered)
      if (filteredPointsRef.current.length > MAX_TRACK_POINTS) {
        filteredPointsRef.current = decimateOlderPoints(filteredPointsRef.current)
      }
      if (filteredPointsRef.current.length >= 2) {
        setLiveData(filteredPointsRef.current)
      }
    })
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTracking])

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
      {/* Live tracking path — data is pushed imperatively via setData() */}
      <Source id="path-live" type="geojson" data={EMPTY_FC}>
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
