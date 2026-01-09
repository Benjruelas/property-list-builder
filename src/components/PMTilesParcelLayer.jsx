import { useEffect, useState, useRef } from 'react'
import { useMap } from 'react-leaflet'
import { PMTiles } from 'pmtiles'
import { VectorTile } from '@mapbox/vector-tile'
import Protobuf from 'pbf'
import L from 'leaflet'

/**
 * Component to render parcel boundaries from PMTiles
 */
export function PMTilesParcelLayer({ 
  pmtilesUrl, 
  onParcelClick,
  clickedParcelId,
  selectedParcels,
  selectedListId,
  publicLists
}) {
  const map = useMap()

  // Load list data for highlighting (supports both public and private lists)
  const [listParcelIds, setListParcelIds] = useState(new Set())
  
  useEffect(() => {
    if (selectedListId) {
      console.log('📋 List selected:', selectedListId)
      // Check if it's a public list (starts with 'public_')
      if (selectedListId.startsWith('public_')) {
        // Public list - find in publicLists prop
        const list = publicLists?.find(l => l.id === selectedListId)
        if (list) {
          const parcelIds = new Set(list.parcels.map(p => p.id || p))
          console.log('📋 Public list found:', list.name, 'with', parcelIds.size, 'parcels')
          console.log('📋 Parcel IDs:', Array.from(parcelIds).slice(0, 5))
          setListParcelIds(parcelIds)
        } else {
          console.log('📋 Public list not found in publicLists')
          setListParcelIds(new Set())
        }
      } else {
        // Private list - load from localStorage
        const stored = localStorage.getItem('property_lists')
        if (stored) {
          try {
            const lists = JSON.parse(stored)
            const list = lists.find(l => l.id === selectedListId)
            if (list) {
              const parcelIds = new Set(list.parcels.map(p => p.id || p))
              console.log('📋 Private list found:', list.name, 'with', parcelIds.size, 'parcels')
              console.log('📋 Parcel IDs:', Array.from(parcelIds).slice(0, 5))
              setListParcelIds(parcelIds)
            } else {
              console.log('📋 Private list not found in localStorage')
              setListParcelIds(new Set())
            }
          } catch (error) {
            console.error('Error loading list:', error)
            setListParcelIds(new Set())
          }
        } else {
          console.log('📋 No property_lists in localStorage')
          setListParcelIds(new Set())
        }
      }
    } else {
      console.log('📋 No list selected, clearing highlights')
      setListParcelIds(new Set())
    }
  }, [selectedListId, publicLists])

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

  const listHighlightStyle = {
    color: '#f59e0b',
    weight: 3,
    fillColor: '#fbbf24',
    fillOpacity: 0.5
  }

  // Store layer group reference outside useEffect so it persists
  const layerGroupRef = useRef(null)
  const tileCacheRef = useRef(new Map())
  const pmtilesRef = useRef(null)
  const isInitializedRef = useRef(false)
  const pmtilesHeaderRef = useRef(null)
  
  // Store current state in refs so event handlers always see latest values
  const selectedParcelsRef = useRef(selectedParcels)
  const clickedParcelIdRef = useRef(clickedParcelId)
  const listParcelIdsRef = useRef(listParcelIds)
  
  // Update refs when state changes
  useEffect(() => {
    selectedParcelsRef.current = selectedParcels
  }, [selectedParcels])
  
  useEffect(() => {
    clickedParcelIdRef.current = clickedParcelId
  }, [clickedParcelId])
  
  useEffect(() => {
    listParcelIdsRef.current = listParcelIds
  }, [listParcelIds])

  useEffect(() => {
    if (!pmtilesUrl) return

    if (!layerGroupRef.current) {
      layerGroupRef.current = L.layerGroup()
      // Add to map immediately so it's available
      layerGroupRef.current.addTo(map)
    }
    const parcelLayerGroup = layerGroupRef.current
    const tileCache = tileCacheRef.current
    let pmtiles = pmtilesRef.current
    let isInitialized = isInitializedRef.current
    let pmtilesHeader = pmtilesHeaderRef.current

    // Initialize PMTiles (only once)
    const initPMTiles = async () => {
      if (isInitialized && pmtiles) {
        loadTiles()
        return
      }
      
      try {
        pmtiles = new PMTiles(pmtilesUrl)
        pmtilesRef.current = pmtiles
        // Get header to verify PMTiles is accessible
        pmtilesHeader = await pmtiles.getHeader()
        pmtilesHeaderRef.current = pmtilesHeader
        console.log('PMTiles loaded:', {
          minZoom: pmtilesHeader.minZoom,
          maxZoom: pmtilesHeader.maxZoom,
          tileType: pmtilesHeader.tileType
        })
        isInitialized = true
        isInitializedRef.current = true
        // Trigger initial tile load
        loadTiles()
      } catch (error) {
        console.error('Error initializing PMTiles:', error)
      }
    }

    initPMTiles()

    // Function to load and render tiles
    const loadTiles = async () => {
      if (!isInitialized || !pmtiles) {
        return
      }

      const bounds = map.getBounds()
      const zoom = map.getZoom()

      // Get the actual zoom level to request from PMTiles
      // PMTiles has tiles at 10-14, so use the closest available zoom
      if (!pmtilesHeader) {
        console.warn('PMTiles header not available yet')
        return
      }
      
      // Note: We use the actual props values in event handlers, not captured values
      // This ensures hover handlers always check current state
      
      const minAvailableZoom = pmtilesHeader.minZoom || 10
      const maxAvailableZoom = pmtilesHeader.maxZoom || 14
      const requestedZoom = Math.max(minAvailableZoom, Math.min(zoom, maxAvailableZoom))
      
      console.log(`Map zoom: ${zoom}, requesting PMTiles zoom: ${requestedZoom}`)

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

      console.log(`Loading tiles for zoom ${requestedZoom}, bounds:`, {
        minX, maxX, minY, maxY,
        nw: [nw.lat, nw.lng],
        se: [se.lat, se.lng]
      })

      let tilesLoaded = 0
      let featuresFound = 0

      // Clear existing layers before loading new ones to prevent duplicates
      parcelLayerGroup.clearLayers()

      // Load tiles
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          const tileKey = `${requestedZoom}/${x}/${y}`
          
          // Skip if already loaded and still in viewport
          if (tileCache.has(tileKey) && map.hasLayer(tileCache.get(tileKey))) {
            tilesLoaded++; // Count as loaded if already present
            continue
          }

          try {
            // Get tile from PMTiles at the requested zoom level
            const tileResponse = await pmtiles.getZxy(requestedZoom, x, y)
            
            if (!tileResponse || !tileResponse.data) {
              console.log(`Tile ${tileKey}: No data`)
              continue
            }

            console.log(`Tile ${tileKey}: Loaded ${tileResponse.data.byteLength} bytes`)

            // Parse vector tile
            const tile = new VectorTile(new Protobuf(tileResponse.data))
            
            // Log all available layers
            const availableLayers = Object.keys(tile.layers)
            if (availableLayers.length === 0) {
              console.log(`Tile ${tileKey}: No layers found in tile.`)
              continue
            }
            console.log(`Tile ${tileKey}: Available layers:`, availableLayers)
            
            // Get parcels layer (try different possible layer names)
            const parcelsLayer = tile.layers.parcels || tile.layers.landparcels || tile.layers.parcel || tile.layers[availableLayers[0]]
            if (!parcelsLayer) {
              console.log(`Tile ${tileKey}: No parcels layer found. Tried: parcels, landparcels, parcel, ${availableLayers[0]}`)
              continue
            }

            console.log(`Tile ${tileKey}: Found ${parcelsLayer.length} features in layer "${parcelsLayer.name || 'unknown'}"`)
            tilesLoaded++

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
              if (listParcelIdsRef.current.has(parcelId)) {
                style = listHighlightStyle
              } else if (selectedParcelsRef.current.has(parcelId)) {
                style = selectedStyle
              } else if (clickedParcelIdRef.current === parcelId) {
                style = clickedStyle
              }

              // Create polygon with parcel ID stored
              const polygon = L.polygon(latlngs, {
                ...style,
                interactive: true // Ensure clickable
              })
              polygon._parcelId = parcelId // Store ID for later reference
              
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
                    !listParcelIdsRef.current.has(pid)) {
                  this.setStyle(hoverStyle)
                }
                this.bringToFront()
              })

              polygon.on('mouseout', function() {
                const pid = this._parcelId
                // Check current state using refs (always up-to-date)
                if (clickedParcelIdRef.current !== pid && 
                    !selectedParcelsRef.current.has(pid) && 
                    !listParcelIdsRef.current.has(pid)) {
                  this.setStyle(defaultStyle)
                } else if (listParcelIdsRef.current.has(pid)) {
                  this.setStyle(listHighlightStyle)
                } else if (selectedParcelsRef.current.has(pid)) {
                  this.setStyle(selectedStyle)
                } else if (clickedParcelIdRef.current === pid) {
                  this.setStyle(clickedStyle)
                }
              })

              // Add tooltip with address
              const address = properties.SITUS_ADDR || 
                            properties.SITE_ADDR || 
                            properties.ADDRESS || 
                            'No address available'
              
              polygon.bindTooltip(address, {
                permanent: false,
                direction: 'top',
                offset: [0, -10],
                className: 'parcel-tooltip'
              })

              tileFeatureGroup.addLayer(polygon)
              featuresFound++
            }

            parcelLayerGroup.addLayer(tileFeatureGroup)
            tileCache.set(tileKey, tileFeatureGroup) // Store the feature group for the tile
            console.log(`Tile ${tileKey}: Added ${parcelsLayer.length} parcels`)

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
        console.log(`✅ Added ${totalLayers} total parcels to map (${tilesLoaded} tiles loaded, ${featuresFound} features processed)`)
      } else {
        console.log(`⚠️ No parcels found in current viewport (${tilesLoaded} tiles checked, ${featuresFound} features found)`)
      }
    }

    // Load tiles when map moves
    const onMoveEnd = () => {
      // Don't clear layers here - let loadTiles handle it
      // This prevents flickering
      tileCache.clear()
      loadTiles()
    }

    map.on('moveend', onMoveEnd)
    map.on('zoomend', onMoveEnd)

    // Function to update existing polygon styles (called when selection changes)
    const updatePolygonStyles = () => {
      if (!parcelLayerGroup) return
      parcelLayerGroup.eachLayer((layer) => {
        if (layer._parcelId) {
          const pid = layer._parcelId
          if (listParcelIds.has(pid)) {
            layer.setStyle(listHighlightStyle)
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
      map.off('moveend', onMoveEnd)
      map.off('zoomend', onMoveEnd)
      if (layerGroupRef.current) {
        map.removeLayer(layerGroupRef.current)
        layerGroupRef.current = null
      }
      tileCacheRef.current.clear()
      pmtilesRef.current = null
      isInitializedRef.current = false
      pmtilesHeaderRef.current = null
    }
  }, [map, pmtilesUrl, onParcelClick]) // Only re-run when these change

  // Separate effect to update styles when selection changes
  // Convert Set to string for dependency tracking (React doesn't track Set changes well)
  const selectedParcelsKey = Array.from(selectedParcels).sort().join(',')
  const listParcelIdsKey = Array.from(listParcelIds).sort().join(',')
  
  useEffect(() => {
    if (!layerGroupRef.current) {
      console.log('🔄 No layer group available for style update')
      return
    }
    
    console.log('🔄 Updating polygon styles:', {
      selectedCount: selectedParcels.size,
      clickedId: clickedParcelId,
      listCount: listParcelIds.size,
      listParcelIds: Array.from(listParcelIds).slice(0, 5)
    })
    
    let updatedCount = 0
    let selectedCount = 0
    let highlightedCount = 0
    
    // Iterate through all layers in the layer group
    layerGroupRef.current.eachLayer((layer) => {
      // Check if it's a feature group (tile feature group)
      if (layer.eachLayer) {
        // It's a feature group, iterate through its layers
        layer.eachLayer((subLayer) => {
          if (subLayer._parcelId) {
            const pid = subLayer._parcelId
            if (listParcelIds.has(pid)) {
              subLayer.setStyle(listHighlightStyle)
              updatedCount++
              highlightedCount++
            } else if (selectedParcels.has(pid)) {
              subLayer.setStyle(selectedStyle)
              updatedCount++
              selectedCount++
            } else if (clickedParcelId === pid) {
              subLayer.setStyle(clickedStyle)
              updatedCount++
            } else {
              subLayer.setStyle(defaultStyle)
            }
          }
        })
      } else if (layer._parcelId) {
        // Direct polygon layer
        const pid = layer._parcelId
        if (listParcelIds.has(pid)) {
          layer.setStyle(listHighlightStyle)
          updatedCount++
          highlightedCount++
        } else if (selectedParcels.has(pid)) {
          layer.setStyle(selectedStyle)
          updatedCount++
          selectedCount++
        } else if (clickedParcelId === pid) {
          layer.setStyle(clickedStyle)
          updatedCount++
        } else {
          layer.setStyle(defaultStyle)
        }
      }
    })
    
    if (highlightedCount > 0) {
      console.log(`✅ Updated ${highlightedCount} list parcels to orange/yellow highlight`)
    }
    if (selectedCount > 0) {
      console.log(`✅ Updated ${selectedCount} selected parcels to green`)
    }
    if (updatedCount > 0) {
      console.log(`✅ Total: Updated ${updatedCount} polygon styles`)
    } else {
      console.log('⚠️ No parcels found to update styles')
    }
  }, [clickedParcelId, selectedParcelsKey, listParcelIdsKey, selectedParcels, listParcelIds, listHighlightStyle, selectedStyle, clickedStyle, defaultStyle])

  return null
}
