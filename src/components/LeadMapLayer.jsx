import { useEffect, useMemo, useRef } from 'react'
import { Source, Layer } from 'react-map-gl/maplibre'
import {
  buildLeadMapGeoJSON,
  distinctLeadMapColors,
} from '@/utils/leadMapFeatures'
import { hexToRgba } from '@/utils/leadStatusMapColors'

const SOURCE_ID = 'leads-map'
const GLOW_LAYER = 'leads-map-glow'
const CORE_LAYER = 'leads-map-core'
const ICON_LAYER = 'leads-map-icon'
const ICON_ID = 'leads-map-user-icon'

const HEATMAP_MAX_ZOOM = 12
const DOTS_MIN_ZOOM = 10

function colorLayerKey(hex) {
  return String(hex || '').replace('#', '').toLowerCase()
}

/** White person silhouette for symbol layer (status color comes from the glow/core). */
function createLeadIconImageData(size = 64) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = '#ffffff'

  const cx = size * 0.5
  const headR = size * 0.14

  // Head
  ctx.beginPath()
  ctx.arc(cx, size * 0.32, headR, 0, Math.PI * 2)
  ctx.fill()

  // Shoulders / torso
  ctx.beginPath()
  ctx.moveTo(size * 0.18, size * 0.78)
  ctx.quadraticCurveTo(cx, size * 0.52, size * 0.82, size * 0.78)
  ctx.lineTo(size * 0.82, size * 0.88)
  ctx.quadraticCurveTo(cx, size * 0.82, size * 0.18, size * 0.88)
  ctx.closePath()
  ctx.fill()

  return ctx.getImageData(0, 0, size, size)
}

function ensureLeadIcon(map) {
  if (!map || map.hasImage?.(ICON_ID)) return
  const imageData = createLeadIconImageData(64)
  if (!imageData) return
  try {
    map.addImage(ICON_ID, imageData, { pixelRatio: 2 })
  } catch {
    /* already added or map not ready */
  }
}

function heatmapPaintForColor(hex) {
  return {
    'heatmap-weight': ['get', 'weight'],
    'heatmap-intensity': [
      'interpolate', ['linear'], ['zoom'],
      1, 0.6,
      8, 1.1,
      HEATMAP_MAX_ZOOM, 1.4,
    ],
    'heatmap-radius': [
      'interpolate', ['linear'], ['zoom'],
      1, 12,
      8, 22,
      HEATMAP_MAX_ZOOM, 28,
    ],
    'heatmap-opacity': [
      'interpolate', ['linear'], ['zoom'],
      DOTS_MIN_ZOOM, 0.85,
      11, 0.45,
      HEATMAP_MAX_ZOOM, 0,
    ],
    'heatmap-color': [
      'interpolate', ['linear'], ['heatmap-density'],
      0, 'rgba(0,0,0,0)',
      0.15, hexToRgba(hex, 0.15),
      0.4, hexToRgba(hex, 0.45),
      0.7, hexToRgba(hex, 0.75),
      1, hex,
    ],
  }
}

/**
 * Always-on lead overlay: status heatmaps (zoomed out), glowing dots + lead icon,
 * click opens lead details.
 */
