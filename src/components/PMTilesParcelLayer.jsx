import { useEffect, useState, useRef } from 'react'
import { useMap } from 'react-leaflet'
import { VectorTile } from '@mapbox/vector-tile'
import Protobuf from 'pbf'
import L from 'leaflet'
import polygonClipping from 'polygon-clipping'

/** MVT geom types — only draw polygons; LineStrings as L.polygon auto-close and show spurious diagonals across tiles */
const MVT_POLYGON = 3

function lngLatRingToLeaflet(ring) {
  return ring.map(([lng, lat]) => [lat, lng])
}

/**
 * Add parcel polygons from a GeoJSON geometry (Polygon or MultiPolygon) to tileFeatureGroup.
 * @returns {number} number of polygons added
 */
function addParcelPolygonsFromGeoJSON(geometry, tileFeatureGroup, pane, style, parcelId, properties, handlers) {
  const { onClick, onMouseover, onMouseout } = handlers
  let count = 0

  const pushPolygon = (latlngs) => {
    if (!latlngs?.[0]?.length || latlngs[0].length < 3) return
    const polygon = L.polygon(latlngs, {
      ...style,
      pane,
      interactive: true,
      smoothFactor: 0,
    })
    polygon._parcelId = parcelId
    polygon._properties = properties
    polygon.on('click', onClick)
    polygon.on('mouseover', onMouseover)
    polygon.on('mouseout', onMouseout)
    tileFeatureGroup.addLayer(polygon)
    count++
  }

  if (geometry.type === 'Polygon') {
    const [outer, ...holes] = geometry.coordinates
    pushPolygon([lngLatRingToLeaflet(outer), ...holes.map(lngLatRingToLeaflet)])
  } else if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) {
      const [outer, ...holes] = poly
      pushPolygon([lngLatRingToLeaflet(outer), ...holes.map(lngLatRingToLeaflet)])
    }
  }

  return count
}

/**
 * LandRecords tiles often ship a full-tile clip rectangle (sometimes heavily densified).
 * Real lots: smaller in tile space and/or many vertices sit away from the ring's axis-aligned bbox.
 */
function isLikelyMvtTileFrameRing(ring, extent) {
  if (!ring || ring.length < 4) return false
  const n = ring.length

  let xmin = Infinity
  let xmax = -Infinity
  let ymin = Infinity
  let ymax = -Infinity
  for (const p of ring) {
    xmin = Math.min(xmin, p.x)
    xmax = Math.max(xmax, p.x)
    ymin = Math.min(ymin, p.y)
    ymax = Math.max(ymax, p.y)
  }
  const w = xmax - xmin
  const h = ymax - ymin
  if (w < extent * 0.65 || h < extent * 0.65) return false
  if (w > extent * 4 || h > extent * 4) return false

  const tol = Math.max(16, extent * 0.012)
  let onBboxEdge = 0
  for (const p of ring) {
    const onVert = Math.abs(p.x - xmin) <= tol || Math.abs(p.x - xmax) <= tol
    const onHoriz = Math.abs(p.y - ymin) <= tol || Math.abs(p.y - ymax) <= tol
    if (onVert || onHoriz) onBboxEdge++
  }
  if (onBboxEdge / n < 0.84) return false

  let area = 0
  for (let i = 0, j = n - 1; i < n; j = i++) {
    area += ring[j].x * ring[i].y - ring[i].x * ring[j].y
  }
  area = Math.abs(area / 2)
  const bboxArea = w * h
  if (bboxArea < 1e-6) return false
  if (area / bboxArea < 0.68) return false

  return true
}

function geomToClippingArg(geom) {
  if (geom.type === 'Polygon') return geom.coordinates
  if (geom.type === 'MultiPolygon') return geom.coordinates
  return null
}

