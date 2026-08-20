import { useEffect, useRef, useCallback } from 'react'
import { mapProperties } from '@/utils/parcelPropertyMap'
import { parcelTileUrl } from '@/config/mapProviders'
import { computeOwnerOccupied } from '@/utils/ownerOccupied'
import {
  PARCEL_SOURCE_MIN_ZOOM,
  PARCEL_LAYER_MIN_ZOOM,
  PARCEL_TILE_MAXZOOM,
  PARCEL_SOURCE_ID as SOURCE_ID,
  PARCEL_SOURCE_LAYERS,
  PARCEL_FILL_LAYERS,
  PARCEL_LINE_LAYERS,
  PARCEL_LABEL_SOURCE as LABEL_SOURCE,
  PARCEL_LABEL_LAYER as LABEL_LAYER,
  parcelPromoteId,
  parcelPromoteIdMatches,
} from '@/config/parcelTiles'

// LandRecords is a sparse pyramid. Source minzoom is 14 so empty z15 tiles can
// keep a parent; layers themselves stay hidden until z15. maxzoom stays at a
// level that usually has data — above it MapLibre overzooms. Empty levels inside
// the range must error (API 410) so MapLibre keeps parents — see api/tiles.js.
//
// Tiles may use source-layer `parcel_us` OR `parcels` (Cedar Hill is mostly the
// latter). Paint and hit-test both.
const OO_ICON_YES_ID = 'parcel-owner-occupied'
const OO_ICON_NO_ID = 'parcel-absentee'
const OO_ICON_YES_COLOR = '#22c55e'
const OO_ICON_NO_COLOR = '#eab308'

/** Leading house number from situs; skips assessor placeholders like "0" / "00". */
function extractHouseNumber(addr) {
  if (!addr) return ''
  const trimmed = String(addr).trim()
  if (!trimmed) return ''
  const match = trimmed.match(/^(\d{1,5}[A-Za-z]?)\b/)
  if (!match) return ''
  const num = match[1]
  const digits = num.replace(/[A-Za-z]/g, '')
  if (!digits || /^0+$/.test(digits)) return ''
  return num
}

const MAX_LABEL_FEATURES = 500

function buildLabelGeoJSON(features) {
  const seen = new Set()
  const pts = []
  for (const f of features) {
    if (pts.length >= MAX_LABEL_FEATURES) break
    const p = f.properties || {}
    const id = p.lrid || p.parcelid
    if (!id || seen.has(id)) continue
    const cx = Number(p.centroidx)
    const cy = Number(p.centroidy)
    if (!cx || !cy || isNaN(cx) || isNaN(cy)) continue
    const num = extractHouseNumber(p.parceladdr)
    if (!num) continue
    seen.add(id)
    // Only color OO when we also emit a house number (same feature / gate).
    // 1 = Yes, 0 = No, -1 = unknown (no home icon).
    const ooStatus = computeOwnerOccupied(mapProperties(p))
    const oo = ooStatus === 'Yes' ? 1 : ooStatus === 'No' ? 0 : -1
    pts.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [cx, cy] },
      properties: { _label: num, _oo: oo },
    })
  }
  return { type: 'FeatureCollection', features: pts }
}

function labelGeoJSONKey(geo) {
  const feats = geo.features
  if (!feats.length) return 'empty'
  const first = feats[0]
  const last = feats[feats.length - 1]
  return [
    feats.length,
    first.properties?._label,
    last.properties?._label,
    first.properties?._oo,
    last.properties?._oo,
    first.geometry?.coordinates?.[0],
    first.geometry?.coordinates?.[1],
    last.geometry?.coordinates?.[0],
  ].join('|')
}

/** Shared layout for house-number labels with ownership home glyph (green / yellow). */
function parcelLabelLayerLayout() {
  return {
    'text-field': ['get', '_label'],
    'text-font': ['Open Sans Semibold'],
    'text-size': ['interpolate', ['linear'], ['zoom'], 17, 10, 20, 14],
    // Right-anchor when an OO icon is shown; center when occupancy is unknown.
    'text-anchor': [
      'case',
      ['==', ['get', '_oo'], -1],
      'center',
      'right',
    ],
    'text-offset': [
      'case',
      ['==', ['get', '_oo'], -1],
      ['literal', [0, 0]],
      ['literal', [-0.15, 0]],
    ],
    'text-allow-overlap': false,
    'text-ignore-placement': false,
    'text-padding': 2,
    'icon-image': [
      'case',
      ['==', ['get', '_oo'], 1],
      OO_ICON_YES_ID,
      ['==', ['get', '_oo'], 0],
      OO_ICON_NO_ID,
      '',
    ],
    'icon-size': ['interpolate', ['linear'], ['zoom'], 17, 0.45, 20, 0.7],
    'icon-anchor': 'left',
    'icon-offset': [2, 0],
    'icon-allow-overlap': false,
    'icon-ignore-placement': false,
    'icon-padding': 2,
    'symbol-placement': 'point',
  }
}

