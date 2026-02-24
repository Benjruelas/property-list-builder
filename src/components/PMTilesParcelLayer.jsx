import { useEffect, useState, useRef } from 'react'
import { useMap } from 'react-leaflet'
import { PMTiles } from 'pmtiles'
import { VectorTile } from '@mapbox/vector-tile'
import Protobuf from 'pbf'
import L from 'leaflet'

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

export function PMTilesParcelLayer({ 
  pmtilesUrl, 
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
  const pmtilesRef = useRef(null)
  const isInitializedRef = useRef(false)
  const pmtilesHeaderRef = useRef(null)
  const currentPmtilesUrlRef = useRef(null) // Track current PMTiles URL
  const zoomTooFarRef = useRef(false) // When true, do not load tiles until zoom back in range
  const shouldFadeInRef = useRef(true) // Fade in on first show or when zooming back in range
  const wipeTimeoutRef = useRef(null) // Pending wipe after fade-out; cleared if user zooms back in
  const PARCEL_PANE_NAME = 'parcelPane'
  const FADE_MS = 1000
  // Map zoom range for parcels: 17–20. Zoom 16 or less = hide boundaries.
  const PARCEL_MIN_ZOOM = 17
  const PARCEL_MAX_ZOOM = 20
  
  // Store current state in refs so event handlers always see latest values
  const selectedParcelsRef = useRef(selectedParcels)
  const clickedParcelIdRef = useRef(clickedParcelId)
  const parcelIdToColorIndexRef = useRef(parcelIdToColorIndex)
  
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
    if (!layerGroupRef.current || !onParcelClick) {
      return false
    }

    const point = L.latLng(lat, lng)
    let foundParcel = null
    let closestDistance = Infinity
    let closestParcel = null

    // Iterate through all layers to find the parcel containing or closest to the point
    layerGroupRef.current.eachLayer((layer) => {
      if (layer.eachLayer) {
        // Feature group (tile), iterate through its polygons
        layer.eachLayer((subLayer) => {
          if (subLayer._parcelId && subLayer instanceof L.Polygon) {
            const bounds = subLayer.getBounds()
            
            // Check if point is within bounds first (quick check)
            if (bounds.contains(point)) {
              try {
                // Get polygon's latlngs and check if point is actually inside
                const latlngs = subLayer.getLatLngs()
                if (Array.isArray(latlngs) && latlngs.length > 0) {
                  // Handle nested arrays (polygons with holes)
                  const firstRing = Array.isArray(latlngs[0]) && typeof latlngs[0][0] === 'object' 
                    ? latlngs[0] 
                    : latlngs
                  
                  if (firstRing.length >= 3) {
                    // Convert to simple [lat, lng] array format
                    const polygonPoints = firstRing.map(ll => {
                      if (Array.isArray(ll)) return ll
                      return [ll.lat, ll.lng]
                    })
                    
                    if (isPointInPolygon([lat, lng], polygonPoints)) {
                      foundParcel = subLayer
                      return false // Stop iteration - found exact match
                    }
                  }
                }
              } catch (error) {
                console.warn('Error checking point in polygon:', error)
              }
            }
            
            // Track closest polygon as fallback
            const center = bounds.getCenter()
            const distance = point.distanceTo(center)
            if (distance < closestDistance) {
              closestDistance = distance
              closestParcel = subLayer
            }
          }
        })
      } else if (layer._parcelId && layer instanceof L.Polygon) {
        // Direct polygon layer
        const bounds = layer.getBounds()
        if (bounds.contains(point)) {
          try {
            const latlngs = layer.getLatLngs()
            if (Array.isArray(latlngs) && latlngs.length > 0) {
              const firstRing = Array.isArray(latlngs[0]) && typeof latlngs[0][0] === 'object'
                ? latlngs[0]
                : latlngs
              
              if (firstRing.length >= 3) {
                const polygonPoints = firstRing.map(ll => {
                  if (Array.isArray(ll)) return ll
                  return [ll.lat, ll.lng]
                })
                
                if (isPointInPolygon([lat, lng], polygonPoints)) {
                  foundParcel = layer
                  return false
                }
              }
            }
          } catch (error) {
            console.warn('Error checking point in polygon:', error)
          }
        }
        
        // Track closest
        const center = bounds.getCenter()
        const distance = point.distanceTo(center)
        if (distance < closestDistance) {
          closestDistance = distance
          closestParcel = layer
        }
      }
    })

    // Use found parcel or fallback to closest one (within reasonable distance - 50 meters)
    const targetParcel = foundParcel || (closestDistance < 50 ? closestParcel : null)

    if (targetParcel && targetParcel._parcelId) {
      const parcelId = targetParcel._parcelId
      const properties = targetParcel._properties || {}
      
      console.log('📍 Found parcel at location:', parcelId, foundParcel ? '(exact match)' : '(closest, ' + closestDistance.toFixed(1) + 'm away)')
      
      onParcelClick({
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
    if (!pmtilesUrl) return

    // Create parcel pane once - put in rotatePane so parcels rotate with map (leaflet-rotate)
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
    let pmtiles = pmtilesRef.current
    let isInitialized = isInitializedRef.current
    let pmtilesHeader = pmtilesHeaderRef.current

    // Check if PMTiles URL has changed - if so, reset and reload
    if (currentPmtilesUrlRef.current && currentPmtilesUrlRef.current !== pmtilesUrl) {
      console.log('PMTiles URL changed from', currentPmtilesUrlRef.current, 'to', pmtilesUrl, '- resetting and reloading...')
      // Clear existing layers
      parcelLayerGroup.clearLayers()
      tileCache.clear()
      // Reset initialization state
      isInitialized = false
      isInitializedRef.current = false
      pmtilesRef.current = null
      pmtilesHeaderRef.current = null
      pmtiles = null
      pmtilesHeader = null
    }

    // Initialize PMTiles (re-initialize if URL changed)
    const initPMTiles = async () => {
      if (isInitialized && pmtiles && currentPmtilesUrlRef.current === pmtilesUrl) {
        // Map is already initialized, just load tiles if map is ready
        if (map && map.whenReady) {
          map.whenReady(() => {
            setTimeout(() => {
              loadTiles()
            }, 100)
          })
        } else {
          loadTiles()
        }
        return
      }
      
      try {
        console.log('Initializing PMTiles from URL:', pmtilesUrl)
        // Clear old layers when switching counties
        parcelLayerGroup.clearLayers()
        tileCache.clear()
        
        pmtiles = new PMTiles(pmtilesUrl)
        pmtilesRef.current = pmtiles
        currentPmtilesUrlRef.current = pmtilesUrl
        // Get header to verify PMTiles is accessible
        pmtilesHeader = await pmtiles.getHeader()
        pmtilesHeaderRef.current = pmtilesHeader
        console.log('PMTiles loaded:', {
          url: pmtilesUrl,
          minZoom: pmtilesHeader.minZoom,
          maxZoom: pmtilesHeader.maxZoom,
          tileType: pmtilesHeader.tileType
        })
        isInitialized = true
        isInitializedRef.current = true
        // Trigger initial tile load after ensuring map is fully ready
        if (map && map.whenReady) {
          map.whenReady(() => {
            setTimeout(() => {
              loadTiles()
            }, 200)
          })
        } else {
          // Fallback if whenReady is not available
          setTimeout(() => {
            loadTiles()
          }, 200)
        }
      } catch (error) {
        console.error('Error initializing PMTiles:', error)
      }
    }

    initPMTiles()

    // Fade out parcels over FADE_MS, then wipe (clear layers, remove group, hide pane)
    const wipeParcelLayer = () => {
      if (wipeTimeoutRef.current) {
        clearTimeout(wipeTimeoutRef.current)
        wipeTimeoutRef.current = null
      }
      zoomTooFarRef.current = true
      const pane = map.getPane(PARCEL_PANE_NAME)
      if (pane) {
        pane.classList.remove('parcel-pane-visible')
        pane.style.transition = `opacity ${FADE_MS}ms ease-out`
        pane.style.opacity = '0'
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
        if (pane) {
          pane.style.visibility = 'hidden'
          pane.style.display = 'none'
          pane.style.pointerEvents = 'none'
        }
      }, FADE_MS)
    }

    // Function to load and render tiles
    const loadTiles = async () => {
      if (!isInitialized || !pmtiles) {
        return
      }

      // Check if map is fully initialized before getting bounds
      if (!map || !map.getBounds || !map.getZoom) {
        console.warn('Map not ready for tile loading')
        return
      }

      let bounds, zoom
      try {
        bounds = map.getBounds()
        zoom = map.getZoom()
      } catch (error) {
        console.warn('Error getting map bounds/zoom, map may not be ready:', error)
        return
      }

      if (!bounds || typeof zoom !== 'number' || isNaN(zoom)) {
        console.warn('Invalid map bounds or zoom')
        return
      }

      // Get the actual zoom level to request from PMTiles
      // Use closest available zoom from PMTiles header (e.g. 10-16)
      if (!pmtilesHeader) {
        console.warn('PMTiles header not available yet')
        return
      }
      
      // Note: We use the actual props values in event handlers, not captured values
      // This ensures hover handlers always check current state
      
      const minAvailableZoom = pmtilesHeader.minZoom || 10
      const maxAvailableZoom = pmtilesHeader.maxZoom || 14

      console.log('Map zoom level:', zoom)

      // Outside parcel zoom range (15–20): completely wipe parcel layer
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
        const pane = map.getPane(PARCEL_PANE_NAME)
        if (pane) {
          pane.style.display = ''
          pane.style.opacity = ''
          pane.style.visibility = ''
          pane.style.pointerEvents = 'auto'
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

      // Calculate number of tiles to potentially load
      const tileCountX = maxX - minX + 1
      const tileCountY = maxY - minY + 1
      const totalTiles = tileCountX * tileCountY

      // First pass: Ensure cached tiles that are in viewport are on the map
      let cachedTilesAdded = 0
      tileCache.forEach((tileGroup, tileKey) => {
        if (tilesInViewport.has(tileKey)) {
          // Tile should be visible - ensure it's on the map
          if (!parcelLayerGroup.hasLayer(tileGroup)) {
            parcelLayerGroup.addLayer(tileGroup)
            // Fade in when re-adding cached tile so it doesn't snap appear
            const runFadeIn = (el) => {
              if (!el) return
              el.style.opacity = '0'
              el.style.transition = `opacity ${FADE_MS}ms ease-out`
              void el.offsetHeight
              requestAnimationFrame(() => { el.style.opacity = '1' })
            }
            const container = tileGroup._container
            if (container) runFadeIn(container)
            else setTimeout(() => runFadeIn(tileGroup._container), 0)
          }
          cachedTilesAdded++
        } else {
          // Tile is outside viewport - remove from map but keep in cache
          if (parcelLayerGroup.hasLayer(tileGroup)) {
            parcelLayerGroup.removeLayer(tileGroup)
          }
        }
      })

      // Count how many new tiles need to be loaded
      const newTilesToLoad = Array.from(tilesInViewport).filter(key => !tileCache.has(key)).length
      
      // Limit the number of NEW tiles to load (don't count cached ones)
      const MAX_TILES_TO_LOAD = 50
      if (newTilesToLoad > MAX_TILES_TO_LOAD) {
        console.warn(`Too many new tiles to load (${newTilesToLoad} new, ${cachedTilesAdded} cached). Zoom in to load more.`)
        // Still show cached tiles, just don't load new ones beyond the limit
      }

      let newTilesLoaded = 0
      let featuresFound = 0

      // Second pass: Load only new tiles that aren't in cache
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          const tileKey = `${requestedZoom}/${x}/${y}`
          
          // Skip if already in cache (already handled above)
          if (tileCache.has(tileKey)) {
            continue
          }

          // Check if we've hit the limit for new tiles
          if (newTilesLoaded >= MAX_TILES_TO_LOAD) {
            break
          }

          try {
            // Get tile from PMTiles at the requested zoom level
            const tileResponse = await pmtiles.getZxy(requestedZoom, x, y)
            
            if (!tileResponse || !tileResponse.data) {
              continue
            }

            // Parse vector tile
            const tile = new VectorTile(new Protobuf(tileResponse.data))
            
            // Log all available layers
            const availableLayers = Object.keys(tile.layers)
            if (availableLayers.length === 0) {
              continue
            }

            // Get parcels layer (try different possible layer names)
            const parcelsLayer = tile.layers.parcels || tile.layers.landparcels || tile.layers.parcel || tile.layers[availableLayers[0]]
            if (!parcelsLayer) {
              continue
            }
            newTilesLoaded++

            // Create a temporary layer group for this tile's features
            const tileFeatureGroup = L.featureGroup()

            // Process each feature
            for (let i = 0; i < parcelsLayer.length; i++) {
              const feature = parcelsLayer.feature(i)
              const geometry = feature.loadGeometry()
              const properties = feature.properties

              // Convert vector tile coordinates to lat/lng
              // Vector tiles use coordinates 0-extent within the tile
              const extent = parcelsLayer.extent || 4096
              
              // Calculate tile bounds in lat/lng at the requested zoom level
              const n = Math.PI - 2 * Math.PI * y / Math.pow(2, requestedZoom)
              const s = Math.PI - 2 * Math.PI * (y + 1) / Math.pow(2, requestedZoom)
              const tileNorth = Math.atan(Math.sinh(n)) * 180 / Math.PI
              const tileSouth = Math.atan(Math.sinh(s)) * 180 / Math.PI
              const tileWest = (x / Math.pow(2, requestedZoom) * 360 - 180)
              const tileEast = ((x + 1) / Math.pow(2, requestedZoom) * 360 - 180)
              
              const latRange = tileNorth - tileSouth
              const lngRange = tileEast - tileWest

              // Convert geometry to Leaflet format
              const latlngs = geometry.map(ring => 
                ring.map(point => {
                  // Convert from tile coordinates (0-extent) to lat/lng
                  const lat = tileNorth - (point.y / extent) * latRange
                  const lng = tileWest + (point.x / extent) * lngRange
                  return [lat, lng]
                })
              )

              // Get parcel ID - must match the ID used in App.jsx
              // Use PROP_ID if available, otherwise generate from center coordinate
              let parcelId = properties.PROP_ID
              if (!parcelId) {
                // Generate consistent ID from center coordinate
                const centerLat = latlngs[0].reduce((sum, coord) => sum + coord[0], 0) / latlngs[0].length
                const centerLng = latlngs[0].reduce((sum, coord) => sum + coord[1], 0) / latlngs[0].length
                parcelId = `${centerLat.toFixed(6)}-${centerLng.toFixed(6)}`
              }

              // Determine style based on current state (use refs to get current values)
              let style = defaultStyle
              const colorIdx = parcelIdToColorIndexRef.current.get(parcelId)
              if (colorIdx !== undefined) {
                style = getListHighlightStyle(colorIdx)
              } else if (selectedParcelsRef.current.has(parcelId)) {
                style = selectedStyle
              } else if (clickedParcelIdRef.current === parcelId) {
                style = clickedStyle
              }

              // Create polygon with parcel ID stored (pane: so all parcels are in our pane and can be wiped when zoomed out)
              const polygon = L.polygon(latlngs, {
                ...style,
                pane: PARCEL_PANE_NAME,
                interactive: true // Ensure clickable
              })
              polygon._parcelId = parcelId // Store ID for later reference
              polygon._properties = properties // Store properties for later reference
              
              // Add click handler - use the actual click event latlng for better accuracy
              if (onParcelClick) {
                polygon.on('click', (e) => {
                  e.originalEvent.stopPropagation() // Prevent map click
                  
                  // Use the click event's latlng for better accuracy
                  const clickLatlng = e.latlng
                  
                  console.log('Parcel polygon clicked:', {
                    parcelId,
                    clickLocation: clickLatlng,
                    properties
                  })
                  
                  onParcelClick({
                    latlng: clickLatlng,
                    properties: properties,
                    geometry: feature.geometry,
                    parcelId: parcelId
                  })
                })
              }

              // Add hover effects - use refs to always get current state
              polygon.on('mouseover', function() {
                const pid = this._parcelId
                // Check current state using refs (always up-to-date)
                if (clickedParcelIdRef.current !== pid && 
                    !selectedParcelsRef.current.has(pid) && 
                    parcelIdToColorIndexRef.current.get(pid) === undefined) {
                  this.setStyle(hoverStyle)
                }
                this.bringToFront()
              })

              polygon.on('mouseout', function() {
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
              })

              tileFeatureGroup.addLayer(polygon)
              featuresFound++
            }

            parcelLayerGroup.addLayer(tileFeatureGroup)
            tileCache.set(tileKey, tileFeatureGroup) // Store the feature group for the tile

            // Fade in this tile's parcels so they don't snap appear
            const runFadeIn = (el) => {
              if (!el) return
              el.style.opacity = '0'
              el.style.transition = `opacity ${FADE_MS}ms ease-out`
              void el.offsetHeight // Force reflow so opacity 0 is painted before we animate
              requestAnimationFrame(() => {
                el.style.opacity = '1'
              })
            }
            const container = tileFeatureGroup._container
            if (container) {
              runFadeIn(container)
            } else {
              // Container may not exist until after addLayer; try on next tick
              setTimeout(() => runFadeIn(tileFeatureGroup._container), 0)
            }

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
        // Fade in parcels only when first showing or after zooming back in range (CSS .parcel-pane.parcel-pane-visible)
        if (parcelPane && shouldFadeInRef.current) {
          shouldFadeInRef.current = false
          parcelPane.classList.remove('parcel-pane-visible')
          void parcelPane.offsetHeight // Force reflow so we start from opacity 0
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
      }, 150) // Wait 150ms after last movement
    }

    // Wipe on zoom out past 15 (same handler ref for cleanup)
    const onZoomEndWipeIfOutOfRange = () => {
      const z = map.getZoom()
      if (typeof z === 'number' && !isNaN(z) && z < PARCEL_MIN_ZOOM) {
        wipeParcelLayer()
      }
    }
    // Load tiles when map moves (debounced to avoid excessive calls)
    if (map && map.on) {
      map.on('moveend', debouncedLoadTiles)
      map.on('zoomend', debouncedLoadTiles)
      map.on('zoomend', onZoomEndWipeIfOutOfRange)
    }

    // Function to update existing polygon styles (called when selection changes)
    const updatePolygonStyles = () => {
      if (!parcelLayerGroup) return
      const colorMap = parcelIdToColorIndexRef.current
      parcelLayerGroup.eachLayer((layer) => {
        if (layer._parcelId) {
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
        }
      })
    }

    // Update styles when selection changes (without reloading tiles)
    updatePolygonStyles()

    // Cleanup on unmount only
    return () => {
      if (loadTilesTimeout) clearTimeout(loadTilesTimeout)
      if (wipeTimeoutRef.current) {
        clearTimeout(wipeTimeoutRef.current)
        wipeTimeoutRef.current = null
      }
      if (map && map.off) {
        map.off('moveend', debouncedLoadTiles)
        map.off('zoomend', debouncedLoadTiles)
        map.off('zoomend', onZoomEndWipeIfOutOfRange)
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
      pmtilesRef.current = null
      isInitializedRef.current = false
      pmtilesHeaderRef.current = null
    }
  }, [map, pmtilesUrl, onParcelClick]) // Only re-run when these change

  // Separate effect to update styles when selection changes
  const selectedParcelsKey = Array.from(selectedParcels).sort().join(',')
  const parcelIdToColorKey = JSON.stringify(Array.from(parcelIdToColorIndex.entries()).sort())
  
  useEffect(() => {
    if (!layerGroupRef.current) return
    let updatedCount = 0
    let highlightedCount = 0
    const colorMap = parcelIdToColorIndexRef.current
    layerGroupRef.current.eachLayer((layer) => {
      if (layer.eachLayer) {
        layer.eachLayer((subLayer) => {
          if (subLayer._parcelId) {
            const pid = subLayer._parcelId
            const idx = colorMap.get(pid)
            if (idx !== undefined) {
              subLayer.setStyle(getListHighlightStyle(idx))
              updatedCount++
              highlightedCount++
            } else if (selectedParcels.has(pid)) {
              subLayer.setStyle(selectedStyle)
              updatedCount++
            } else if (clickedParcelId === pid) {
              subLayer.setStyle(clickedStyle)
              updatedCount++
            } else {
              subLayer.setStyle(defaultStyle)
            }
          }
        })
      } else if (layer._parcelId) {
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
      }
    })
  }, [clickedParcelId, selectedParcelsKey, parcelIdToColorKey, selectedParcels, parcelIdToColorIndex, selectedStyle, clickedStyle, defaultStyle])

  return null
}