/** Union fragments from adjacent tiles — removes doubled edges along tile seams (grid lines). */
function mergeParcelTileFragments(geoms) {
  const list = geoms.filter((g) => g && (g.type === 'Polygon' || g.type === 'MultiPolygon'))
  if (list.length === 0) return null
  if (list.length === 1) return list[0]
  const args = list.map(geomToClippingArg).filter(Boolean)
  if (args.length < 2) return list[0]
  try {
    const result = polygonClipping.union(...args)
    if (!result || result.length === 0) return list[0]
    if (result.length === 1) return { type: 'Polygon', coordinates: result[0] }
    return { type: 'MultiPolygon', coordinates: result }
  } catch {
    return list[0]
  }
}

function findParcelsVectorLayer(tile) {
  const names = Object.keys(tile.layers || {})
  if (names.length === 0) return null
  const lower = (s) => s.toLowerCase()
  const exact = ['parcels', 'landparcels', 'parcel', 'landparcel']
  for (const want of exact) {
    const hit = names.find((k) => lower(k) === want)
    if (hit) return tile.layers[hit]
  }
  const partial = names.find((k) => lower(k).includes('parcel'))
  return partial ? tile.layers[partial] : null
}

/**
 * Component to render parcel boundaries from PMTiles
 */
const LIST_HIGHLIGHT_COLORS = [
  { color: '#2563eb', weight: 3, fillColor: '#3b82f6', fillOpacity: 0.3 },
  { color: '#16a34a', weight: 3, fillColor: '#22c55e', fillOpacity: 0.3 },
  { color: '#ea580c', weight: 3, fillColor: '#f97316', fillOpacity: 0.3 },
  { color: '#9333ea', weight: 3, fillColor: '#a855f7', fillOpacity: 0.3 },
  { color: '#dc2626', weight: 3, fillColor: '#ef4444', fillOpacity: 0.3 },
  { color: '#0d9488', weight: 3, fillColor: '#14b8a6', fillOpacity: 0.3 },
  { color: '#db2777', weight: 3, fillColor: '#ec4899', fillOpacity: 0.3 },
  { color: '#4f46e5', weight: 3, fillColor: '#6366f1', fillOpacity: 0.3 },
  { color: '#d97706', weight: 3, fillColor: '#f59e0b', fillOpacity: 0.3 },
  { color: '#65a30d', weight: 3, fillColor: '#84cc16', fillOpacity: 0.3 },
  { color: '#0891b2', weight: 3, fillColor: '#06b6d4', fillOpacity: 0.3 },
  { color: '#e11d48', weight: 3, fillColor: '#f43f5e', fillOpacity: 0.3 },
  { color: '#7c3aed', weight: 3, fillColor: '#8b5cf6', fillOpacity: 0.3 },
  { color: '#059669', weight: 3, fillColor: '#10b981', fillOpacity: 0.3 },
  { color: '#0284c7', weight: 3, fillColor: '#0ea5e9', fillOpacity: 0.3 },
  { color: '#c026d3', weight: 3, fillColor: '#d946ef', fillOpacity: 0.3 },
  { color: '#b45309', weight: 3, fillColor: '#ea580c', fillOpacity: 0.3 },
  { color: '#1d4ed8', weight: 3, fillColor: '#2563eb', fillOpacity: 0.3 },
  { color: '#15803d', weight: 3, fillColor: '#16a34a', fillOpacity: 0.3 },
  { color: '#be185d', weight: 3, fillColor: '#db2777', fillOpacity: 0.3 },
]

/**
 * Map LandRecords.us property names → legacy field names used throughout the app.
 * Applied once per feature so downstream code (popups, panels, skip trace, etc.)
 * keeps working without changes.
 */
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

