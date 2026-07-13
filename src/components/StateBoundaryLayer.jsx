import { useEffect, useState } from 'react'
import { Source, Layer } from 'react-map-gl/maplibre'

/** Parcel outlines begin at zoom 15 — state borders stay visible below that. */
const STATE_MAX_ZOOM = 14

const STATES_GEOJSON_URL = '/us-states-boundaries.json'

export function StateBoundaryLayer() {
  const [geojson, setGeojson] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch(STATES_GEOJSON_URL)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.type === 'FeatureCollection') setGeojson(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (!geojson) return null

  return (
    <Source id="us-states" type="geojson" data={geojson}>
      <Layer
        id="us-states-line-halo"
        type="line"
        maxzoom={STATE_MAX_ZOOM}
        paint={{
          'line-color': '#0f172a',
          'line-opacity': 0.35,
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1, 8, 2, 14, 3],
        }}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
      />
      <Layer
        id="us-states-line"
        type="line"
        maxzoom={STATE_MAX_ZOOM}
        paint={{
          'line-color': '#f1f5f9',
          'line-opacity': 0.85,
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.5, 8, 1, 14, 1.75],
        }}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
      />
    </Source>
  )
}
