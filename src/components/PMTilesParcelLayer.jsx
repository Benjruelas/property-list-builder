import { useEffect, useRef, useCallback } from 'react'

const PARCEL_MIN_ZOOM = 15
const PARCEL_TILE_MAXZOOM = 16
const SOURCE_LAYER = 'parcel_us'
const SOURCE_ID = 'parcels'
const FILL_LAYER = 'parcels-fill'
const LINE_LAYER = 'parcels-line'
const LABEL_SOURCE = 'parcels-label-pts'
const LABEL_LAYER = 'parcels-label'

function extractHouseNumber(addr) {
  if (!addr) return ''
  const idx = addr.indexOf(' ')
  return idx > 0 ? addr.slice(0, idx) : ''
}

function buildLabelGeoJSON(features) {
  const seen = new Set()
  const pts = []
  for (const f of features) {
    const p = f.properties
    const id = p.lrid || p.parcelid
    if (!id || seen.has(id)) continue
    const cx = Number(p.centroidx)
    const cy = Number(p.centroidy)
    if (!cx || !cy || isNaN(cx) || isNaN(cy)) continue
    const num = extractHouseNumber(p.parceladdr)
    if (!num) continue
    seen.add(id)
    pts.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [cx, cy] }, properties: { _label: num } })
  }
  return { type: 'FeatureCollection', features: pts }
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

/** Single canonical id for app state + paint (must match pidMatch in expressions). */
function canonicalParcelId(raw) {
  const id = raw?.parcelid ?? raw?.lrid
  return id != null && id !== '' ? String(id).trim() : ''
}

function splitCityState(ownercity, ownerstate) {
  if (ownerstate) return { city: ownercity || '', state: ownerstate }
  if (!ownercity) return { city: '', state: '' }
  const parts = ownercity.trim().split(/\s+/)
  if (parts.length >= 2) {
    const last = parts[parts.length - 1]
    if (last.length === 2 || last.length <= 8) {
      return { city: parts.slice(0, -1).join(' '), state: last }
    }
  }
  return { city: ownercity, state: '' }
}

function mapProperties(raw) {
  const { city: mailCity, state: mailState } = splitCityState(raw.ownercity, raw.ownerstate)

  return {
    PROP_ID:        canonicalParcelId(raw) || '',
    PARCEL_ID_ALT:  raw.parcelid2  || '',
    SITUS_ADDR:     raw.parceladdr || '',
    // Prefer Census Designated Place (placename) over assessor's parcelcity:
    // in split-ZIP / ETJ areas the assessor field often reports the taxing
    // jurisdiction (e.g. "Fort Worth" for a 76028 parcel that everyone —
    // USPS, Mapbox, and residents — calls Burleson). cousubname (Census
    // county subdivision, e.g. "Fort Worth CCD") is intentionally excluded
    // here because it covers whole swaths of a county and isn't a city.
    SITUS_CITY:     raw.placename || raw.parcelcity || '',
    SITUS_STATE:    raw.parcelstate || '',
    SITUS_ZIP:      raw.parcelzip  || '',
    OWNER_NAME:     raw.ownername  || '',
    MAIL_ADDR:      raw.owneraddr  || '',
    MAIL_CITY:      mailCity,
    MAIL_STATE:     mailState,
    MAIL_ZIP:       raw.ownerzip   || '',
    MKT_VAL:        raw.totalvalue ?? '',
    LAND_VAL:       raw.landvalue  ?? '',
    IMPR_VAL:       raw.imprvalue  ?? '',
    AG_VAL:         raw.agvalue    ?? '',
    GIS_ACRES:      raw.taxacres   ?? raw.assdacres ?? '',
    CALC_AREA_SQM:  raw.calcarea   ?? '',
    YEAR_BUILT:     raw.yearbuilt  || '',
    BLDG_SQFT:      raw.bldgsqft   || '',
    NUM_BLDGS:      raw.numbldgs   || '',
    NUM_UNITS:      raw.numunits   || '',
    NUM_FLOORS:     raw.numfloors  || '',
    BEDROOMS:       raw.bedrooms   ?? '',
    BATHROOMS:      raw.fullbaths  ?? '',
    HALF_BATHS:     raw.halfbaths  ?? '',
    LEGAL_DESC:     raw.legaldesc  || '',
    USE_CODE:       raw.usecode    || '',
    USE_DESC:       raw.usedesc    || '',
    ZONING_CODE:    raw.zoningcode || '',
    ZONING:         raw.zoningdesc || raw.zoningcode || '',
    SALE_PRICE:     raw.saleamt    ?? '',
    SALE_DATE:      raw.saledate   || '',
    TAX_ACCT:       raw.taxacctnum || '',
    TAX_YEAR:       raw.taxyear    ?? '',
    LOT:            raw.lot        || '',
    BLOCK:          raw.block      || '',
    BOOK:           raw.book       || '',
    PAGE:           raw.page       || '',
    SUBDIVISION:    raw.plssdesc   || '',
    TOWNSHIP:       raw.township   || '',
    SECTION:        raw.section    || '',
    QTR_SECTION:    raw.qtrsection || '',
    RANGE:          raw.range      || '',
    COUNTY:         raw.countyname || '',
    COUNTY_FIPS:    raw.geoid      || '',
    CITY:           raw.placename  || raw.parcelcity || '',
    CENSUS_TRACT:   raw.tractname  || '',
    PLACE_NAME:     raw.placename  || '',
    LATITUDE:       raw.centroidy  ?? '',
    LONGITUDE:      raw.centroidx  ?? '',
    LAST_UPDATED:   raw.updated    || '',
  }
}