export function PMTilesParcelLayer({ 
  onParcelClick,
  clickedParcelId,
  selectedParcels,
  selectedListIds = [],
  lists = [],
  onLayerReady
}) {
  const map = useMap()
  const [parcelIdToColorIndex, setParcelIdToColorIndex] = useState(new Map()) // parcelId -> 0-19

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

  // Style definitions (shared across effects)
  const defaultStyle = {
    color: '#2563eb',
    weight: 2,
    opacity: 1,
    fillColor: 'transparent',
    fillOpacity: 0,
    interactive: true // Ensure polygons are clickable
  }

  const hoverStyle = {
    color: '#1d4ed8',
    weight: 3,
    fillColor: 'transparent',
    fillOpacity: 0
  }

  const clickedStyle = {
    color: '#1d4ed8',
    weight: 3,
    fillColor: '#3b82f6',
    fillOpacity: 0.3
  }

  const selectedStyle = {
    color: '#059669',
    weight: 3,
    fillColor: '#10b981',
    fillOpacity: 0.4
  }

  const getListHighlightStyle = (colorIndex) => LIST_HIGHLIGHT_COLORS[colorIndex] ?? LIST_HIGHLIGHT_COLORS[0]

  // Store layer group reference outside useEffect so it persists
  const layerGroupRef = useRef(null)
  const tileCacheRef = useRef(new Map())
  const parcelFragmentsRef = useRef(new Map())
  const parcelRenderLayersRef = useRef(new Map())
  const mergedPropsRef = useRef(new Map())
  const lastRequestedTileZoomRef = useRef(null)
  const zoomTooFarRef = useRef(false)
  const shouldFadeInRef = useRef(true)
  const wipeTimeoutRef = useRef(null)
  const PARCEL_PANE_NAME = 'parcelPane'
  const FADE_MS = 1000
  const PARCEL_MIN_ZOOM = 17
  const PARCEL_MAX_ZOOM = 20
  
  // Store current state in refs so event handlers always see latest values
  const selectedParcelsRef = useRef(selectedParcels)
  const clickedParcelIdRef = useRef(clickedParcelId)
  const parcelIdToColorIndexRef = useRef(parcelIdToColorIndex)
  const onParcelClickRef = useRef(onParcelClick)

  useEffect(() => {
    onParcelClickRef.current = onParcelClick
  }, [onParcelClick])

  // Update refs when state changes
  useEffect(() => {
    selectedParcelsRef.current = selectedParcels
  }, [selectedParcels])
  
  useEffect(() => {
    clickedParcelIdRef.current = clickedParcelId
  }, [clickedParcelId])
  
  useEffect(() => {
    parcelIdToColorIndexRef.current = parcelIdToColorIndex
  }, [parcelIdToColorIndex])

  // Simple point-in-polygon algorithm (ray casting)
  const isPointInPolygon = (point, polygon) => {
    const [x, y] = point
    let inside = false
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i]
      const [xj, yj] = polygon[j]
      
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)
      if (intersect) inside = !inside
    }
    
    return inside
  }

  // Function to find parcel at a given location and trigger click
  const findParcelAtLocationRef = useRef((lat, lng) => {
    if (!layerGroupRef.current || !onParcelClickRef.current) {
      return false
    }

    const point = L.latLng(lat, lng)
    let foundParcel = null
    let closestDistance = Infinity
    let closestParcel = null

    layerGroupRef.current.eachLayer((subLayer) => {
      if (!subLayer._parcelId || !(subLayer instanceof L.Polygon)) return
      const bounds = subLayer.getBounds()

      if (bounds.contains(point)) {
        try {
          const latlngs = subLayer.getLatLngs()
          if (Array.isArray(latlngs) && latlngs.length > 0) {
            const firstRing = Array.isArray(latlngs[0]) && typeof latlngs[0][0] === 'object'
              ? latlngs[0]
              : latlngs

            if (firstRing.length >= 3) {
              const polygonPoints = firstRing.map((ll) => {
                if (Array.isArray(ll)) return ll
                return [ll.lat, ll.lng]
              })

              if (isPointInPolygon([lat, lng], polygonPoints)) {
                foundParcel = subLayer
                return false
              }
            }
          }
        } catch (error) {
          console.warn('Error checking point in polygon:', error)
        }
      }

      const center = bounds.getCenter()
      const distance = point.distanceTo(center)
      if (distance < closestDistance) {
        closestDistance = distance
        closestParcel = subLayer
      }
    })

    // Use found parcel or fallback to closest one (within reasonable distance - 50 meters)
    const targetParcel = foundParcel || (closestDistance < 50 ? closestParcel : null)

    if (targetParcel && targetParcel._parcelId) {
      const parcelId = targetParcel._parcelId
      const properties = targetParcel._properties || {}
      
      console.log('📍 Found parcel at location:', parcelId, foundParcel ? '(exact match)' : '(closest, ' + closestDistance.toFixed(1) + 'm away)')
      
      onParcelClickRef.current({
        latlng: point,
        properties: properties,
        geometry: null,
        parcelId: parcelId
      })
      return true
    }

    return false
  })

  // Expose the function via callback
  useEffect(() => {
    if (onLayerReady) {
      onLayerReady({
        findParcelAtLocation: findParcelAtLocationRef.current
      })
    }
  }, [onLayerReady])

  useEffect(() => {
    // Create parcel pane as child of rotatePane so parcels rotate/scale with map (leaflet-rotate)
    if (!map.getPane(PARCEL_PANE_NAME)) {
      const rotatePane = map.getPane('rotatePane')
      const container = rotatePane || undefined
      const pane = map.createPane(PARCEL_PANE_NAME, container)
      if (pane) {
        pane.style.pointerEvents = 'auto'
        pane.style.zIndex = '450'
        pane.classList.add('parcel-pane')
      }
    }

    if (!layerGroupRef.current) {
      layerGroupRef.current = L.layerGroup({ pane: PARCEL_PANE_NAME })
      layerGroupRef.current.addTo(map)
    }
    const parcelLayerGroup = layerGroupRef.current
    const parcelPane = map.getPane(PARCEL_PANE_NAME)
    const tileCache = tileCacheRef.current

    // Fade out parcels over FADE_MS, then wipe (clear layers, remove group, hide pane)
    const wipeParcelLayer = () => {
      if (wipeTimeoutRef.current) {
        clearTimeout(wipeTimeoutRef.current)
        wipeTimeoutRef.current = null
      }
      zoomTooFarRef.current = true
      if (parcelPane) {
        parcelPane.classList.remove('parcel-pane-visible')
        parcelPane.style.transition = `opacity ${FADE_MS}ms ease-out`
        parcelPane.style.opacity = '0'
      }
      wipeTimeoutRef.current = setTimeout(() => {
        wipeTimeoutRef.current = null
        const group = layerGroupRef.current
        if (group) {
          group.clearLayers()
          if (map.hasLayer(group)) {
            map.removeLayer(group)
          }
        }
        tileCacheRef.current.clear()
        parcelFragmentsRef.current.clear()
        parcelRenderLayersRef.current.clear()
        mergedPropsRef.current.clear()
        lastRequestedTileZoomRef.current = null
        if (parcelPane) {
          parcelPane.style.visibility = 'hidden'
          parcelPane.style.display = 'none'
          parcelPane.style.pointerEvents = 'none'
        }
      }, FADE_MS)
    }

    // Function to load and render tiles
    const loadTiles = async () => {
      if (!map || !map.getBounds || !map.getZoom) return

      let bounds, zoom
      try {
        bounds = map.getBounds()
        zoom = map.getZoom()
      } catch (error) {
        return
      }

      if (!bounds || typeof zoom !== 'number' || isNaN(zoom)) return

      // LandRecords tiles are available up to z=16; clamp request zoom
      const minAvailableZoom = 10
      const maxAvailableZoom = 16

      if (zoom < PARCEL_MIN_ZOOM) {
        wipeParcelLayer()
        return
      }

      // Back in viable zoom range (15–20) - cancel pending wipe, restore pane and layer group
      if (zoomTooFarRef.current) {
        if (wipeTimeoutRef.current) {
          clearTimeout(wipeTimeoutRef.current)
          wipeTimeoutRef.current = null
        }
        shouldFadeInRef.current = true
        if (parcelPane) {
          parcelPane.style.display = ''
          parcelPane.style.opacity = ''
          parcelPane.style.visibility = ''
          parcelPane.style.pointerEvents = 'auto'
          parcelPane.classList.remove('parcel-pane-gesture-hiding')
        }
        const group = layerGroupRef.current
        if (group && !map.hasLayer(group)) {
          group.addTo(map)
        }
      }
      zoomTooFarRef.current = false
      
      // Clamp zoom to available range, but prefer exact match if available
      let requestedZoom
      if (zoom < minAvailableZoom) {
        requestedZoom = minAvailableZoom
      } else if (zoom > maxAvailableZoom) {
        requestedZoom = maxAvailableZoom
      } else {
        // Use exact zoom if available, otherwise floor to nearest available
        requestedZoom = Math.floor(zoom)
        // Ensure it's within bounds
        requestedZoom = Math.max(minAvailableZoom, Math.min(requestedZoom, maxAvailableZoom))
      }
      
      // Calculate tile range
      const nw = map.getBounds().getNorthWest()
      const se = map.getBounds().getSouthEast()

      // Calculate tile coordinates at the requested zoom level
      const minX = Math.floor((nw.lng + 180) / 360 * Math.pow(2, requestedZoom))
      const maxX = Math.ceil((se.lng + 180) / 360 * Math.pow(2, requestedZoom))
      
      // Y coordinates: north (smaller Y) to south (larger Y) in tile space
      const yNorth = Math.floor((1 - Math.log(Math.tan(nw.lat * Math.PI / 180) + 1 / Math.cos(nw.lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, requestedZoom))
      const ySouth = Math.ceil((1 - Math.log(Math.tan(se.lat * Math.PI / 180) + 1 / Math.cos(se.lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, requestedZoom))
      const minY = Math.min(yNorth, ySouth)
      const maxY = Math.max(yNorth, ySouth)

      // Track which tiles should be visible in current viewport
      const tilesInViewport = new Set()
      
      // Build set of tiles that should be visible
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          tilesInViewport.add(`${requestedZoom}/${x}/${y}`)
        }
      }

      if (lastRequestedTileZoomRef.current !== requestedZoom) {
        lastRequestedTileZoomRef.current = requestedZoom
        parcelFragmentsRef.current.clear()
        mergedPropsRef.current.clear()
        parcelRenderLayersRef.current.forEach((layers) => {
          layers.forEach((l) => {
            try {
              parcelLayerGroup.removeLayer(l)
            } catch {
              /* ignore */
            }
          })
        })
        parcelRenderLayersRef.current.clear()
        parcelLayerGroup.clearLayers()
        tileCache.clear()
      }

      const resolveStyleForParcel = (parcelId) => {
        const colorIdx = parcelIdToColorIndexRef.current.get(parcelId)
        if (colorIdx !== undefined) return getListHighlightStyle(colorIdx)
        if (selectedParcelsRef.current.has(parcelId)) return selectedStyle
        if (clickedParcelIdRef.current === parcelId) return clickedStyle
        return defaultStyle
      }

      const upsertMergedParcel = (parcelId) => {
        const frags = parcelFragmentsRef.current.get(parcelId)
        const oldLayers = parcelRenderLayersRef.current.get(parcelId)
        if (oldLayers) {
          oldLayers.forEach((l) => {
            try {
              parcelLayerGroup.removeLayer(l)
            } catch {
              /* ignore */
            }
          })
          parcelRenderLayersRef.current.delete(parcelId)
        }
        if (!frags || frags.size === 0) {
          mergedPropsRef.current.delete(parcelId)
          return
        }
        const merged = mergeParcelTileFragments([...frags.values()])
        if (!merged) return
        const properties = mergedPropsRef.current.get(parcelId) || {}
        const style = resolveStyleForParcel(parcelId)
        const g = merged

        const onPolygonClick = (e) => {
          const cb = onParcelClickRef.current
          if (!cb) return
          e.originalEvent.stopPropagation()
          cb({
            latlng: e.latlng,
            properties,
            geometry: g,
            parcelId,
          })
        }

        const onPolygonMouseover = function () {
          const pid = this._parcelId
          if (
            clickedParcelIdRef.current !== pid &&
            !selectedParcelsRef.current.has(pid) &&
            parcelIdToColorIndexRef.current.get(pid) === undefined
          ) {
            this.setStyle(hoverStyle)
          }
          this.bringToFront()
        }

        const onPolygonMouseout = function () {
          const pid = this._parcelId
          const idx = parcelIdToColorIndexRef.current.get(pid)
          if (idx !== undefined) {
            this.setStyle(getListHighlightStyle(idx))
          } else if (selectedParcelsRef.current.has(pid)) {
            this.setStyle(selectedStyle)
          } else if (clickedParcelIdRef.current === pid) {
            this.setStyle(clickedStyle)
          } else {
            this.setStyle(defaultStyle)
          }
        }

        const temp = L.featureGroup()
        const count = addParcelPolygonsFromGeoJSON(
          g,
          temp,
          PARCEL_PANE_NAME,
          style,
          parcelId,
          properties,
          {
            onClick: onPolygonClick,
            onMouseover: onPolygonMouseover,
            onMouseout: onPolygonMouseout,
          }
        )
        if (count === 0) return
        const layers = []
        temp.eachLayer((l) => {
          parcelLayerGroup.addLayer(l)
          layers.push(l)
        })
        parcelRenderLayersRef.current.set(parcelId, layers)
      }

      const addTileFragment = (parcelId, tKey, geometry, properties) => {
        if (!parcelFragmentsRef.current.has(parcelId)) {
          parcelFragmentsRef.current.set(parcelId, new Map())
        }
        parcelFragmentsRef.current.get(parcelId).set(tKey, JSON.parse(JSON.stringify(geometry)))
        const prev = mergedPropsRef.current.get(parcelId) || {}
        mergedPropsRef.current.set(parcelId, { ...prev, ...properties })
      }

      const newTilesToLoad = Array.from(tilesInViewport).filter((key) => !tileCache.has(key)).length

      const MAX_TILES_TO_LOAD = 50
      if (newTilesToLoad > MAX_TILES_TO_LOAD) {
        console.warn(`Too many new tiles to load (${newTilesToLoad} new). Zoom in to load more.`)
      }

      let newTilesLoaded = 0
      let featuresFound = 0

      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          const tileKey = `${requestedZoom}/${x}/${y}`

          if (tileCache.has(tileKey)) {
            continue
          }

          if (newTilesLoaded >= MAX_TILES_TO_LOAD) {
            break
          }

          try {
            const tileResponse = await fetch(`/api/tiles?z=${requestedZoom}&x=${x}&y=${y}`)

            if (!tileResponse.ok || tileResponse.status === 204) {
              continue
            }

            const arrayBuf = await tileResponse.arrayBuffer()
            if (!arrayBuf || arrayBuf.byteLength === 0) continue

            const tile = new VectorTile(new Protobuf(arrayBuf))

            if (!Object.keys(tile.layers || {}).length) {
              continue
            }

            const parcelsLayer = findParcelsVectorLayer(tile)
            if (!parcelsLayer) {
              continue
            }
            newTilesLoaded++

            const extent = parcelsLayer.extent || 4096

            const tileFeatures = []
            const parcelIdsTouched = new Set()

            for (let i = 0; i < parcelsLayer.length; i++) {
              const feature = parcelsLayer.feature(i)
              if (feature.type !== MVT_POLYGON) continue

              const rawRings = feature.loadGeometry()
              if (rawRings?.length) {
                const onlyTileFrames =
                  rawRings.length > 0 &&
                  rawRings.every((ring) => isLikelyMvtTileFrameRing(ring, extent))
                if (onlyTileFrames) continue
              }

              let gj
              try {
                gj = feature.toGeoJSON(x, y, requestedZoom)
              } catch {
                continue
              }

              const g = gj.geometry
              if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue

              const properties = mapProperties(gj.properties)

              const firstRing = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0]?.[0]
              let parcelId = properties.PROP_ID
              if (!parcelId && firstRing?.length) {
                let slat = 0
                let slng = 0
                for (const pt of firstRing) {
                  slng += pt[0]
                  slat += pt[1]
                }
                const n = firstRing.length
                parcelId = `${(slat / n).toFixed(6)}-${(slng / n).toFixed(6)}`
              }
              if (!parcelId) continue

              tileFeatures.push({
                parcelId,
                geometry: JSON.parse(JSON.stringify(g)),
                properties,
              })
              parcelIdsTouched.add(parcelId)
            }

            tileCache.set(tileKey, { features: tileFeatures })

            for (const f of tileFeatures) {
              addTileFragment(f.parcelId, tileKey, f.geometry, f.properties)
            }
            for (const pid of parcelIdsTouched) {
              upsertMergedParcel(pid)
            }
            featuresFound += parcelIdsTouched.size
          } catch (error) {
            console.error(`Error loading tile ${tileKey}:`, error)
          }
        }
      }

      // Layer group should already be on map, just verify
      if (!map.hasLayer(parcelLayerGroup)) {
        parcelLayerGroup.addTo(map)
      }

      const totalLayers = parcelLayerGroup.getLayers().length
      if (totalLayers > 0) {
        if (parcelPane && shouldFadeInRef.current) {
          shouldFadeInRef.current = false
          parcelPane.classList.remove('parcel-pane-visible')
          void parcelPane.offsetHeight
          requestAnimationFrame(() => {
            parcelPane.classList.add('parcel-pane-visible')
          })
        }
      }
    }

    // Debounce tile loading to avoid excessive calls during panning
    let loadTilesTimeout = null
    const debouncedLoadTiles = () => {
      if (loadTilesTimeout) clearTimeout(loadTilesTimeout)
      loadTilesTimeout = setTimeout(() => {
        loadTiles()
      }, 150)
    }

    // Trigger initial tile load after map is ready
    if (map.whenReady) {
      map.whenReady(() => { setTimeout(loadTiles, 200) })
    } else {
      setTimeout(loadTiles, 200)
    }

    // Wipe on zoom out past 15 (same handler ref for cleanup)
    const onZoomEndWipeIfOutOfRange = () => {
      const z = map.getZoom()
      if (typeof z === 'number' && !isNaN(z) && z < PARCEL_MIN_ZOOM) {
        wipeParcelLayer()
      }
    }

    // Fade out parcels only during user-initiated pinch/zoom (not programmatic follow pans).
    // We only hide on zoomstart because panning keeps parcels visible and stable.
    let gestureFadeInTimeout = null
    const onZoomGestureStart = () => {
      if (gestureFadeInTimeout) {
        clearTimeout(gestureFadeInTimeout)
        gestureFadeInTimeout = null
      }
      if (parcelPane && !zoomTooFarRef.current) {
        parcelPane.classList.add('parcel-pane-gesture-hiding')
      }
    }
    const onZoomGestureEnd = () => {
      if (gestureFadeInTimeout) clearTimeout(gestureFadeInTimeout)
      gestureFadeInTimeout = setTimeout(() => {
        gestureFadeInTimeout = null
        if (parcelPane && !zoomTooFarRef.current) {
          parcelPane.classList.remove('parcel-pane-gesture-hiding')
        }
      }, 100)
    }

    // Load tiles when map moves, zooms, or rotates (debounced)
    if (map && map.on) {
      map.on('zoomstart', onZoomGestureStart)
      map.on('zoomend', onZoomGestureEnd)
      map.on('moveend', debouncedLoadTiles)
      map.on('zoomend', debouncedLoadTiles)
      map.on('zoomend', onZoomEndWipeIfOutOfRange)
      if (map._rotate) {
        map.on('rotate', debouncedLoadTiles)
      }
    }

    // Function to update existing polygon styles (called when selection changes)
    const updatePolygonStyles = () => {
      if (!parcelLayerGroup) return
      const colorMap = parcelIdToColorIndexRef.current
      parcelLayerGroup.eachLayer((layer) => {
        if (!layer._parcelId) return
        const pid = layer._parcelId
        const idx = colorMap.get(pid)
        if (idx !== undefined) {
          layer.setStyle(getListHighlightStyle(idx))
        } else if (selectedParcels.has(pid)) {
          layer.setStyle(selectedStyle)
        } else if (clickedParcelId === pid) {
          layer.setStyle(clickedStyle)
        } else {
          layer.setStyle(defaultStyle)
        }
      })
    }

    // Update styles when selection changes (without reloading tiles)
    updatePolygonStyles()

    // Cleanup on unmount only
    return () => {
      if (loadTilesTimeout) clearTimeout(loadTilesTimeout)
      if (gestureFadeInTimeout) clearTimeout(gestureFadeInTimeout)
      if (wipeTimeoutRef.current) {
        clearTimeout(wipeTimeoutRef.current)
        wipeTimeoutRef.current = null
      }
      if (map && map.off) {
        map.off('zoomstart', onZoomGestureStart)
        map.off('zoomend', onZoomGestureEnd)
        map.off('moveend', debouncedLoadTiles)
        map.off('zoomend', debouncedLoadTiles)
        map.off('zoomend', onZoomEndWipeIfOutOfRange)
        if (map._rotate) {
          map.off('rotate', debouncedLoadTiles)
        }
      }
      if (layerGroupRef.current && map && map.removeLayer) {
        try {
          map.removeLayer(layerGroupRef.current)
        } catch (error) {
          console.warn('Error removing layer group:', error)
        }
        layerGroupRef.current = null
      }
      if (tileCacheRef.current) {
        tileCacheRef.current.clear()
      }
      parcelFragmentsRef.current.clear()
      parcelRenderLayersRef.current.clear()
      mergedPropsRef.current.clear()
      lastRequestedTileZoomRef.current = null
    }
  }, [map])

  // Separate effect to update styles when selection changes
  const selectedParcelsKey = Array.from(selectedParcels).sort().join(',')
  const parcelIdToColorKey = JSON.stringify(Array.from(parcelIdToColorIndex.entries()).sort())
  
  useEffect(() => {
    if (!layerGroupRef.current) return
    let updatedCount = 0
    let highlightedCount = 0
    const colorMap = parcelIdToColorIndexRef.current
    layerGroupRef.current.eachLayer((layer) => {
      if (!layer._parcelId) return
      const pid = layer._parcelId
      const idx = colorMap.get(pid)
      if (idx !== undefined) {
        layer.setStyle(getListHighlightStyle(idx))
        updatedCount++
        highlightedCount++
      } else if (selectedParcels.has(pid)) {
        layer.setStyle(selectedStyle)
        updatedCount++
      } else if (clickedParcelId === pid) {
        layer.setStyle(clickedStyle)
        updatedCount++
      } else {
        layer.setStyle(defaultStyle)
      }
    })
  }, [clickedParcelId, selectedParcelsKey, parcelIdToColorKey, selectedParcels, parcelIdToColorIndex, selectedStyle, clickedStyle, defaultStyle])

  return null
}
