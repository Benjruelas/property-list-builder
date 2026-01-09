import { useState, useEffect, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, useMapEvents, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { PMTilesParcelLayer } from './components/PMTilesParcelLayer'
import { MapControls } from './components/MapControls'
import { ListPanel } from './components/ListPanel'
import { ParcelListPanel } from './components/ParcelListPanel'
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

function MapController({ userLocation, onMapReady, onRecenterMap }) {
  const map = useMapEvents({})

  // Store map instance reference
  useEffect(() => {
    if (onMapReady) {
      onMapReady(map)
    }
  }, [map, onMapReady])

  // Center map on user location when it's available
  useEffect(() => {
    if (userLocation) {
      map.setView([userLocation.lat, userLocation.lng], 17, {
        animate: true,
        duration: 0.5
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

  return null
}

function LocationMarker({ position }) {
  const map = useMap()
  const circleRef = useRef(null)

  useEffect(() => {
    if (circleRef.current) {
      // Bring to front to ensure it's visible above other layers
      circleRef.current.bringToFront()
    }
  }, [position])

  return (
    <Circle
      ref={circleRef}
      center={position}
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

  // Recenter map function passed to MapController
  const recenterMapRef = useRef(null)
  const setRecenterMap = useCallback((func) => {
    recenterMapRef.current = func
  }, [])

      // Get user's current location
      useEffect(() => {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const location = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
              }
              setUserLocation(location)
            },
            (error) => {
              // Silently fail and use default location - no alerts on mobile
              console.error('Error getting location:', error)
              // Default to Dallas, TX if geolocation fails
              setUserLocation({ lat: 32.7767, lng: -96.7970 })
            },
            {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 0
            }
          )
        } else {
          // Default to Dallas, TX if geolocation not available
          setUserLocation({ lat: 32.7767, lng: -96.7970 })
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

  // Load PMTiles URL when user location is determined
  useEffect(() => {
    if (!userLocation) return

    const county = getCountyFromCoords(userLocation.lat, userLocation.lng)
    setCurrentCounty(county)

    // Get PMTiles URL for the county
    setIsLoading(true)
    getCountyPMTilesUrl(county)
      .then((data) => {
        if (data && data.pmtilesUrl) {
          setPmtilesUrl(data.pmtilesUrl)
        }
        setIsLoading(false)
      })
      .catch((error) => {
        console.error('Error loading PMTiles URL:', error)
        setIsLoading(false)
      })
  }, [userLocation])

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
      setClickedParcelId(parcelId)
      
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
              <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
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
          .openOn(mapInstanceRef.current)
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

  // Expose function to window for popup button
  useEffect(() => {
    window.addParcelToList = () => {
      setShowListSelector(true)
      setIsListPanelOpen(true)
    }
    return () => {
      delete window.addParcelToList
    }
  }, [])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <MapContainer
        center={userLocation || [32.7767, -96.7970]}
        zoom={17}
        minZoom={1}
        maxZoom={24}
        style={{ height: '100vh', width: '100%' }}
        zoomControl={true}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <MapController 
          userLocation={userLocation}
          onMapReady={(map) => { 
            mapInstanceRef.current = map
            mapRef.current = map
          }}
          onRecenterMap={setRecenterMap}
        />
        {userLocation && (
          <LocationMarker 
            position={[userLocation.lat, userLocation.lng]}
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
          />
        )}
      </MapContainer>

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
      />
      <ToastContainer />
      <ConfirmDialog />
    </div>
  )
}

export default App