export function LeadMapLayer({
  mapRef,
  mapReady = false,
  leads = [],
  leadStatuses = null,
  dealCountByLead = null,
  onLeadClick,
}) {
  const onLeadClickRef = useRef(onLeadClick)
  useEffect(() => { onLeadClickRef.current = onLeadClick }, [onLeadClick])

  const geojson = useMemo(
    () => buildLeadMapGeoJSON(leads, { dealCountByLead, leadStatuses }),
    [leads, dealCountByLead, leadStatuses],
  )

  const statusColors = useMemo(() => distinctLeadMapColors(geojson), [geojson])

  useEffect(() => {
    if (!mapReady) return undefined
    const map = mapRef?.current
    if (!map) return undefined

    const register = () => ensureLeadIcon(map)
    register()
    map.on?.('style.load', register)
    map.on?.('load', register)
    return () => {
      map.off?.('style.load', register)
      map.off?.('load', register)
    }
  }, [mapRef, mapReady, geojson.features.length])

  useEffect(() => {
    if (!mapReady) return undefined
    const map = mapRef?.current
    if (!map) return undefined

    const interactiveIds = [GLOW_LAYER, CORE_LAYER, ICON_LAYER]

    const onClick = (e) => {
      const leadId = e.features?.[0]?.properties?.leadId
        || (map.queryRenderedFeatures?.(e.point, { layers: interactiveIds }) || [])[0]?.properties?.leadId
      if (!leadId) return
      e.originalEvent?.stopPropagation?.()
      e.preventDefault?.()
      onLeadClickRef.current?.(leadId)
    }

    const onEnter = () => {
      const canvas = map.getCanvas?.()
      if (canvas) canvas.style.cursor = 'pointer'
    }
    const onLeave = () => {
      const canvas = map.getCanvas?.()
      if (canvas) canvas.style.cursor = ''
    }

    // Wait until layers exist (Source/Layer mount after first paint).
    let attached = false
    const tryAttach = () => {
      try {
        if (!map.getLayer?.(CORE_LAYER)) return
      } catch {
        return
      }
      if (attached) return
      attached = true
      for (const layerId of interactiveIds) {
        map.on('click', layerId, onClick)
        map.on('mouseenter', layerId, onEnter)
        map.on('mouseleave', layerId, onLeave)
      }
    }

    tryAttach()
    map.on('idle', tryAttach)

    return () => {
      map.off('idle', tryAttach)
      if (attached) {
        for (const layerId of interactiveIds) {
          map.off('click', layerId, onClick)
          map.off('mouseenter', layerId, onEnter)
          map.off('mouseleave', layerId, onLeave)
        }
      }
      const canvas = map.getCanvas?.()
      if (canvas) canvas.style.cursor = ''
    }
  }, [mapRef, mapReady, statusColors.length])

  if (!geojson.features.length) return null

  return (
    <Source id={SOURCE_ID} type="geojson" data={geojson}>
      {statusColors.map((color) => {
        const key = colorLayerKey(color)
        return (
          <Layer
            key={`leads-heat-${key}`}
            id={`leads-heat-${key}`}
            type="heatmap"
            maxzoom={HEATMAP_MAX_ZOOM}
            filter={['==', ['get', 'color'], color]}
            paint={heatmapPaintForColor(color)}
          />
        )
      })}
      <Layer
        id={GLOW_LAYER}
        type="circle"
        minzoom={DOTS_MIN_ZOOM}
        paint={{
          'circle-color': ['get', 'color'],
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            DOTS_MIN_ZOOM, 10,
            15, 16,
            18, 20,
          ],
          'circle-blur': 0.85,
          'circle-opacity': [
            'interpolate', ['linear'], ['zoom'],
            DOTS_MIN_ZOOM, 0,
            11, 0.35,
            12, 0.55,
            15, 0.65,
          ],
        }}
      />
      <Layer
        id={CORE_LAYER}
        type="circle"
        minzoom={DOTS_MIN_ZOOM}
        paint={{
          'circle-color': ['get', 'color'],
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            DOTS_MIN_ZOOM, 4,
            15, 7,
            18, 9,
          ],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': [
            'interpolate', ['linear'], ['zoom'],
            DOTS_MIN_ZOOM, 0,
            11, 0.55,
            12, 0.9,
            15, 1,
          ],
          'circle-stroke-opacity': [
            'interpolate', ['linear'], ['zoom'],
            DOTS_MIN_ZOOM, 0,
            11, 0.4,
            12, 0.85,
            15, 1,
          ],
        }}
      />
      <Layer
        id={ICON_LAYER}
        type="symbol"
        minzoom={DOTS_MIN_ZOOM}
        layout={{
          'icon-image': ICON_ID,
          'icon-size': [
            'interpolate', ['linear'], ['zoom'],
            DOTS_MIN_ZOOM, 0.35,
            15, 0.45,
            18, 0.55,
          ],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'symbol-placement': 'point',
        }}
        paint={{
          'icon-opacity': [
            'interpolate', ['linear'], ['zoom'],
            DOTS_MIN_ZOOM, 0,
            11, 0.5,
            12, 0.9,
            15, 1,
          ],
        }}
      />
    </Source>
  )
}

export default LeadMapLayer
