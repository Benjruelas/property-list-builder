import { useState, useEffect, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, useMapEvents, Circle, useMap, ZoomControl } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { PMTilesParcelLayer } from './components/PMTilesParcelLayer'
import { MapControls } from './components/MapControls'
import { AddressSearch } from './components/AddressSearch'
import { ListPanel } from './components/ListPanel'
import { ParcelListPanel } from './components/ParcelListPanel'
import { ParcelDetails } from './components/ParcelDetails'
import { ToastContainer, showToast } from './components/ui/toast'
import { ConfirmDialog, showConfirm } from './components/ui/confirm-dialog'
import { getCountyFromCoords } from './utils/geoUtils'
import { getCountyPMTilesUrl } from './utils/parcelLoader'
import { fetchPublicLists, addParcelsToPublicList, removeParcelsFromPublicList, deletePublicList } from './utils/publicLists'

// Fix for default marker icons in React-Leaflet
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

function MapController({ userLocation, onMapReady, onRecenterMap, onCountyChange }) {
  const map = useMap()

  // Store map instance reference
  useEffect(() => {
    if (onMapReady) {
      onMapReady(map)
    }
  }, [map, onMapReady])

  // Center map on user location when it's available (only initially)
  useEffect(() => {
    if (userLocation) {
      map.setView([userLocation.lat, userLocation.lng], 17, {
        animate: false  // Don't animate initially - faster load
      })
    }
  }, [userLocation, map])

  // Expose recenter function to parent
  useEffect(() => {
    if (onRecenterMap) {
      onRecenterMap(() => {
        if (userLocation) {
          map.setView([userLocation.lat, userLocation.lng], 17, {
            animate: true,
            duration: 0.5
          })
        }
      })
    }
  }, [map, userLocation, onRecenterMap])

  // Monitor map viewport changes to detect county
  useEffect(() => {
    if (!onCountyChange) return

    const detectCounty = () => {
      try {
        const center = map.getCenter()
        if (!center || typeof center.lat !== 'number' || typeof center.lng !== 'number') {
          console.warn('Map center not available yet', center)
          return
        }
        const county = getCountyFromCoords(center.lat, center.lng)
        console.log('📍 Detected county:', county, 'from center:', center.lat, center.lng)
        onCountyChange(county)
      } catch (error) {
        console.error('Error detecting county:', error)
      }
    }

    // Wait for map to be ready and initialized before detecting county
    const checkAndDetect = () => {
      if (map.getCenter && map.getCenter().lat && map.getCenter().lng) {
        detectCounty()
      } else {
        // Map not ready yet, try again
        setTimeout(checkAndDetect, 100)
      }
    }

    // Initial detection - wait for map to be ready
    map.whenReady(() => {
      // Add a small delay to ensure map is fully initialized
      setTimeout(checkAndDetect, 300)
    })

    // Listen to map move events (pan, zoom) - use debounce to avoid excessive calls
    let timeoutId = null
    const handleMapChange = () => {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(detectCounty, 300) // Debounce 300ms
    }

    map.on('moveend', handleMapChange)
    map.on('zoomend', handleMapChange)

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      map.off('moveend', handleMapChange)
      map.off('zoomend', handleMapChange)
    }
  }, [map, onCountyChange])

  return null
}

function LocationMarker({ position }) {
  const map = useMap()
  const circleRef = useRef(null)

  useEffect(() => {
    if (circleRef.current && position) {
      // Smoothly update marker position when location changes
      circleRef.current.setLatLng([position.lat, position.lng])
      // Bring to front to ensure it's visible above other layers
      circleRef.current.bringToFront()
    }
  }, [position])

  // Only render if we have a valid position
  if (!position || typeof position.lat !== 'number' || typeof position.lng !== 'number') {
    return null
  }

  return (
    <Circle
      ref={circleRef}
      center={[position.lat, position.lng]}
      radius={7.5}
      pathOptions={{
        color: '#000000',
        fillColor: '#000000',
        fillOpacity: 1,
        weight: 3
      }}
      pane="overlayPane"
    />
  )
}