function parcelLabelLayerPaint() {
  return {
    'text-color': '#ffffff',
    'text-halo-color': 'rgba(0,0,0,0.8)',
    'text-halo-width': 1.5,
  }
}

/** Home glyph for parcel labels — green when owner-occupied, yellow when not. */
function createHomeIconImageData(size = 64, fillColor = OO_ICON_YES_COLOR) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.clearRect(0, 0, size, size)

  const pad = size * 0.12
  const roofPeakX = size * 0.5
  const roofPeakY = pad
  const roofLeftX = pad
  const roofRightX = size - pad
  const roofBaseY = size * 0.42
  const bodyLeft = size * 0.22
  const bodyRight = size * 0.78
  const bodyTop = size * 0.38
  const bodyBottom = size * 0.88
  const doorW = size * 0.16
  const doorH = size * 0.28
  const doorLeft = roofPeakX - doorW / 2
  const doorTop = bodyBottom - doorH

  // Dark halo / outline
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.beginPath()
  ctx.moveTo(roofPeakX, roofPeakY - 1)
  ctx.lineTo(roofRightX + 1, roofBaseY + 1)
  ctx.lineTo(bodyRight + 1, roofBaseY + 1)
  ctx.lineTo(bodyRight + 1, bodyBottom + 1)
  ctx.lineTo(bodyLeft - 1, bodyBottom + 1)
  ctx.lineTo(bodyLeft - 1, roofBaseY + 1)
  ctx.lineTo(roofLeftX - 1, roofBaseY + 1)
  ctx.closePath()
  ctx.fill()

  // Roof + body
  ctx.fillStyle = fillColor
  ctx.beginPath()
  ctx.moveTo(roofPeakX, roofPeakY)
  ctx.lineTo(roofRightX, roofBaseY)
  ctx.lineTo(roofLeftX, roofBaseY)
  ctx.closePath()
  ctx.fill()
  ctx.fillRect(bodyLeft, bodyTop, bodyRight - bodyLeft, bodyBottom - bodyTop)

  // Door
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.fillRect(doorLeft, doorTop, doorW, doorH)

  return ctx.getImageData(0, 0, size, size)
}

function ensureOwnershipIcons(map) {
  if (!map) return
  const icons = [
    [OO_ICON_YES_ID, OO_ICON_YES_COLOR],
    [OO_ICON_NO_ID, OO_ICON_NO_COLOR],
  ]
  for (const [id, color] of icons) {
    if (map.hasImage?.(id)) continue
    const imageData = createHomeIconImageData(64, color)
    if (!imageData) continue
    try {
      map.addImage(id, imageData, { pixelRatio: 2 })
    } catch {
      /* already added or map not ready */
    }
  }
}

const LIST_HIGHLIGHT_COLORS = [
  '#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ef4444',
  '#14b8a6', '#ec4899', '#6366f1', '#f59e0b', '#84cc16',
  '#06b6d4', '#f43f5e', '#8b5cf6', '#10b981', '#0ea5e9',
  '#d946ef', '#ea580c', '#2563eb', '#16a34a', '#db2777',
]

/** Smallest bbox area first — when polygons overlap at a tap, MapLibre returns arbitrary order; pick the smallest footprint. */
function approxBBoxArea(geometry) {
  if (!geometry?.coordinates) return Infinity
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const scan = (coords) => {
    if (typeof coords[0] === 'number') {
      const x = coords[0]
      const y = coords[1]
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    } else {
      for (const c of coords) scan(c)
    }
  }
  scan(geometry.coordinates)
  if (minX === Infinity) return Infinity
  const w = maxX - minX
  const h = maxY - minY
  return w * h
}

function pickBestFeature(features) {
  if (!features?.length) return null
  if (features.length === 1) return features[0]
  return [...features].sort((a, b) => approxBBoxArea(a.geometry) - approxBBoxArea(b.geometry))[0]
}

function pidMatch(pid) {
  const id = String(pid)
  return ['any',
    ['==', ['to-string', ['get', 'parcelid']], id],
    ['==', ['to-string', ['get', 'lrid']], id],
    ['==', ['to-string', ['get', 'parcelid2']], id],
  ]
}

/** promoteId uses lrid — setFeatureState id must match, not PROP_ID. */
function featureStateIdFromRaw(raw, parcelId) {
  return raw?.lrid || raw?.parcelid || parcelId
}