function pidMatch(pid) {
  return ['any',
    ['==', ['get', 'parcelid'], pid],
    ['==', ['get', 'lrid'], pid],
  ]
}

function buildColorExpression(clickedParcelId, selectedParcels, parcelIdToColorIndex, baseColor = '#2563eb') {
  const cases = []
  if (clickedParcelId) {
    cases.push(pidMatch(clickedParcelId), baseColor)
  }
  for (const pid of selectedParcels) {
    cases.push(pidMatch(pid), '#059669')
  }
  for (const [pid, idx] of parcelIdToColorIndex) {
    cases.push(pidMatch(pid), LIST_HIGHLIGHT_COLORS[idx] || LIST_HIGHLIGHT_COLORS[0])
  }
  if (cases.length === 0) return baseColor
  return ['case', ...cases, baseColor]
}

function buildFillColorExpression(clickedParcelId, selectedParcels, parcelIdToColorIndex, baseColor = '#2563eb') {
  const cases = []
  if (clickedParcelId) {
    cases.push(pidMatch(clickedParcelId), baseColor)
  }
  for (const pid of selectedParcels) {
    cases.push(pidMatch(pid), '#10b981')
  }
  for (const [pid, idx] of parcelIdToColorIndex) {
    const c = LIST_HIGHLIGHT_COLORS[idx] || LIST_HIGHLIGHT_COLORS[0]
    cases.push(pidMatch(pid), c)
  }
  if (cases.length === 0) return 'transparent'
  return ['case', ...cases, 'transparent']
}

