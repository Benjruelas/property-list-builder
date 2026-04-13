import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { Source, Layer } from 'react-map-gl/maplibre'

const PARCEL_MIN_ZOOM = 15
const PARCEL_TILE_MAXZOOM = 16
const SOURCE_LAYER = 'parcel_us'

const LIST_HIGHLIGHT_COLORS = [
  '#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ef4444',
  '#14b8a6', '#ec4899', '#6366f1', '#f59e0b', '#84cc16',
  '#06b6d4', '#f43f5e', '#8b5cf6', '#10b981', '#0ea5e9',
  '#d946ef', '#ea580c', '#2563eb', '#16a34a', '#db2777',
]

function mapProperties(raw) {
  return {
    PROP_ID:        raw.parcelid   || raw.lrid || '',
    PARCEL_ID_ALT:  raw.parcelid2  || '',
    SITUS_ADDR:     raw.parceladdr || '',
    SITUS_CITY:     raw.parcelcity || '',
    SITUS_STATE:    raw.parcelstate || '',
    SITUS_ZIP:      raw.parcelzip  || '',
    OWNER_NAME:     raw.ownername  || '',
    MAIL_ADDR:      [raw.owneraddr, raw.ownercity, raw.ownerstate, raw.ownerzip].filter(Boolean).join(', '),
    MAIL_CITY:      raw.ownercity  || '',
    MAIL_STATE:     raw.ownerstate || '',
    MAIL_ZIP:       raw.ownerzip   || '',
    MKT_VAL:        raw.totalvalue ?? '',
    LAND_VAL:       raw.landvalue  ?? '',
    IMPR_VAL:       raw.imprvalue  ?? '',
    AG_VAL:         raw.agvalue    ?? '',
    GIS_ACRES:      raw.assdacres  ?? '',
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
    COUNTY_FIPS:    raw.geoid      || '',
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

function buildColorExpression(clickedParcelId, selectedParcels, parcelIdToColorIndex) {
  const cases = []
  if (clickedParcelId) {
    cases.push(pidMatch(clickedParcelId), '#1d4ed8')
  }
  for (const pid of selectedParcels) {
    cases.push(pidMatch(pid), '#059669')
  }
  for (const [pid, idx] of parcelIdToColorIndex) {
    cases.push(pidMatch(pid), LIST_HIGHLIGHT_COLORS[idx] || LIST_HIGHLIGHT_COLORS[0])
  }
  if (cases.length === 0) return '#2563eb'
  return ['case', ...cases, '#2563eb']
}

function buildFillColorExpression(clickedParcelId, selectedParcels, parcelIdToColorIndex) {
  const cases = []
  if (clickedParcelId) {
    cases.push(pidMatch(clickedParcelId), '#3b82f6')
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
  selectedListIds = [],
  lists = [],
  onLayerReady,
}) {
  const [parcelIdToColorIndex, setParcelIdToColorIndex] = useState(new Map())
  const onParcelClickRef = useRef(onParcelClick)

  useEffect(() => { onParcelClickRef.current = onParcelClick }, [onParcelClick])

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
    setParcelIdToColorIndex(next)
  }, [selectedListIds, lists])

  const fillPaint = useMemo(() => ({
    'fill-color': buildFillColorExpression(clickedParcelId, selectedParcels, parcelIdToColorIndex),
    'fill-opacity': 0.3,
  }), [clickedParcelId, selectedParcels, parcelIdToColorIndex])

  const linePaint = useMemo(() => ({
    'line-color': buildColorExpression(clickedParcelId, selectedParcels, parcelIdToColorIndex),
    'line-width': buildWidthExpression(clickedParcelId, selectedParcels, parcelIdToColorIndex),
    'line-opacity': 1,
  }), [clickedParcelId, selectedParcels, parcelIdToColorIndex])

  useEffect(() => {
    const map = mapRef?.current
    if (!map || !mapReady) return

    const onClick = (e) => {
      let features
      try {
        features = map.queryRenderedFeatures(e.point, { layers: ['parcels-fill'] })
      } catch { return }
      if (!features?.length || !onParcelClickRef.current) return
      const raw = features[0].properties || {}
      const properties = mapProperties(raw)
      const parcelId = properties.PROP_ID
      if (!parcelId) return
      onParcelClickRef.current({
        latlng: { lat: e.lngLat.lat, lng: e.lngLat.lng },
        properties,
        geometry: features[0].geometry,
        parcelId,
      })
    }

    const onEnter = () => { map.getCanvas().style.cursor = 'pointer' }
    const onLeave = () => { map.getCanvas().style.cursor = '' }

    map.on('click', 'parcels-fill', onClick)
    map.on('mouseenter', 'parcels-fill', onEnter)
    map.on('mouseleave', 'parcels-fill', onLeave)
    return () => {
      map.off('click', 'parcels-fill', onClick)
      map.off('mouseenter', 'parcels-fill', onEnter)
      map.off('mouseleave', 'parcels-fill', onLeave)
    }
  }, [mapRef, mapReady])

  const findParcelAtLocation = useCallback((lat, lng) => {
    const map = mapRef?.current
    if (!map || !onParcelClickRef.current) return false

    const tryQuery = () => {
      try {
        if (!map.getLayer('parcels-fill')) return false
        const point = map.project([lng, lat])
        const features = map.queryRenderedFeatures(point, { layers: ['parcels-fill'] })
        if (!features.length) return false
        const raw = features[0].properties || {}
        const properties = mapProperties(raw)
        const parcelId = properties.PROP_ID
        if (!parcelId || !onParcelClickRef.current) return false
        onParcelClickRef.current({
          latlng: { lat, lng },
          properties,
          geometry: features[0].geometry,
          parcelId,
        })
        return true
      } catch { return false }
    }

    if (tryQuery()) return true
    map.once('idle', tryQuery)
    return false
  }, [mapRef])

  useEffect(() => {
    if (!onLayerReady) return
    onLayerReady({ findParcelAtLocation })
  }, [onLayerReady, findParcelAtLocation])

  const tileUrl = useMemo(() => [window.location.origin + '/api/tiles?z={z}&x={x}&y={y}'], [])

  return (
    <Source
      id="parcels"
      type="vector"
      tiles={tileUrl}
      minzoom={PARCEL_MIN_ZOOM}
      maxzoom={PARCEL_TILE_MAXZOOM}
    >
      <Layer
        id="parcels-fill"
        type="fill"
        source-layer={SOURCE_LAYER}
        minzoom={PARCEL_MIN_ZOOM}
        paint={fillPaint}
      />
      <Layer
        id="parcels-line"
        type="line"
        source-layer={SOURCE_LAYER}
        minzoom={PARCEL_MIN_ZOOM}
        paint={linePaint}
      />
    </Source>
  )
}