function setParcelFeatureState(map, featureId, state) {
  if (!map || !featureId) return
  for (const sourceLayer of PARCEL_SOURCE_LAYERS) {
    try {
      map.setFeatureState(
        { source: SOURCE_ID, sourceLayer, id: featureId },
        state,
      )
    } catch { /* feature not in this source-layer / tile */ }
  }
}

function queryFeatureStateIdForParcelId(map, parcelId) {
  if (!map || !parcelId) return null
  try {
    for (const sourceLayer of PARCEL_SOURCE_LAYERS) {
      const features = map.querySourceFeatures(SOURCE_ID, {
        sourceLayer,
        filter: pidMatch(parcelId),
      })
      if (!features.length) continue
      const raw = features[0].properties || {}
      return featureStateIdFromRaw(raw, parcelId)
    }
    return null
  } catch {
    return null
  }
}

function hasParcelFillLayer(map) {
  try {
    return PARCEL_FILL_LAYERS.some((id) => map.getLayer(id))
  } catch {
    return false
  }
}

function removeParcelStyle(map) {
  for (const id of [LABEL_LAYER, ...PARCEL_LINE_LAYERS, ...PARCEL_FILL_LAYERS]) {
    try {
      if (map.getLayer(id)) map.removeLayer(id)
    } catch { /* ignore */ }
  }
  try {
    if (map.getSource(LABEL_SOURCE)) map.removeSource(LABEL_SOURCE)
  } catch { /* ignore */ }
  try {
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
  } catch { /* ignore */ }
}

function addParcelPaintLayers(map, { color, opacity }) {
  for (let i = 0; i < PARCEL_SOURCE_LAYERS.length; i++) {
    const sourceLayer = PARCEL_SOURCE_LAYERS[i]
    const fillId = PARCEL_FILL_LAYERS[i]
    const lineId = PARCEL_LINE_LAYERS[i]
    if (!map.getLayer(fillId)) {
      map.addLayer({
        id: fillId,
        type: 'fill',
        source: SOURCE_ID,
        'source-layer': sourceLayer,
        minzoom: PARCEL_LAYER_MIN_ZOOM,
        paint: { 'fill-color': 'transparent', 'fill-opacity': 0.3 },
      })
    }
    if (!map.getLayer(lineId)) {
      map.addLayer({
        id: lineId,
        type: 'line',
        source: SOURCE_ID,
        'source-layer': sourceLayer,
        minzoom: PARCEL_LAYER_MIN_ZOOM,
        paint: { 'line-color': color, 'line-width': 2, 'line-opacity': opacity / 100 },
      })
    }
  }
}

// Multi-select uses feature-state ('selected') so toggling a selection doesn't
// trigger bucket re-tessellation in the worker. Clicked highlight also uses
// feature-state so it survives tile reloads after recenter animations.
const FS_SELECTED = ['boolean', ['feature-state', 'selected'], false]
const FS_CLICKED = ['boolean', ['feature-state', 'clicked'], false]
const FS_HAS_LEAD = ['boolean', ['feature-state', 'hasLead'], false]
const FS_LEAD_COLOR = ['to-color', ['feature-state', 'leadColor']]

function buildColorExpression(clickedParcelId, parcelIdToColorIndex, baseColor = '#2563eb') {
  const cases = []
  cases.push(FS_SELECTED, '#059669')
  cases.push(FS_CLICKED, baseColor)
  if (clickedParcelId) {
    cases.push(pidMatch(clickedParcelId), baseColor)
  }
  for (const [pid, idx] of parcelIdToColorIndex) {
    cases.push(pidMatch(pid), LIST_HIGHLIGHT_COLORS[idx] || LIST_HIGHLIGHT_COLORS[0])
  }
  cases.push(FS_HAS_LEAD, FS_LEAD_COLOR)
  return ['case', ...cases, baseColor]
}

function buildFillColorExpression(clickedParcelId, parcelIdToColorIndex, baseColor = '#2563eb') {
  const cases = []
  cases.push(FS_SELECTED, '#10b981')
  cases.push(FS_CLICKED, baseColor)
  if (clickedParcelId) {
    cases.push(pidMatch(clickedParcelId), baseColor)
  }
  for (const [pid, idx] of parcelIdToColorIndex) {
    const c = LIST_HIGHLIGHT_COLORS[idx] || LIST_HIGHLIGHT_COLORS[0]
    cases.push(pidMatch(pid), c)
  }
  cases.push(FS_HAS_LEAD, FS_LEAD_COLOR)
  return ['case', ...cases, 'transparent']
}

function buildWidthExpression(clickedParcelId, parcelIdToColorIndex) {
  const cases = []
  cases.push(FS_SELECTED, 3)
  cases.push(FS_CLICKED, 3)
  if (clickedParcelId) cases.push(pidMatch(clickedParcelId), 3)
  for (const [pid] of parcelIdToColorIndex) cases.push(pidMatch(pid), 3)
  cases.push(FS_HAS_LEAD, 2.5)
  return ['case', ...cases, 2]
}