function buildWidthExpression(clickedParcelId, selectedParcels, parcelIdToColorIndex) {
  const cases = []
  if (clickedParcelId) cases.push(pidMatch(clickedParcelId), 3)
  for (const pid of selectedParcels) cases.push(pidMatch(pid), 3)
  for (const [pid] of parcelIdToColorIndex) cases.push(pidMatch(pid), 3)
  if (cases.length === 0) return 2
  return ['case', ...cases, 2]
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

  colorRef.current = boundaryColor || '#2563eb'
  opacityRef.current = boundaryOpacity ?? 80
  clickedRef.current = clickedParcelId
  selectedRef.current = selectedParcels

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

  function repaint() {
    const map = mapRef?.current
    if (!map || !layersAddedRef.current) return
    try {
      if (!map.getLayer(FILL_LAYER) || !map.getLayer(LINE_LAYER)) return
    } catch { return }
    const color = colorRef.current
    const clicked = clickedRef.current
    const selected = selectedRef.current
    const idxMap = colorIndexRef.current
    try {
      map.setPaintProperty(FILL_LAYER, 'fill-color',
        buildFillColorExpression(clicked, selected, idxMap, color))
      map.setPaintProperty(LINE_LAYER, 'line-color',
        buildColorExpression(clicked, selected, idxMap, color))
      map.setPaintProperty(LINE_LAYER, 'line-width',
        buildWidthExpression(clicked, selected, idxMap))
      map.setPaintProperty(LINE_LAYER, 'line-opacity',
        (opacityRef.current ?? 80) / 100)
      map.triggerRepaint()
    } catch { /* ignore if layers not ready */ }
  }

  // Repaint only when something that actually affects paint expressions changes.
  // Running on every render (no deps) caused repaint() to fire at animation-frame
  // rate during map interactions, producing a ~78 Hz storm of paint-property
  // mutations and canvas repaints.
  useEffect(() => {
    repaint()
  }, [boundaryColor, boundaryOpacity, clickedParcelId, selectedParcels])

  // Add source + layers fully imperatively
  useEffect(() => {
    const map = mapRef?.current
    if (!map || !mapReady) return
    let cancelled = false
    let labelUpdateTimer = null
    // Signature of the last GeoJSON we pushed into LABEL_SOURCE. Used to short-circuit
    // redundant setData() calls — every setData fires a sourcedata event, which would
    // otherwise re-enter this handler and produce a continuous label-refresh loop.
    let lastLabelKey = ''

    const tileUrl = window.location.origin + '/api/tiles?z={z}&x={x}&y={y}'
    const emptyGeoJSON = { type: 'FeatureCollection', features: [] }
    const EMPTY_LABEL_KEY = 'empty'

    function refreshLabels() {
      if (cancelled) return
      if (labelUpdateTimer) clearTimeout(labelUpdateTimer)
      labelUpdateTimer = setTimeout(() => {
        if (cancelled) return
        try {
          const zoom = map.getZoom()
          const src = map.getSource(LABEL_SOURCE)
          if (!src) return
          if (zoom < 17) {
            if (lastLabelKey !== EMPTY_LABEL_KEY) {
              src.setData(emptyGeoJSON)
              lastLabelKey = EMPTY_LABEL_KEY
            }
            return
          }
          const features = map.queryRenderedFeatures({ layers: [FILL_LAYER] })
          const geo = buildLabelGeoJSON(features)
          // Cheap content fingerprint: feature count + concatenated labels. If
          // nothing visibly changed, skip setData entirely — every setData emits
          // a sourcedata event, which would otherwise re-enter this handler.
          const key = geo.features.length + '|' + geo.features.map(f => f.properties._label).join(',')
          if (key === lastLabelKey) return
          lastLabelKey = key
          src.setData(geo)
        } catch { /* ignore */ }
      }, 80)
    }

    function ensureLayers() {
      if (cancelled || layersAddedRef.current) return
      try {
        if (!map.getSource(SOURCE_ID)) {
          map.addSource(SOURCE_ID, {
            type: 'vector',
            tiles: [tileUrl],
            minzoom: PARCEL_MIN_ZOOM,
            maxzoom: PARCEL_TILE_MAXZOOM,
          })
        }
        if (!map.getLayer(FILL_LAYER)) {
          map.addLayer({
            id: FILL_LAYER,
            type: 'fill',
            source: SOURCE_ID,
            'source-layer': SOURCE_LAYER,
            minzoom: PARCEL_MIN_ZOOM,
            paint: { 'fill-color': 'transparent', 'fill-opacity': 0.3 },
          })
        }
        if (!map.getLayer(LINE_LAYER)) {
          map.addLayer({
            id: LINE_LAYER,
            type: 'line',
            source: SOURCE_ID,
            'source-layer': SOURCE_LAYER,
            minzoom: PARCEL_MIN_ZOOM,
            paint: { 'line-color': colorRef.current, 'line-width': 2, 'line-opacity': opacityRef.current / 100 },
          })
        }
        if (!map.getSource(LABEL_SOURCE)) {
          map.addSource(LABEL_SOURCE, { type: 'geojson', data: emptyGeoJSON })
        }
        if (!map.getLayer(LABEL_LAYER)) {
          map.addLayer({
            id: LABEL_LAYER,
            type: 'symbol',
            source: LABEL_SOURCE,
            minzoom: 17,
            layout: {
              'text-field': ['get', '_label'],
              'text-font': ['Open Sans Semibold'],
              'text-size': ['interpolate', ['linear'], ['zoom'], 17, 10, 20, 14],
              'text-allow-overlap': false,
              'text-ignore-placement': false,
              'text-padding': 2,
              'symbol-placement': 'point',
            },
            paint: {
              'text-color': '#ffffff',
              'text-halo-color': 'rgba(0,0,0,0.8)',
              'text-halo-width': 1.5,
            },
          })
        }
        layersAddedRef.current = true
        repaint()
        refreshLabels()
      } catch {
        layersAddedRef.current = false
        map.once('idle', ensureLayers)
      }
    }

    ensureLayers()
    if (!layersAddedRef.current) {
      map.once('idle', ensureLayers)
    }

    const onStyleData = () => {
      if (!map.getSource(SOURCE_ID)) {
        layersAddedRef.current = false
        ensureLayers()
      }
    }
    map.on('styledata', onStyleData)

    map.on('moveend', refreshLabels)
    // Only react to sourcedata events for the parcels vector source. Reacting to
    // every source (basemap rasters, our own LABEL_SOURCE setData, terrain DEM,
    // etc.) previously produced a self-sustaining refresh loop running at ~12 Hz
    // forever, rebuilding the label GeoJSON and re-uploading GPU buffers.
    const onSourceData = (e) => {
      if (e.sourceId !== SOURCE_ID) return
      if (!e.isSourceLoaded && !e.tile) return
      refreshLabels()
    }
    map.on('sourcedata', onSourceData)

    const onClick = (e) => {
      const features = e.features?.length ? e.features : (() => {
        try { return map.queryRenderedFeatures(e.point, { layers: [FILL_LAYER] }) } catch { return [] }
      })()
      if (!features?.length || !onParcelClickRef.current) return
      const feature = pickBestFeature(features)
      if (!feature) return
      const raw = feature.properties || {}
      const properties = mapProperties(raw)
      const parcelId = properties.PROP_ID
      if (!parcelId) return
      if (!isMultiSelectRef.current) {
        clickedRef.current = parcelId
        repaint()
      }
      onParcelClickRef.current({
        latlng: { lat: e.lngLat.lat, lng: e.lngLat.lng },
        properties,
        geometry: feature.geometry,
        parcelId,
      })
    }

    const onEnter = () => { map.getCanvas().style.cursor = 'pointer' }
    const onLeave = () => { map.getCanvas().style.cursor = '' }

    map.on('click', FILL_LAYER, onClick)
    map.on('mouseenter', FILL_LAYER, onEnter)
    map.on('mouseleave', FILL_LAYER, onLeave)

    return () => {
      cancelled = true
      if (labelUpdateTimer) clearTimeout(labelUpdateTimer)
      map.off('moveend', refreshLabels)
      map.off('sourcedata', onSourceData)
      map.off('click', FILL_LAYER, onClick)
      map.off('mouseenter', FILL_LAYER, onEnter)
      map.off('mouseleave', FILL_LAYER, onLeave)
      map.off('styledata', onStyleData)
      try {
        if (map.getLayer(LABEL_LAYER)) map.removeLayer(LABEL_LAYER)
        if (map.getLayer(LINE_LAYER)) map.removeLayer(LINE_LAYER)
        if (map.getLayer(FILL_LAYER)) map.removeLayer(FILL_LAYER)
        if (map.getSource(LABEL_SOURCE)) map.removeSource(LABEL_SOURCE)
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
      } catch { /* ignore */ }
      layersAddedRef.current = false
    }
  }, [mapRef, mapReady])


  const findParcelAtLocation = useCallback((lat, lng) => {
    const map = mapRef?.current
    if (!map || !onParcelClickRef.current) return false

    const tryQuery = () => {
      try {
        if (!map.getLayer(FILL_LAYER)) return false
        const point = map.project([lng, lat])
        const features = map.queryRenderedFeatures(point, { layers: [FILL_LAYER] })
        if (!features.length) return false
        const feature = pickBestFeature(features)
        if (!feature) return false
        const raw = feature.properties || {}
        const properties = mapProperties(raw)
        const parcelId = properties.PROP_ID
        if (!parcelId || !onParcelClickRef.current) return false
        onParcelClickRef.current({
          latlng: { lat, lng },
          properties,
          geometry: feature.geometry,
          parcelId,
        })
        return true
      } catch { return false }
    }

    if (tryQuery()) return true
    map.once('idle', tryQuery)
    return false
  }, [mapRef])

  const setBoundaryColor = useCallback((color) => {
    colorRef.current = color
    repaint()
  }, [mapRef])

  const setBoundaryOpacity = useCallback((opacity) => {
    opacityRef.current = opacity
    const map = mapRef?.current
    if (map && map.getLayer(LINE_LAYER)) {
      map.setPaintProperty(LINE_LAYER, 'line-opacity', opacity / 100)
    }
  }, [mapRef])

  const reload = useCallback(() => {
    const map = mapRef?.current
    if (!map) return
    try {
      if (map.getLayer(LABEL_LAYER)) map.removeLayer(LABEL_LAYER)
      if (map.getLayer(LINE_LAYER)) map.removeLayer(LINE_LAYER)
      if (map.getLayer(FILL_LAYER)) map.removeLayer(FILL_LAYER)
      if (map.getSource(LABEL_SOURCE)) map.removeSource(LABEL_SOURCE)
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
      layersAddedRef.current = false
      const tileUrl = window.location.origin + '/api/tiles?z={z}&x={x}&y={y}'
      const emptyGeoJSON = { type: 'FeatureCollection', features: [] }
      map.addSource(SOURCE_ID, {
        type: 'vector',
        tiles: [tileUrl],
        minzoom: PARCEL_MIN_ZOOM,
        maxzoom: PARCEL_TILE_MAXZOOM,
      })
      map.addLayer({
        id: FILL_LAYER,
        type: 'fill',
        source: SOURCE_ID,
        'source-layer': SOURCE_LAYER,
        minzoom: PARCEL_MIN_ZOOM,
        paint: { 'fill-color': 'transparent', 'fill-opacity': 0.3 },
      })
      map.addLayer({
        id: LINE_LAYER,
        type: 'line',
        source: SOURCE_ID,
        'source-layer': SOURCE_LAYER,
        minzoom: PARCEL_MIN_ZOOM,
        paint: { 'line-color': colorRef.current, 'line-width': 2, 'line-opacity': opacityRef.current / 100 },
      })
      map.addSource(LABEL_SOURCE, { type: 'geojson', data: emptyGeoJSON })
      map.addLayer({
        id: LABEL_LAYER,
        type: 'symbol',
        source: LABEL_SOURCE,
        minzoom: 17,
        layout: {
          'text-field': ['get', '_label'],
          'text-font': ['Open Sans Semibold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 17, 10, 20, 14],
          'text-allow-overlap': false,
          'text-ignore-placement': false,
          'text-padding': 2,
          'symbol-placement': 'point',
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0,0,0,0.8)',
          'text-halo-width': 1.5,
        },
      })
      layersAddedRef.current = true
      repaint()
    } catch { /* ignore if style not ready */ }
  }, [mapRef])

  useEffect(() => {
    if (!onLayerReady) return
    onLayerReady({ findParcelAtLocation, setBoundaryColor, setBoundaryOpacity, repaint, reload })
  }, [onLayerReady, findParcelAtLocation, setBoundaryColor, setBoundaryOpacity, reload])

  return null
}