function App() {
  const [userLocation, setUserLocation] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [currentCounty, setCurrentCounty] = useState(null)
  const [pmtilesUrl, setPmtilesUrl] = useState(null)
  const [isListPanelOpen, setIsListPanelOpen] = useState(false)
  const [isParcelListPanelOpen, setIsParcelListPanelOpen] = useState(false)
  const [viewingListId, setViewingListId] = useState(null) // List ID being viewed in ParcelListPanel
  const [isParcelDetailsOpen, setIsParcelDetailsOpen] = useState(false) // Parcel details panel
  const [isMultiSelectActive, setIsMultiSelectActive] = useState(false)
  const [selectedListId, setSelectedListId] = useState(null)
  const [selectedParcels, setSelectedParcels] = useState(new Set())
  const [selectedParcelsData, setSelectedParcelsData] = useState(new Map()) // Store full parcel data
  const [clickedParcelId, setClickedParcelId] = useState(null)
  const [clickedParcelData, setClickedParcelData] = useState(null) // Store full parcel data for popup
  const [publicLists, setPublicLists] = useState([])
  const [showListSelector, setShowListSelector] = useState(false) // Show list selector in popup
  const mapInstanceRef = useRef(null)
  const mapRef = useRef(null)
  const parcelLayerRef = useRef(null) // Reference to parcel layer functions
  const currentPopupRef = useRef(null) // Reference to current Leaflet popup

  // Recenter map function passed to MapController
  const recenterMapRef = useRef(null)
  const setRecenterMap = useCallback((func) => {
    recenterMapRef.current = func
  }, [])

  // Track user's current location in real-time
  useEffect(() => {
    let watchId = null
    let lastUpdateTime = 0
    const UPDATE_THROTTLE_MS = 1000 // Update at most once per second to avoid excessive renders

    if (navigator.geolocation) {
      // First, try to get current position quickly
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          }
          setUserLocation(location)
          lastUpdateTime = Date.now()
          console.log('📍 Initial location obtained:', location)
        },
        (error) => {
          // Silently fail and use default location - no alerts on mobile
          console.error('Error getting initial location:', error)
          // Default to Dallas, TX if geolocation fails
          setUserLocation({ lat: 32.7767, lng: -96.7970, accuracy: null })
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      )

      // Then, watch for position updates continuously
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const now = Date.now()
          // Throttle updates to avoid excessive re-renders
          if (now - lastUpdateTime < UPDATE_THROTTLE_MS) {
            return
          }

          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          }

          // Only update if location has changed significantly (at least 5 meters)
          // This prevents jittery updates when GPS accuracy is low
          setUserLocation((prevLocation) => {
            if (!prevLocation) {
              return location
            }

            // Calculate distance between old and new position (rough approximation)
            const latDiff = Math.abs(location.lat - prevLocation.lat)
            const lngDiff = Math.abs(location.lng - prevLocation.lng)
            // ~111,000 meters per degree latitude, varies by longitude but close enough
            const distanceMeters = Math.sqrt(
              Math.pow(latDiff * 111000, 2) + 
              Math.pow(lngDiff * 111000 * Math.cos(location.lat * Math.PI / 180), 2)
            )

            // Only update if moved at least 5 meters
            if (distanceMeters >= 5) {
              console.log(`📍 Location updated: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)} (moved ${distanceMeters.toFixed(1)}m)`)
              lastUpdateTime = now
              return location
            }

            return prevLocation
          })
        },
        (error) => {
          // Log error but don't stop watching
          console.error('Error watching location:', error)
          // Keep previous location if available
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 5000 // Accept cached position up to 5 seconds old
        }
      )

      console.log('📍 Started watching location (watchId:', watchId, ')')
    } else {
      // Default to Dallas, TX if geolocation not available
      setUserLocation({ lat: 32.7767, lng: -96.7970, accuracy: null })
    }

    // Cleanup: stop watching when component unmounts
    return () => {
      if (watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId)
        console.log('📍 Stopped watching location (watchId:', watchId, ')')
      }
    }
  }, [])

  // Load public lists on mount
  useEffect(() => {
    const loadPublicLists = async () => {
      try {
        console.log('Loading public lists...')
        const lists = await fetchPublicLists()
        console.log('Loaded public lists:', lists)
        setPublicLists(lists)
      } catch (error) {
        console.error('Error loading public lists:', error)
        // Don't show alert on initial load, just log
      }
    }

    loadPublicLists()
  }, [])

  // Load PMTiles URL based on viewport county (detected by MapController)
  const handleCountyChange = useCallback((county) => {
    if (!county) {
      console.warn('handleCountyChange called with no county')
      return
    }

    // If county hasn't changed, don't reload
    if (county === currentCounty && pmtilesUrl) {
      console.log(`County ${county} already loaded, skipping`)
      return
    }

    console.log(`County changed from ${currentCounty || 'none'} to ${county}`)
    setCurrentCounty(county)

    // Get PMTiles URL for the new county
    setIsLoading(true)
    console.log(`Fetching PMTiles URL for ${county} county...`)
    getCountyPMTilesUrl(county)
      .then((data) => {
        if (data && data.pmtilesUrl) {
          console.log(`✅ Loading PMTiles for ${county} county:`, data.pmtilesUrl)
          setPmtilesUrl(data.pmtilesUrl)
        } else {
          console.error(`❌ No PMTiles URL returned for ${county} county`)
        }
        setIsLoading(false)
      })
      .catch((error) => {
        console.error('❌ Error loading PMTiles URL:', error)
        setIsLoading(false)
      })
  }, [currentCounty, pmtilesUrl])

  // Refresh public lists
  const handlePublicListsChange = useCallback(async () => {
    try {
      console.log('handlePublicListsChange called - fetching public lists...')
      // Add a small retry mechanism for serverless cold starts
      let lists = []
      let retries = 3
      
      while (retries > 0) {
        lists = await fetchPublicLists()
        console.log(`handlePublicListsChange - fetched lists (attempt ${4 - retries}):`, lists.length, 'lists')
        
        // If we got lists, or this is our last attempt, break
        if (lists.length > 0 || retries === 1) {
          break
        }
        
        // Wait a bit before retrying (allows serverless function instance to warm up)
        await new Promise(resolve => setTimeout(resolve, 1000))
        retries--
      }
      
      setPublicLists(lists)
      console.log('handlePublicListsChange - state updated with', lists.length, 'lists')
    } catch (error) {
      console.error('Error refreshing public lists:', error)
    }
  }, [])

  // Delete a public list
  const handleDeletePublicList = useCallback(async (listId) => {
    const confirmed = await showConfirm(
      'Are you sure you want to delete this public list? This action cannot be undone.',
      'Delete Public List'
    )
    if (!confirmed) {
      return
    }

    try {
      await deletePublicList(listId)
      
      // Refresh public lists
      await handlePublicListsChange()
      
      // If this list was selected, deselect it
      if (selectedListId === listId) {
        setSelectedListId(null)
      }
      
      showToast('Public list deleted successfully', 'success')
    } catch (error) {
      console.error('Error deleting public list:', error)
      showToast(`Failed to delete public list: ${error.message}`, 'error')
    }
  }, [selectedListId, handlePublicListsChange])

  // Handle parcel click
  const handleParcelClick = useCallback((event) => {
    const { latlng, properties, parcelId: eventParcelId } = event
    // Use parcelId from event if available, otherwise generate from properties or latlng
    const parcelId = eventParcelId || properties.PROP_ID || `${latlng.lat.toFixed(6)}-${latlng.lng.toFixed(6)}`
    const address = properties.SITUS_ADDR || properties.SITE_ADDR || properties.ADDRESS || 'No address'
    
    if (isMultiSelectActive) {
      // Multi-select mode: toggle selection
      setSelectedParcels(prev => {
        const newSet = new Set(prev)
        if (newSet.has(parcelId)) {
          newSet.delete(parcelId)
          setSelectedParcelsData(prevData => {
            const newMap = new Map(prevData)
            newMap.delete(parcelId)
            return newMap
          })
          console.log('Deselected parcel:', parcelId)
        } else {
          newSet.add(parcelId)
          setSelectedParcelsData(prevData => {
            const newMap = new Map(prevData)
            newMap.set(parcelId, {
              id: parcelId,
              properties: properties,
              latlng: latlng,
              address: address
            })
            return newMap
          })
          console.log('Selected parcel:', parcelId, 'Total selected:', newSet.size)
        }
        return newSet
      })
    } else {
      // Single click: show popup and highlight
      // First, close any existing popup
      if (mapInstanceRef.current) {
        if (currentPopupRef.current) {
          mapInstanceRef.current.closePopup(currentPopupRef.current)
        } else {
          // Close any open popup (fallback)
          mapInstanceRef.current.closePopup()
        }
        currentPopupRef.current = null
      }
      
      // Update clicked parcel ID (this will trigger style updates via useEffect in PMTilesParcelLayer)
      // The previous parcel's highlighting will be removed automatically when clickedParcelId changes
      setClickedParcelId(parcelId)
      
      // Calculate age (Current Year - Year Built)
      const currentYear = new Date().getFullYear()
      const yearBuilt = properties.YEAR_BUILT ? parseInt(properties.YEAR_BUILT) : null
      const age = yearBuilt ? currentYear - yearBuilt : null
      
      // Store parcel data for adding to list
      const parcelData = {
        id: parcelId,
        properties: properties,
        address: address,
        lat: latlng.lat,
        lng: latlng.lng
      }
      setClickedParcelData(parcelData)
      
      if (mapInstanceRef.current) {
        const popup = L.popup()
          .setLatLng(latlng)
          .setContent(`
            <div style="min-width: 200px;" id="parcel-popup-${parcelId}">
              <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">Parcel Details</h3>
              <p style="margin: 4px 0; font-size: 12px;"><strong>Address:</strong> ${address}</p>
              ${properties.OWNER_NAME ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Owner:</strong> ${properties.OWNER_NAME}</p>` : ''}
              ${properties.PROP_ID ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Property ID:</strong> ${properties.PROP_ID}</p>` : ''}
              ${properties.LOC_LAND_U ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Land Use:</strong> ${properties.LOC_LAND_U}</p>` : ''}
              ${age !== null ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Age:</strong> ${age} years</p>` : ''}
              <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb; display: flex; flex-direction: column; gap: 8px;">
                <button 
                  id="more-details-btn-${parcelId}"
                  style="width: 100%; padding: 8px 12px; background: #6b7280; color: white; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;"
                  onclick="window.openParcelDetails()"
                >
                  More Details
                </button>
                <button 
                  id="add-to-list-btn-${parcelId}"
                  style="width: 100%; padding: 8px 12px; background: #2563eb; color: white; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;"
                  onclick="window.addParcelToList('${parcelId}')"
                >
                  Add to List
                </button>
              </div>
            </div>
          `)
        
        // Store popup reference and open it
        currentPopupRef.current = popup
        popup.openOn(mapInstanceRef.current)
        
        // Clear popup reference and clicked parcel ID when popup is closed
        popup.on('remove', () => {
          if (currentPopupRef.current === popup) {
            currentPopupRef.current = null
            // Clear clicked parcel ID when popup is manually closed by user
            setClickedParcelId(null)
          }
        })
      }
    }
    
    console.log('Parcel clicked:', {
      location: latlng,
      address,
      properties,
      parcelId,
      isMultiSelectActive
    })
  }, [isMultiSelectActive, publicLists])
  
  // Add single parcel to list (called from popup button)
  const handleAddSingleParcelToList = useCallback(async (listId, isPublic = false) => {
    if (!clickedParcelData) {
      showToast('No parcel selected', 'error')
      return
    }

    const parcelToAdd = {
      id: clickedParcelData.id,
      properties: clickedParcelData.properties,
      address: clickedParcelData.address,
      lat: clickedParcelData.lat,
      lng: clickedParcelData.lng,
      addedAt: new Date().toISOString()
    }

    try {
      if (isPublic) {
        const result = await addParcelsToPublicList(listId, [parcelToAdd])
        await handlePublicListsChange()
        const list = publicLists.find(l => l.id === listId)
        const listName = list ? list.name : 'list'
        showToast(`Added parcel to ${listName}`, 'success')
      } else {
        const stored = localStorage.getItem('property_lists')
        if (!stored) {
          showToast('Error: No local storage found', 'error')
          return
        }

        const lists = JSON.parse(stored)
        const listIndex = lists.findIndex(list => list.id === listId)
        if (listIndex === -1) {
          showToast('Error: List not found', 'error')
          return
        }

        const list = lists[listIndex]
        const existingIds = new Set(list.parcels.map(p => p.id || p))
        
        if (existingIds.has(parcelToAdd.id)) {
          showToast('Parcel already in this list', 'warning')
          return
        }
        
        lists[listIndex] = {
          ...list,
          parcels: [...list.parcels, parcelToAdd]
        }

        localStorage.setItem('property_lists', JSON.stringify(lists))
        showToast(`Added parcel to ${list.name}`, 'success')
      }
      
      // Close popup and panel
      if (mapInstanceRef.current) {
        mapInstanceRef.current.closePopup()
      }
      if (currentPopupRef.current) {
        currentPopupRef.current = null
      }
      setClickedParcelId(null) // Clear highlight
      setClickedParcelData(null)
      setShowListSelector(false)
      setIsListPanelOpen(false)
    } catch (error) {
      console.error('Error adding parcel to list:', error)
      showToast(`Failed to add parcel: ${error.message}`, 'error')
    }
  }, [clickedParcelData, publicLists, handlePublicListsChange])

  // Recenter map on user location
  const handleRecenter = useCallback(() => {
    if (recenterMapRef.current) {
      recenterMapRef.current()
    }
  }, [])

  // Toggle multi-select mode
  const handleToggleMultiSelect = useCallback(() => {
    setIsMultiSelectActive(prev => !prev)
    setSelectedParcels(new Set()) // Clear selection when toggling mode
    setSelectedParcelsData(new Map()) // Clear parcel data
    setClickedParcelId(null) // Clear single click highlight
  }, [])

  // Add selected parcels to list (handles both public and private)
  const handleAddParcelsToList = useCallback(async (listId, isPublic = false) => {
    const parcelIds = Array.from(selectedParcels)
    
    if (parcelIds.length === 0) {
      alert('No parcels selected')
      return
    }

    // Prepare parcels with full data
    const parcelsWithData = parcelIds.map(parcelId => {
      const parcelData = selectedParcelsData.get(parcelId)
      if (parcelData) {
        return {
          id: parcelId,
          properties: parcelData.properties,
          address: parcelData.address,
          lat: parcelData.latlng.lat,
          lng: parcelData.latlng.lng,
          addedAt: new Date().toISOString()
        }
      }
      // Fallback if data not available
      return {
        id: parcelId,
        addedAt: new Date().toISOString()
      }
    })

    try {
      if (isPublic) {
        // Add to public list via API (send full parcel data)
        const result = await addParcelsToPublicList(listId, parcelsWithData)
        
        // Refresh public lists
        await handlePublicListsChange()
        
        const list = publicLists.find(l => l.id === listId)
        const listName = list ? list.name : 'list'
        
        setSelectedParcels(new Set())
        setSelectedParcelsData(new Map())
        setIsMultiSelectActive(false)
        
        // If this list is selected, update the highlight
        if (selectedListId === listId) {
          setSelectedListId(null)
          setTimeout(() => setSelectedListId(listId), 0)
        }
        
        showToast(`Added ${result.parcelsAdded || parcelIds.length} parcels to ${listName}`, 'success')
      } else {
        // Add to private list in localStorage
        const stored = localStorage.getItem('property_lists')
        if (!stored) {
          showToast('Error: No local storage found', 'error')
          return
        }

        const lists = JSON.parse(stored)
        const listIndex = lists.findIndex(list => list.id === listId)
        if (listIndex === -1) {
          showToast('Error: List not found', 'error')
          return
        }

        const list = lists[listIndex]
        // Use parcels with full data
        const newParcels = parcelsWithData

        // Merge with existing parcels, avoiding duplicates
        const existingIds = new Set(list.parcels.map(p => p.id || p))
        const uniqueNewParcels = newParcels.filter(p => !existingIds.has(p.id))
        
        lists[listIndex] = {
          ...list,
          parcels: [...list.parcels, ...uniqueNewParcels]
        }

        localStorage.setItem('property_lists', JSON.stringify(lists))
        setSelectedParcels(new Set())
        setSelectedParcelsData(new Map())
        setIsMultiSelectActive(false)
        
        // If this list is selected, update the highlight
        if (selectedListId === listId) {
          setSelectedListId(null)
          setTimeout(() => setSelectedListId(listId), 0)
        }
        
        showToast(`Added ${uniqueNewParcels.length} parcels to ${list.name}`, 'success')
      }
    } catch (error) {
      console.error('Error adding parcels to list:', error)
      showToast(`Failed to add parcels: ${error.message}`, 'error')
    }
  }, [selectedParcels, publicLists, selectedListId, handlePublicListsChange])

  // Remove parcel from list
  const handleRemoveParcelFromList = useCallback(async (listId, parcelId, isPublic = false) => {
    const confirmed = await showConfirm(
      'Are you sure you want to remove this parcel from the list?',
      'Remove Parcel'
    )
    if (!confirmed) {
      return
    }

    try {
      if (isPublic) {
        await removeParcelsFromPublicList(listId, [parcelId])
        // Refresh public lists to get updated data
        await handlePublicListsChange()
        
        // If this list is selected, update the highlight
        if (selectedListId === listId) {
          setSelectedListId(null)
          setTimeout(() => setSelectedListId(listId), 0)
        }
        
        showToast('Parcel removed from list', 'success')
      } else {
        const stored = localStorage.getItem('property_lists')
        if (!stored) {
          showToast('Error: No local storage found', 'error')
          return
        }

        const lists = JSON.parse(stored)
        const listIndex = lists.findIndex(list => list.id === listId)
        if (listIndex === -1) {
          showToast('Error: List not found', 'error')
          return
        }

        const list = lists[listIndex]
        lists[listIndex] = {
          ...list,
          parcels: list.parcels.filter(p => (p.id || p) !== parcelId)
        }

        localStorage.setItem('property_lists', JSON.stringify(lists))
        
        // If this list is selected, update the highlight
        if (selectedListId === listId) {
          setSelectedListId(null)
          setTimeout(() => setSelectedListId(listId), 0)
        }
        
        showToast('Parcel removed from list', 'success')
      }
    } catch (error) {
      console.error('Error removing parcel from list:', error)
      showToast(`Failed to remove parcel: ${error.message}`, 'error')
    }
  }, [selectedListId, handlePublicListsChange])

  // Function to open parcel details (can accept parcel data or use clickedParcelData)
  const handleOpenParcelDetails = useCallback((parcelData = null) => {
    // If parcelData is provided (from list), use it; otherwise use clickedParcelData
    if (parcelData) {
      setClickedParcelData(parcelData)
    }
    setIsParcelDetailsOpen(true)
  }, [])

  // Expose function to window for popup button
  useEffect(() => {
    window.openParcelDetails = handleOpenParcelDetails
    window.addParcelToList = () => {
      setShowListSelector(true)
      setIsListPanelOpen(true)
    }
    return () => {
      delete window.openParcelDetails
      delete window.addParcelToList
    }
  }, [handleOpenParcelDetails])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <MapContainer
        center={userLocation || [32.7767, -96.7970]}
        zoom={17}
        minZoom={1}
        maxZoom={24}
        style={{ height: '100vh', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <ZoomControl position="topleft" />
        <MapController 
          userLocation={userLocation}
          onMapReady={(map) => { 
            mapInstanceRef.current = map
            mapRef.current = map
          }}
          onRecenterMap={setRecenterMap}
          onCountyChange={handleCountyChange}
        />
        {userLocation && (
          <LocationMarker 
            position={userLocation}
          />
        )}
        {pmtilesUrl && (
          <PMTilesParcelLayer 
            pmtilesUrl={pmtilesUrl}
            onParcelClick={handleParcelClick}
            clickedParcelId={clickedParcelId}
            selectedParcels={selectedParcels}
            selectedListId={selectedListId}
            publicLists={publicLists}
            onLayerReady={(layerFunctions) => {
              parcelLayerRef.current = layerFunctions
            }}
          />
        )}
      </MapContainer>

      <AddressSearch
        onLocationFound={(location) => {
          console.log('Address found:', location)
          showToast(`Navigated to: ${location.address}`, 'success')
          // The map will be centered by AddressSearch component
          // County detection will happen automatically via MapController
          
          // After map centers, wait for parcels to load, then find and highlight the parcel
          setTimeout(() => {
            if (parcelLayerRef.current && parcelLayerRef.current.findParcelAtLocation) {
              console.log('🔍 Searching for parcel at:', location.lat, location.lng)
              const found = parcelLayerRef.current.findParcelAtLocation(location.lat, location.lng)
              if (!found) {
                console.log('📍 No parcel found at this location - may need to zoom in or parcels may not be loaded yet')
              }
            } else {
              console.log('⚠️ Parcel layer not ready yet, retrying...')
              // Retry after a longer delay if layer isn't ready
              setTimeout(() => {
                if (parcelLayerRef.current && parcelLayerRef.current.findParcelAtLocation) {
                  const found = parcelLayerRef.current.findParcelAtLocation(location.lat, location.lng)
                  if (!found) {
                    console.log('📍 No parcel found at this location after retry')
                  }
                }
              }, 2000)
            }
          }, 1500) // Wait 1.5 seconds for map to center and parcels to load
        }}
        mapInstanceRef={mapInstanceRef}
      />

      <MapControls
        onRecenter={handleRecenter}
        onToggleMultiSelect={handleToggleMultiSelect}
        isMultiSelectActive={isMultiSelectActive}
        onOpenListPanel={() => setIsListPanelOpen(true)}
        selectedListId={selectedListId}
      />

      <ListPanel
        isOpen={isListPanelOpen && !isParcelListPanelOpen}
        onClose={() => {
          setIsListPanelOpen(false)
          setShowListSelector(false)
          setClickedParcelData(null)
        }}
        selectedListId={selectedListId}
        onSelectList={(listId) => {
          // Toggle selection: if already selected, deselect; otherwise select
          if (selectedListId === listId) {
            setSelectedListId(null)
          } else {
            setSelectedListId(listId)
          }
        }}
        onDeselectList={() => setSelectedListId(null)}
        onAddParcelsToList={showListSelector && clickedParcelData ? handleAddSingleParcelToList : handleAddParcelsToList}
        selectedParcelsCount={showListSelector && clickedParcelData ? 1 : selectedParcels.size}
        publicLists={publicLists}
        onPublicListsChange={handlePublicListsChange}
        onDeletePublicList={handleDeletePublicList}
        onViewListContents={(listId) => {
          setViewingListId(listId)
          setIsParcelListPanelOpen(true)
        }}
        isAddingSingleParcel={showListSelector && !!clickedParcelData}
      />

      <ParcelListPanel
        isOpen={isParcelListPanelOpen}
        onClose={() => {
          setIsParcelListPanelOpen(false)
          setViewingListId(null)
        }}
        selectedListId={viewingListId || selectedListId}
        publicLists={publicLists}
        onCenterParcel={(location) => {
          if (mapRef.current) {
            mapRef.current.setView([location.lat, location.lng], 17, {
              animate: true,
              duration: 0.5
            })
          }
        }}
        onBack={() => {
          setIsParcelListPanelOpen(false)
          setViewingListId(null)
        }}
        onRemoveParcel={handleRemoveParcelFromList}
        onOpenParcelDetails={handleOpenParcelDetails}
      />

      <ParcelDetails
        isOpen={isParcelDetailsOpen}
        onClose={() => setIsParcelDetailsOpen(false)}
        parcelData={clickedParcelData}
      />

      <ToastContainer />
      <ConfirmDialog />
    </div>
  )
}

export default App