function buildFillOpacityExpression(clickedParcelId, parcelIdToColorIndex) {
  const cases = []
  cases.push(FS_SELECTED, 0.5)
  cases.push(FS_CLICKED, 0.5)
  if (clickedParcelId) cases.push(pidMatch(clickedParcelId), 0.5)
  for (const [pid] of parcelIdToColorIndex) cases.push(pidMatch(pid), 0.5)
  cases.push(FS_HAS_LEAD, 0.4)
  return ['case', ...cases, 0.3]
}

export function PMTilesParcelLayer({
  mapRef,
  mapReady,
  onParcelClick,
  clickedParcelId,
  selectedParcels,
  /** When true, do not apply single-parcel "clicked" highlight in the layer (parent drives selection only). */
  isMultiSelectActive = false,
  selectedListIds = [],
  lists = [],
  /** Map or record of parcelId → status hex for lead-connected parcels. */
  leadParcelColors = null,
  boundaryColor = '#2563eb',
  boundaryOpacity = 80,
  onLayerReady,
}) {
  const onParcelClickRef = useRef(onParcelClick)
  useEffect(() => { onParcelClickRef.current = onParcelClick }, [onParcelClick])
  const isMultiSelectRef = useRef(isMultiSelectActive)
  isMultiSelectRef.current = isMultiSelectActive

  const colorRef = useRef(boundaryColor || '#2563eb')
  const opacityRef = useRef(boundaryOpacity ?? 80)
  const clickedRef = useRef(clickedParcelId)
  const selectedRef = useRef(selectedParcels)
  const colorIndexRef = useRef(new Map())
  const layersAddedRef = useRef(false)
  const repaintScheduledRef = useRef(false)
  // Tracks promoteId (lrid) values with selected=true feature-state.
  const featureStateIdsRef = useRef(new Set())
  /** PROP_ID → promoteId for reconciling React selection with feature-state. */
  const parcelIdToFeatureStateIdRef = useRef(new Map())
  /** promoteId target (lrid) for clicked feature-state — survives tile reloads */
  const clickedFeatureIdRef = useRef(null)
  /** promoteId → status hex currently applied via feature-state */
  const leadFeatureStateRef = useRef(new Map())
  const leadParcelColorsRef = useRef(null)

  colorRef.current = boundaryColor || '#2563eb'
  opacityRef.current = boundaryOpacity ?? 80
  selectedRef.current = selectedParcels
  leadParcelColorsRef.current = leadParcelColors instanceof Map
    ? leadParcelColors
    : (leadParcelColors && typeof leadParcelColors === 'object'
      ? new Map(Object.entries(leadParcelColors))
      : null)

  const setClickedFeatureState = useCallback((map, featureId, clicked) => {
    setParcelFeatureState(map, featureId, { clicked: !!clicked })
  }, [])

  const applyClickedHighlight = useCallback((featureId, paintId = featureId) => {
    const map = mapRef?.current
    if (!featureId) return
    if (map && clickedFeatureIdRef.current && clickedFeatureIdRef.current !== featureId) {
      setClickedFeatureState(map, clickedFeatureIdRef.current, false)
    }
    clickedFeatureIdRef.current = featureId
    clickedRef.current = paintId || featureId
    if (map) setClickedFeatureState(map, featureId, true)
    repaint()
  }, [mapRef, setClickedFeatureState])

  const clearClickedHighlight = useCallback(() => {
    const map = mapRef?.current
    if (map && clickedFeatureIdRef.current) {
      setClickedFeatureState(map, clickedFeatureIdRef.current, false)
    }
    clickedFeatureIdRef.current = null
    clickedRef.current = null
    repaint()
  }, [mapRef, setClickedFeatureState])

  const reapplyClickedHighlight = useCallback(() => {
    const map = mapRef?.current
    if (!map || !clickedFeatureIdRef.current) {
      repaint()
      return
    }
    setClickedFeatureState(map, clickedFeatureIdRef.current, true)
    repaint()
  }, [mapRef, setClickedFeatureState])

  const applyClickedHighlightRef = useRef(applyClickedHighlight)
  applyClickedHighlightRef.current = applyClickedHighlight
  const reapplyClickedHighlightRef = useRef(reapplyClickedHighlight)
  reapplyClickedHighlightRef.current = reapplyClickedHighlight

  useEffect(() => {
    const next = new Map()
    selectedListIds.slice(0, 20).forEach((listId, colorIndex) => {
      const list = lists?.find(l => l.id === listId)
      if (list?.parcels) {
        list.parcels.forEach(p => {
          const pid = p.id || p
          if (!next.has(pid)) next.set(pid, colorIndex)
        })
      }
    })
    colorIndexRef.current = next
    repaint()
  }, [selectedListIds, lists])

  function repaintNow() {
    const map = mapRef?.current
    if (!map || !layersAddedRef.current) return
    if (!hasParcelFillLayer(map)) return
    const color = colorRef.current
    const clicked = clickedRef.current
    const idxMap = colorIndexRef.current
    try {
      for (const fillId of PARCEL_FILL_LAYERS) {
        if (!map.getLayer(fillId)) continue
        map.setPaintProperty(fillId, 'fill-color',
          buildFillColorExpression(clicked, idxMap, color))
        map.setPaintProperty(fillId, 'fill-opacity',
          buildFillOpacityExpression(clicked, idxMap))
      }
      for (const lineId of PARCEL_LINE_LAYERS) {
        if (!map.getLayer(lineId)) continue
        map.setPaintProperty(lineId, 'line-color',
          buildColorExpression(clicked, idxMap, color))
        map.setPaintProperty(lineId, 'line-width',
          buildWidthExpression(clicked, idxMap))
        map.setPaintProperty(lineId, 'line-opacity',
          (opacityRef.current ?? 80) / 100)
      }
      map.triggerRepaint()
    } catch { /* ignore if layers not ready */ }
  }

  function repaint() {
    if (repaintScheduledRef.current) return
    repaintScheduledRef.current = true
    requestAnimationFrame(() => {
      repaintScheduledRef.current = false
      repaintNow()
    })
  }

  // Repaint + sync clicked feature-state when parent parcel id changes.
  useEffect(() => {
    if (!clickedParcelId) {
      clearClickedHighlight()
      return
    }
    clickedRef.current = clickedParcelId
    if (!clickedFeatureIdRef.current) {
      applyClickedHighlight(clickedParcelId, clickedParcelId)
    } else {
      repaint()
    }
  }, [boundaryColor, boundaryOpacity, clickedParcelId, applyClickedHighlight, clearClickedHighlight])

  const setSelectedFeatureState = useCallback((map, featureStateId, selected) => {
    setParcelFeatureState(map, featureStateId, { selected: !!selected })
  }, [])

  const setSelectedFeatureStateRef = useRef(setSelectedFeatureState)
  setSelectedFeatureStateRef.current = setSelectedFeatureState

  const reapplySelectedFeatureStates = useCallback(() => {
    const map = mapRef?.current
    if (!map || !featureStateIdsRef.current.size) return
    for (const featureStateId of featureStateIdsRef.current) {
      setSelectedFeatureState(map, featureStateId, true)
    }
  }, [mapRef, setSelectedFeatureState])

  const reapplySelectedFeatureStatesRef = useRef(reapplySelectedFeatureStates)
  reapplySelectedFeatureStatesRef.current = reapplySelectedFeatureStates

  const syncLeadFeatureStates = useCallback(() => {
    const map = mapRef?.current
    if (!map || !layersAddedRef.current) return
    if (!hasParcelFillLayer(map)) return

    const leadColors = leadParcelColorsRef.current
    const prev = leadFeatureStateRef.current
    const next = new Map()

    if (leadColors?.size) {
      let features = []
      try {
        features = map.queryRenderedFeatures({ layers: PARCEL_FILL_LAYERS }) || []
      } catch {
        features = []
      }
      for (const feature of features) {
        const raw = feature.properties || {}
        const candidates = [raw.parcelid, raw.lrid, raw.parcelid2]
          .filter((id) => id != null && id !== '')
          .map((id) => String(id))
        let color = null
        for (const id of candidates) {
          if (leadColors.has(id)) {
            color = leadColors.get(id)
            break
          }
        }
        if (!color) continue
        const featureStateId = featureStateIdFromRaw(raw, candidates[0])
        if (!featureStateId) continue
        next.set(featureStateId, color)
      }
    }

    for (const [featureStateId] of prev) {
      if (next.has(featureStateId)) continue
      setParcelFeatureState(map, featureStateId, { hasLead: false, leadColor: undefined })
    }

    for (const [featureStateId, color] of next) {
      if (prev.get(featureStateId) === color) continue
      setParcelFeatureState(map, featureStateId, { hasLead: true, leadColor: color })
    }

    leadFeatureStateRef.current = next
  }, [mapRef])

  const syncLeadFeatureStatesRef = useRef(syncLeadFeatureStates)
  syncLeadFeatureStatesRef.current = syncLeadFeatureStates

  // Re-sync lead parcel fills when the color map changes.
  useEffect(() => {
    syncLeadFeatureStates()
  }, [leadParcelColors, syncLeadFeatureStates, mapReady])

  // Reconcile feature-state with selectedParcels prop. This handles external
  // selection changes (list operations, etc.) and keeps the optimistic
  // click-handler updates aligned with the authoritative React state.
  useEffect(() => {
    const map = mapRef?.current
    if (!map || !layersAddedRef.current) return
    const current = featureStateIdsRef.current
    const parcelToFeatureState = parcelIdToFeatureStateIdRef.current
    const nextFeatureStateIds = new Set()

    for (const parcelId of selectedParcels || []) {
      let featureStateId = parcelToFeatureState.get(parcelId)
      if (!featureStateId) {
        featureStateId = queryFeatureStateIdForParcelId(map, parcelId)
        if (featureStateId) parcelToFeatureState.set(parcelId, featureStateId)
      }
      if (featureStateId) nextFeatureStateIds.add(featureStateId)
    }

    for (const parcelId of parcelToFeatureState.keys()) {
      if (!selectedParcels?.has(parcelId)) parcelToFeatureState.delete(parcelId)
    }

    for (const featureStateId of current) {
      if (!nextFeatureStateIds.has(featureStateId)) {
        setSelectedFeatureState(map, featureStateId, false)
      }
    }
    for (const featureStateId of nextFeatureStateIds) {
      if (!current.has(featureStateId)) {
        setSelectedFeatureState(map, featureStateId, true)
      }
    }
    featureStateIdsRef.current = nextFeatureStateIds
  }, [selectedParcels, mapRef, setSelectedFeatureState])

  // Add source + layers fully imperatively
  useEffect(() => {
    const map = mapRef?.current
    if (!map || !mapReady) return
    let cancelled = false
    let labelUpdateTimer = null
    let lastLabelKey = ''
    let lastLabelRefreshAt = 0
    let idleLabelHandler = null
    const LABEL_DEBOUNCE_MS = 200
    const LABEL_MIN_INTERVAL_MS = 400

    const tileUrl = parcelTileUrl()
    const emptyGeoJSON = { type: 'FeatureCollection', features: [] }

    function refreshViewportOverlays() {
      if (cancelled) return
      if (labelUpdateTimer) clearTimeout(labelUpdateTimer)
      labelUpdateTimer = setTimeout(() => {
        if (cancelled) return
        const now = Date.now()
        if (now - lastLabelRefreshAt < LABEL_MIN_INTERVAL_MS) return
        try {
          const zoom = map.getZoom()
          const labelSrc = map.getSource(LABEL_SOURCE)
          if (!labelSrc) return
          if (zoom < 17) {
            if (lastLabelKey !== 'empty') {
              labelSrc.setData(emptyGeoJSON)
              lastLabelKey = 'empty'
            }
            lastLabelRefreshAt = now
            return
          }
          const features = map.queryRenderedFeatures({ layers: PARCEL_FILL_LAYERS })
          const geo = buildLabelGeoJSON(features)
          const key = labelGeoJSONKey(geo)
          if (key !== lastLabelKey) {
            lastLabelKey = key
            labelSrc.setData(geo)
          }
          lastLabelRefreshAt = now
        } catch { /* ignore */ }
      }, LABEL_DEBOUNCE_MS)
    }

    // Keep prior name as alias — move/zoom/idle handlers still call this.
    const refreshLabels = refreshViewportOverlays

    function scheduleLabelRefreshAfterMove() {
      refreshLabels()
      reapplyClickedHighlightRef.current?.()
      reapplySelectedFeatureStatesRef.current?.()
      syncLeadFeatureStatesRef.current?.()
      if (idleLabelHandler) return
      idleLabelHandler = () => {
        idleLabelHandler = null
        refreshLabels()
        syncLeadFeatureStatesRef.current?.()
      }
      map.once('idle', idleLabelHandler)
    }

    function ensureLayers() {
      if (cancelled || layersAddedRef.current) return
      try {
        // promoteId tells MapLibre to use the 'lrid' property as feature.id,
        // which is required for setFeatureState({source, sourceLayer, id}, ...).
        // Recreate if a previous mount only promoted parcel_us (Cedar Hill uses `parcels`).
        const expectedPromoteId = parcelPromoteId()
        const styleSrc = map.getStyle()?.sources?.[SOURCE_ID]
        if (styleSrc && !parcelPromoteIdMatches(styleSrc.promoteId)) {
          removeParcelStyle(map)
        }
        if (!map.getSource(SOURCE_ID)) {
          map.addSource(SOURCE_ID, {
            type: 'vector',
            tiles: [tileUrl],
            minzoom: PARCEL_SOURCE_MIN_ZOOM,
            maxzoom: PARCEL_TILE_MAXZOOM,
            promoteId: expectedPromoteId,
          })
        }
        addParcelPaintLayers(map, {
          color: colorRef.current,
          opacity: opacityRef.current ?? 80,
        })
        ensureOwnershipIcons(map)
        if (!map.getSource(LABEL_SOURCE)) {
          map.addSource(LABEL_SOURCE, { type: 'geojson', data: emptyGeoJSON })
        }
        if (!map.getLayer(LABEL_LAYER)) {
          map.addLayer({
            id: LABEL_LAYER,
            type: 'symbol',
            source: LABEL_SOURCE,
            minzoom: 17,
            layout: parcelLabelLayerLayout(),
            paint: parcelLabelLayerPaint(),
          })
        }
        layersAddedRef.current = true
        repaint()
        refreshLabels()
        syncLeadFeatureStatesRef.current?.()
      } catch {
        layersAddedRef.current = false
        map.once('idle', ensureLayers)
      }
    }

    ensureLayers()
    if (!layersAddedRef.current) {
      map.once('idle', ensureLayers)
    }

    const registerOoIcon = () => ensureOwnershipIcons(map)
    registerOoIcon()
    map.on('style.load', registerOoIcon)
    map.on('load', registerOoIcon)

    const onStyleData = () => {
      const styleSrc = map.getStyle()?.sources?.[SOURCE_ID]
      if (!styleSrc || !parcelPromoteIdMatches(styleSrc.promoteId)) {
        layersAddedRef.current = false
        ensureLayers()
        return
      }
      addParcelPaintLayers(map, {
        color: colorRef.current,
        opacity: opacityRef.current ?? 80,
      })
      ensureOwnershipIcons(map)
    }
    map.on('styledata', onStyleData)

    // Refresh labels when the viewport settles — not on every parcel tile load.
    // Nationwide panning loads hundreds of vector tiles; per-tile label rebuilds
    // were pegging CPU/memory and could freeze the tab.
    map.on('moveend', scheduleLabelRefreshAfterMove)
    map.on('zoomend', scheduleLabelRefreshAfterMove)

    const onClick = (e) => {
      // Lead markers sit above parcels; prefer lead click over parcel popup.
      try {
        const leadHits = map.queryRenderedFeatures(e.point, {
          layers: ['leads-map-glow', 'leads-map-core', 'leads-map-icon'],
        })
        if (leadHits?.length) return
      } catch { /* lead layers may not exist */ }
      const features = e.features?.length ? e.features : (() => {
        try { return map.queryRenderedFeatures(e.point, { layers: PARCEL_FILL_LAYERS }) } catch { return [] }
      })()
      if (!features?.length || !onParcelClickRef.current) return
      const feature = pickBestFeature(features)
      if (!feature) return
      const raw = feature.properties || {}
      const properties = mapProperties(raw)
      const parcelId = properties.PROP_ID
      if (!parcelId) return
      const featureStateId = featureStateIdFromRaw(raw, parcelId)
      if (isMultiSelectRef.current) {
        // Optimistically toggle via setFeatureState. This is bucket-free (no
        // worker re-tessellation) so the canvas updates on the very next frame.
        // The parent's setSelectedParcels reconciles via the diff effect above.
        const next = new Set(selectedRef.current || [])
        const willSelect = !next.has(parcelId)
        if (willSelect) next.add(parcelId); else next.delete(parcelId)
        selectedRef.current = next
        parcelIdToFeatureStateIdRef.current.set(parcelId, featureStateId)
        setSelectedFeatureStateRef.current(map, featureStateId, willSelect)
        if (willSelect) featureStateIdsRef.current.add(featureStateId)
        else featureStateIdsRef.current.delete(featureStateId)
      } else {
        applyClickedHighlightRef.current?.(featureStateId, parcelId)
      }
      onParcelClickRef.current({
        latlng: { lat: e.lngLat.lat, lng: e.lngLat.lng },
        properties,
        geometry: feature.geometry,
        parcelId,
        lrid: raw.lrid || '',
      })
    }

    const onEnter = () => { map.getCanvas().style.cursor = 'pointer' }
    const onLeave = () => { map.getCanvas().style.cursor = '' }

    for (const fillId of PARCEL_FILL_LAYERS) {
      map.on('click', fillId, onClick)
      map.on('mouseenter', fillId, onEnter)
      map.on('mouseleave', fillId, onLeave)
    }

    return () => {
      cancelled = true
      if (labelUpdateTimer) clearTimeout(labelUpdateTimer)
      map.off('moveend', scheduleLabelRefreshAfterMove)
      map.off('zoomend', scheduleLabelRefreshAfterMove)
      if (idleLabelHandler) {
        map.off('idle', idleLabelHandler)
        idleLabelHandler = null
      }
      for (const fillId of PARCEL_FILL_LAYERS) {
        map.off('click', fillId, onClick)
        map.off('mouseenter', fillId, onEnter)
        map.off('mouseleave', fillId, onLeave)
      }
      map.off('styledata', onStyleData)
      map.off('style.load', registerOoIcon)
      map.off('load', registerOoIcon)
      try {
        removeParcelStyle(map)
      } catch { /* ignore */ }
      layersAddedRef.current = false
    }
  }, [mapRef, mapReady])


  const queryParcelFeatureAtLocation = useCallback((lat, lng, { pixelRadius = 0 } = {}) => {
    const map = mapRef?.current
    if (!map) return null
    try {
      if (!hasParcelFillLayer(map)) return null
      const point = map.project([lng, lat])
      const radius = Number(pixelRadius) > 0 ? Number(pixelRadius) : 0
      // Exact point first; optional box covers GPS jitter so the blue-dot
      // location still hits the parcel under the marker.
      let features = map.queryRenderedFeatures(point, { layers: PARCEL_FILL_LAYERS })
      if (!features.length && radius > 0) {
        features = map.queryRenderedFeatures(
          [
            [point.x - radius, point.y - radius],
            [point.x + radius, point.y + radius],
          ],
          { layers: PARCEL_FILL_LAYERS },
        )
      }
      if (!features.length) return null
      const feature = pickBestFeature(features)
      if (!feature) return null
      const raw = feature.properties || {}
      const properties = mapProperties(raw)
      const parcelId = properties.PROP_ID
      if (!parcelId) return null
      return {
        id: parcelId,
        properties,
        lat,
        lng,
        lrid: raw.lrid || raw.parcelid || '',
        geometry: feature.geometry,
      }
    } catch {
      return null
    }
  }, [mapRef])

  const findParcelAtLocation = useCallback((lat, lng) => {
    const map = mapRef?.current
    if (!map || !onParcelClickRef.current) return false

    const tryQuery = () => {
      const hit = queryParcelFeatureAtLocation(lat, lng)
      if (!hit || !onParcelClickRef.current) return false
      onParcelClickRef.current({
        latlng: { lat, lng },
        properties: hit.properties,
        geometry: hit.geometry,
        parcelId: hit.id,
        lrid: hit.lrid,
      })
      return true
    }

    if (tryQuery()) return true
    map.once('idle', tryQuery)
    return false
  }, [mapRef, queryParcelFeatureAtLocation])

  const setBoundaryColor = useCallback((color) => {
    colorRef.current = color
    repaint()
  }, [mapRef])

  const setBoundaryOpacity = useCallback((opacity) => {
    opacityRef.current = opacity
    const map = mapRef?.current
    if (!map) return
    for (const lineId of PARCEL_LINE_LAYERS) {
      if (map.getLayer(lineId)) {
        map.setPaintProperty(lineId, 'line-opacity', opacity / 100)
      }
    }
  }, [mapRef])

  const reload = useCallback(() => {
    const map = mapRef?.current
    if (!map) return
    try {
      removeParcelStyle(map)
      layersAddedRef.current = false
      const tileUrl = parcelTileUrl()
      const emptyGeoJSON = { type: 'FeatureCollection', features: [] }
      map.addSource(SOURCE_ID, {
        type: 'vector',
        tiles: [tileUrl],
        minzoom: PARCEL_SOURCE_MIN_ZOOM,
        maxzoom: PARCEL_TILE_MAXZOOM,
        promoteId: parcelPromoteId(),
      })
      addParcelPaintLayers(map, {
        color: colorRef.current,
        opacity: opacityRef.current ?? 80,
      })
      ensureOwnershipIcons(map)
      map.addSource(LABEL_SOURCE, { type: 'geojson', data: emptyGeoJSON })
      map.addLayer({
        id: LABEL_LAYER,
        type: 'symbol',
        source: LABEL_SOURCE,
        minzoom: 17,
        layout: parcelLabelLayerLayout(),
        paint: parcelLabelLayerPaint(),
      })
      layersAddedRef.current = true
      repaint()
    } catch { /* ignore if style not ready */ }
  }, [mapRef])

  useEffect(() => {
    if (!onLayerReady) return
    onLayerReady({
      findParcelAtLocation,
      queryParcelFeatureAtLocation,
      setBoundaryColor,
      setBoundaryOpacity,
      repaint,
      reload,
      applyClickedHighlight,
      clearClickedHighlight,
      reapplyClickedHighlight,
    })
  }, [
    onLayerReady,
    findParcelAtLocation,
    queryParcelFeatureAtLocation,
    setBoundaryColor,
    setBoundaryOpacity,
    reload,
    applyClickedHighlight,
    clearClickedHighlight,
    reapplyClickedHighlight,
  ])

  return null
}
