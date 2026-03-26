import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { MapContainer, TileLayer, useMapEvents, useMap, ZoomControl } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
// leaflet-rotate expects L globally; must load after leaflet
if (typeof window !== 'undefined') window.L = L
import 'leaflet-rotate'
import { CompassOrientation } from './components/CompassOrientation'
import { NorthIndicator } from './components/NorthIndicator'
import { MapOverlayPane } from './components/MapOverlayPane'
import { PMTilesParcelLayer } from './components/PMTilesParcelLayer'
import { MapControls } from './components/MapControls'
import { AddressSearch } from './components/AddressSearch'
import { ListPanel } from './components/ListPanel'
import { SkipTracedListPanel } from './components/SkipTracedListPanel'
import { ParcelListPanel } from './components/ParcelListPanel'
import { ParcelDetails } from './components/ParcelDetails'
import { PhoneActionPanel } from './components/PhoneActionPanel'
import { EmailTemplatesPanel } from './components/EmailTemplatesPanel'
import { TextTemplatesPanel } from './components/TextTemplatesPanel'
import { EmailComposer } from './components/EmailComposer'
import { BulkEmailPreview } from './components/BulkEmailPreview'
import { Login } from './components/Login'
import { SignUp } from './components/SignUp'
import { ForgotPassword } from './components/ForgotPassword'
import { ToastContainer, showToast } from './components/ui/toast'
import { ConfirmDialog, showConfirm } from './components/ui/confirm-dialog'
import { useAuth } from './contexts/AuthContext'
import { UserDataSyncProvider } from './contexts/UserDataSyncContext'
import { loadUserData, scheduleUserDataSync } from './utils/userDataSync'
import { getCountyFromCoords } from './utils/geoUtils'
import { getCountyPMTilesUrl } from './utils/parcelLoader'
import { fetchLists, createList, updateList, deleteList, validateShareEmail } from './utils/lists'
import { fetchPipelines, createPipeline, updatePipeline, validateShareEmail as validatePipelineShareEmail, canAddLeadsToPipeline } from './utils/pipelines'
import { auth } from './config/firebase'
import { skipTraceParcels, pollSkipTraceJobUntilComplete, saveSkipTracedParcel, saveSkipTracedParcels, getSkipTracedParcel, isParcelSkipTraced } from './utils/skipTrace'
import { addParcelToSkipTracedList, addListToSkipTracedList } from './utils/skipTracedList'
import { DealPipeline } from './components/DealPipeline'
import { SchedulePanel } from './components/SchedulePanel'
import { TasksPanel } from './components/TasksPanel'
import PathTracker from './components/PathTracker'
import { PathsPanel } from './components/PathsPanel'
import { fetchPaths, createPath, renamePath as renamePathApi, deletePath as deletePathApi } from './utils/paths'
import { smoothPath, totalDistanceMiles, totalDistanceKm } from './utils/pathSmoothing'
import { SettingsPanel } from './components/SettingsPanel'
import { ConvertToLeadPipelineDialog } from './components/ConvertToLeadPipelineDialog'
import { LeadsPanel } from './components/LeadsPanel'
import { PermissionPrompt, hasGrantedPermissions } from './components/PermissionPrompt'
import { NotificationPrompt } from './components/NotificationPrompt'
import { getSettings, updateSettings } from './utils/settings'
import { getAllTasks } from './utils/leadTasks'
import { showLocalNotification } from './utils/pushNotifications'
import { addLead, loadColumns, loadLeads, isParcelALead, getStreetAddress } from './utils/dealPipeline'
import { listToCsv } from './utils/exportList'
import { addSkipTraceJob, updateSkipTraceJob, getPendingSkipTraceJobs, removeSkipTraceJob, cleanupOldJobs } from './utils/skipTraceJobs'
import { useDeviceHeading } from './hooks/useDeviceHeading'
import { CheckCircle2, Loader2, Phone } from 'lucide-react'

function notifySkipTraceComplete(listName, detail) {
  try {
    const ns = getSettings().notifications
    if (!ns?.skipTraceComplete || typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      return
    }
    showLocalNotification('Skip trace complete', {
      body: `${listName}: ${detail}`,
      tag: `skip-list-${listName}-${Date.now()}`
    })
  } catch {
    /* ignore */
  }
}

// Fix for default marker icons in React-Leaflet
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

function MapController({ userLocation, onMapReady, onRecenterMap, onCountyChange, isFollowing, anyPanelOpen, hasPopup, onFollowingChange, followResumeDelay }) {
  const map = useMap()
  const initialSetDoneRef = useRef(false)
  const lastInteractionRef = useRef(0)
  const programmaticMoveRef = useRef(false)
  const prevFollowingRef = useRef(isFollowing)

  useEffect(() => {
    if (onMapReady) {
      onMapReady(map)
    }
  }, [map, onMapReady])

  // Fix iOS Safari: when URL bar shows/hides, resize event doesn't fire
  useEffect(() => {
    const handler = () => { map.invalidateSize() }
    window.visualViewport?.addEventListener('resize', handler)
    window.visualViewport?.addEventListener('scroll', handler)
    return () => {
      window.visualViewport?.removeEventListener('resize', handler)
      window.visualViewport?.removeEventListener('scroll', handler)
    }
  }, [map])

  // After the first rotation the tile grid may not cover rotated corners.
  // Fire a single tile refresh once after the first bearing change, then stop.
  useEffect(() => {
    if (!map) return
    let done = false
    const onFirstRotate = () => {
      if (done) return
      done = true
      map.off('rotateend', onFirstRotate)
      setTimeout(() => {
        map.invalidateSize({ pan: false })
        map._resetView(map.getCenter(), map.getZoom(), true)
      }, 300)
    }
    map.on('rotateend', onFirstRotate)
    return () => { map.off('rotateend', onFirstRotate) }
  }, [map])

  // Initial center (once)
  useEffect(() => {
    if (userLocation && !initialSetDoneRef.current) {
      initialSetDoneRef.current = true
      map.setView([userLocation.lat, userLocation.lng], 17, { animate: false })
    }
  }, [userLocation, map])

  // Follow-mode panning.
  // When follow-mode just resumed (was off → on), delay one frame so
  // CompassOrientation's setBearing settles first, then use setView to
  // snap the center. For ongoing following (small GPS updates), gently
  // pan only if the user has drifted > 3 px on screen.
  useEffect(() => {
    if (!userLocation || !initialSetDoneRef.current || !isFollowing) {
      prevFollowingRef.current = isFollowing
      return
    }

    const justResumed = !prevFollowingRef.current && isFollowing
    prevFollowingRef.current = isFollowing

    if (justResumed) {
      // Delay so setBearing (from CompassOrientation) applies first,
      // then center on user in the post-rotation coordinate space.
      const raf = requestAnimationFrame(() => {
        programmaticMoveRef.current = true
        map.setView([userLocation.lat, userLocation.lng], map.getZoom(), {
          animate: true,
          duration: 0.5,
        })
      })
      return () => cancelAnimationFrame(raf)
    }

    // Ongoing follow: smoothly glide the map to match GPS updates.
    // Use a duration that slightly overlaps with the GPS update interval
    // so pans blend together instead of looking like discrete jumps.
    const center = map.getCenter()
    const target = L.latLng(userLocation.lat, userLocation.lng)
    const pixelDist = map.latLngToContainerPoint(center).distanceTo(map.latLngToContainerPoint(target))
    if (pixelDist < 3) return
    programmaticMoveRef.current = true
    map.panTo(target, { animate: true, duration: 0.9, easeLinearity: 0.4 })
  }, [userLocation, isFollowing, map])

  // Clear programmatic flag after panTo finishes
  useEffect(() => {
    const onEnd = () => {
      if (programmaticMoveRef.current) programmaticMoveRef.current = false
    }
    map.on('moveend', onEnd)
    return () => { map.off('moveend', onEnd) }
  }, [map])

  // Expose recenter function
  useEffect(() => {
    if (onRecenterMap) {
      onRecenterMap(() => {
        if (userLocation) {
          programmaticMoveRef.current = true
          map.setView([userLocation.lat, userLocation.lng], map.getZoom(), {
            animate: true,
            duration: 0.5
          })
        }
      })
    }
  }, [map, userLocation, onRecenterMap])

  // Detect user interaction -> pause follow-mode (ignore programmatic pans)
  useEffect(() => {
    const pauseFollow = () => {
      if (programmaticMoveRef.current) return
      lastInteractionRef.current = Date.now()
      if (onFollowingChange) onFollowingChange(false)
    }
    map.on('dragstart', pauseFollow)
    map.on('zoomstart', pauseFollow)
    return () => {
      map.off('dragstart', pauseFollow)
      map.off('zoomstart', pauseFollow)
    }
  }, [map, onFollowingChange])

  // Inactivity auto-resume (0 = never)
  useEffect(() => {
    if (!followResumeDelay) return
    const interval = setInterval(() => {
      if (isFollowing) return
      if (anyPanelOpen || hasPopup) return
      if (Date.now() - lastInteractionRef.current >= followResumeDelay) {
        if (onFollowingChange) onFollowingChange(true)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [isFollowing, anyPanelOpen, hasPopup, onFollowingChange, followResumeDelay])

  // Monitor map viewport changes to detect county
  useEffect(() => {
    if (!onCountyChange) return

    const detectCounty = () => {
      try {
        const center = map.getCenter()
        if (!center || typeof center.lat !== 'number' || typeof center.lng !== 'number') return
        const county = getCountyFromCoords(center.lat, center.lng)
        onCountyChange(county)
      } catch (error) {
        console.error('Error detecting county:', error)
      }
    }

    const checkAndDetect = () => {
      try {
        const center = map.getCenter?.()
        if (center && typeof center.lat === 'number' && typeof center.lng === 'number') {
          detectCounty()
        } else {
          setTimeout(checkAndDetect, 100)
        }
      } catch {
        setTimeout(checkAndDetect, 100)
      }
    }

    map.whenReady(() => {
      setTimeout(checkAndDetect, 300)
    })

    let timeoutId = null
    const handleMapChange = () => {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(detectCounty, 300)
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

// Navigation icon SVG - arrow; base rotation -45° so tip points north
const NAVIGATION_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 19-9-9 19-2-8z"/></svg>`

/**
 * User location marker using a native Leaflet DivIcon in the markerPane.
 * leaflet-rotate places markerPane inside norotatePane, so the icon
 * stays at the correct geographic position without rotating with the map.
 * Arrow direction is updated imperatively on heading changes and map
 * rotation events so it always points in the user's heading relative to north.
 */
function LocationMarker({ position, heading, compassActive }) {
  const map = useMap()
  const markerRef = useRef(null)
  const arrowElRef = useRef(null)
  const headingRef = useRef(heading)
  headingRef.current = heading
  const compassActiveRef = useRef(compassActive)
  compassActiveRef.current = compassActive

  // Smooth interpolation state
  const animRef = useRef({
    from: null,     // { lat, lng }
    to: null,       // { lat, lng }
    startTime: 0,
    duration: 900,  // ms — slightly less than GPS update interval for overlap
    rafId: null,
  })

  useEffect(() => {
    if (!map) return

    const icon = L.divIcon({
      className: 'user-location-icon',
      html: `<div class="user-location-arrow-el">${NAVIGATION_ICON_SVG}</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    })

    const marker = L.marker([0, 0], { icon, interactive: false, keyboard: false })
    marker.addTo(map)
    markerRef.current = marker

    const el = marker.getElement()
    if (el) {
      arrowElRef.current = el.querySelector('.user-location-arrow-el')
    }

    return () => {
      if (animRef.current.rafId) cancelAnimationFrame(animRef.current.rafId)
      marker.remove()
      markerRef.current = null
      arrowElRef.current = null
    }
  }, [map])

  // Smoothly interpolate marker between GPS fixes
  useEffect(() => {
    if (!markerRef.current || !position) return
    const a = animRef.current
    const currentLatLng = a.to || (a.from ? a.from : null)

    if (!currentLatLng) {
      // First position — snap immediately
      markerRef.current.setLatLng([position.lat, position.lng])
      a.from = { lat: position.lat, lng: position.lng }
      a.to = { lat: position.lat, lng: position.lng }
      return
    }

    // Start a new interpolation from wherever the marker currently is
    if (a.rafId) cancelAnimationFrame(a.rafId)

    // Compute where the marker is right now mid-animation
    const now = performance.now()
    const elapsed = now - a.startTime
    const t = a.from && a.to && a.startTime
      ? Math.min(1, elapsed / a.duration)
      : 1
    const curLat = a.from.lat + (a.to.lat - a.from.lat) * t
    const curLng = a.from.lng + (a.to.lng - a.from.lng) * t

    a.from = { lat: curLat, lng: curLng }
    a.to = { lat: position.lat, lng: position.lng }
    a.startTime = now

    const animate = (ts) => {
      const progress = Math.min(1, (ts - a.startTime) / a.duration)
      // Ease-out cubic for natural deceleration
      const ease = 1 - Math.pow(1 - progress, 3)
      const lat = a.from.lat + (a.to.lat - a.from.lat) * ease
      const lng = a.from.lng + (a.to.lng - a.from.lng) * ease
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng])
      }
      if (progress < 1) {
        a.rafId = requestAnimationFrame(animate)
      } else {
        a.rafId = null
      }
    }
    a.rafId = requestAnimationFrame(animate)
  }, [position])

  // Update arrow rotation on heading changes and map rotation
  useEffect(() => {
    if (!map) return

    const updateArrow = () => {
      const arrow = arrowElRef.current
      if (!arrow) return
      const bearing = (typeof map.getBearing === 'function') ? (map.getBearing() || 0) : 0
      const h = compassActiveRef.current ? (headingRef.current ?? 0) : 0
      arrow.style.transform = `rotate(${-45 + h - bearing}deg)`
    }

    updateArrow()
    map.on('rotate', updateArrow)
    map.on('rotateend', updateArrow)

    return () => {
      map.off('rotate', updateArrow)
      map.off('rotateend', updateArrow)
    }
  }, [map, heading, compassActive])

  return null
}

function App() {
  const { currentUser, getToken, logout, loading: authLoading } = useAuth()
  
  // Debug: Log current user state
  useEffect(() => {
    console.log('🔐 App currentUser state:', currentUser ? currentUser.email : 'null', 'loading:', authLoading)
  }, [currentUser, authLoading])

  // Handle logout - close all panels and clear state
  const handleLogout = useCallback(async () => {
    console.log('🚪 Logging out...')
    try {
      // Close all panels before logout
      setIsListPanelOpen(false)
      setIsSkipTracedListPanelOpen(false)
      setIsParcelListPanelOpen(false)
      setIsParcelDetailsOpen(false)
      setIsEmailTemplatesPanelOpen(false)
      setIsTextTemplatesPanelOpen(false)
      setPhoneActionPanel(null)
      setIsEmailComposerOpen(false)
      setIsBulkEmailPreviewOpen(false)
      setIsMultiSelectActive(false)
      setIsPathTrackingActive(false)
      setIsPathsPanelOpen(false)
      setIsSettingsPanelOpen(false)
      setIsLeadsPanelOpen(false)
      setPickPipelineForParcel(null)
      setPaths([])
      setVisiblePathIds([])
      setSelectedParcels(new Set())
      setSelectedParcelsData(new Map())
      setClickedParcelId(null)
      setClickedParcelData(null)
      
      // Call Firebase logout
      await logout()
      console.log('✅ Logout successful')
    } catch (error) {
      console.error('❌ Logout error:', error)
    }
  }, [logout])
  const [isLoginOpen, setIsLoginOpen] = useState(false)
  const [isSignUpOpen, setIsSignUpOpen] = useState(false)
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false)
  const [permissionsReady, setPermissionsReady] = useState(() => hasGrantedPermissions())
  const [userLocation, setUserLocation] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [currentCounty, setCurrentCounty] = useState(null)
  const [pmtilesUrl, setPmtilesUrl] = useState(null)
  const [isListPanelOpen, setIsListPanelOpen] = useState(false)
  const [isSkipTracedListPanelOpen, setIsSkipTracedListPanelOpen] = useState(false)
  const [isParcelListPanelOpen, setIsParcelListPanelOpen] = useState(false)
  const [viewingListId, setViewingListId] = useState(null) // List ID being viewed in ParcelListPanel
  const [isParcelDetailsOpen, setIsParcelDetailsOpen] = useState(false) // Parcel details panel
  const [isEmailTemplatesPanelOpen, setIsEmailTemplatesPanelOpen] = useState(false)
  const [isTextTemplatesPanelOpen, setIsTextTemplatesPanelOpen] = useState(false)
  const [isEmailComposerOpen, setIsEmailComposerOpen] = useState(false)
  const [isBulkEmailPreviewOpen, setIsBulkEmailPreviewOpen] = useState(false)
  const [selectedEmailTemplate, setSelectedEmailTemplate] = useState(null)
  const [emailComposerParcelData, setEmailComposerParcelData] = useState(null)
  const [emailComposerRecipient, setEmailComposerRecipient] = useState({ email: '', name: '' })
  const [bulkEmailList, setBulkEmailList] = useState(null)
  const [bulkEmailListId, setBulkEmailListId] = useState(null)
  const [isSendingBulkEmails, setIsSendingBulkEmails] = useState(false)
  const [isMultiSelectActive, setIsMultiSelectActive] = useState(false)
  const [isCompassActive, setIsCompassActive] = useState(() => getSettings().compassDefault)
  const [isFollowing, setIsFollowing] = useState(() => getSettings().autoFollow)
  const { heading, requestOrientation, needsGesture } = useDeviceHeading(permissionsReady)
  const [selectedListIds, setSelectedListIds] = useState([]) // Max 20 lists highlighted with different colors
  const [selectedParcels, setSelectedParcels] = useState(new Set())
  const [selectedParcelsData, setSelectedParcelsData] = useState(new Map()) // Store full parcel data
  const [clickedParcelId, setClickedParcelId] = useState(null)
  const [clickedParcelData, setClickedParcelData] = useState(null) // Store full parcel data for popup
  const [lists, setLists] = useState([])
  const [showListSelector, setShowListSelector] = useState(false) // Show list selector in popup
  const [skipTracingInProgress, setSkipTracingInProgress] = useState(new Set()) // Track parcels being skip traced
  const [isDealPipelineOpen, setIsDealPipelineOpen] = useState(false)
  const [dealPipelineLeads, setDealPipelineLeads] = useState([])
  const [pipelines, setPipelines] = useState([])
  const [activePipelineId, setActivePipelineId] = useState(null)
  /** When set, user must pick a pipeline (multiple eligible). */
  const [pickPipelineForParcel, setPickPipelineForParcel] = useState(null)
  const [isSchedulePanelOpen, setIsSchedulePanelOpen] = useState(false)
  const [isTasksPanelOpen, setIsTasksPanelOpen] = useState(false)
  const [dealPipelineLeadFocusKey, setDealPipelineLeadFocusKey] = useState(0)
  const [dealPipelineFocusParcelId, setDealPipelineFocusParcelId] = useState(null)
  const [scheduleInitialDate, setScheduleInitialDate] = useState(null)
  const [phoneActionPanel, setPhoneActionPanel] = useState(null) // { phone, parcelData } | null
  const [isPathTrackingActive, setIsPathTrackingActive] = useState(false)
  const [isPathsPanelOpen, setIsPathsPanelOpen] = useState(false)
  const [paths, setPaths] = useState([])
  const [visiblePathIds, setVisiblePathIds] = useState([])
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false)
  const [isLeadsPanelOpen, setIsLeadsPanelOpen] = useState(false)
  const [settings, setSettings] = useState(() => getSettings())
  const pathTrackerRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const mapRef = useRef(null)
  const parcelLayerRef = useRef(null) // Reference to parcel layer functions
  const currentPopupRef = useRef(null) // Reference to current Leaflet popup
  const parcelDetailsSourceRef = useRef('map') // 'map' = opened from map popup, 'list' = opened from list panel

  const anyPanelOpen = isListPanelOpen || isParcelListPanelOpen || isParcelDetailsOpen ||
    isSkipTracedListPanelOpen || isEmailTemplatesPanelOpen || isTextTemplatesPanelOpen ||
    isEmailComposerOpen || isBulkEmailPreviewOpen || isDealPipelineOpen ||
    isSchedulePanelOpen || isTasksPanelOpen || isPathsPanelOpen || isSettingsPanelOpen || isLeadsPanelOpen
  const hasPopup = clickedParcelId != null

  const handleSettingsChange = useCallback((partial) => {
    const next = updateSettings(partial, getToken)
    setSettings(next)
  }, [getToken])

  // Task deadline local notifications (while app runs)
  useEffect(() => {
    if (!permissionsReady) return undefined
    const tick = () => {
      const g = getSettings()
      const n = g.notifications || {}
      if (!n.taskDeadline || typeof Notification === 'undefined' || Notification.permission !== 'granted') {
        return
      }
      const leadMs = (n.taskDeadlineLeadMinutes || 60) * 60 * 1000
      const tasks = getAllTasks()
      const now = Date.now()
      for (const t of tasks) {
        if (t.completed || !t.scheduledAt) continue
        const at =
          typeof t.scheduledAt === 'number' ? t.scheduledAt : new Date(t.scheduledAt).getTime()
        if (Number.isNaN(at)) continue
        if (now < at - leadMs || now >= at) continue
        const dayKey = new Date(at).toISOString().slice(0, 10)
        const lsKey = `taskDeadline:${t.id}:${dayKey}`
        try {
          if (localStorage.getItem(lsKey)) continue
          localStorage.setItem(lsKey, '1')
        } catch {
          continue
        }
        showLocalNotification('Task due soon', {
          body: `${(t.title || 'Task').toString().slice(0, 80)} — ${new Date(at).toLocaleString()}`,
          tag: `task-${t.id}-${dayKey}`
        })
      }
    }
    const id = setInterval(tick, 60000)
    tick()
    return () => clearInterval(id)
  }, [permissionsReady])

  // Recenter map function passed to MapController
  const recenterMapRef = useRef(null)
  const setRecenterMap = useCallback((func) => {
    recenterMapRef.current = func
  }, [])

  // Track user's current location in real-time (only after permissions granted)
  useEffect(() => {
    if (!permissionsReady) return
    let watchId = null
    let lastUpdateTime = 0
    const UPDATE_THROTTLE_MS = 1000

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          }
          setUserLocation(location)
          lastUpdateTime = Date.now()
        },
        (error) => {
          console.error('Error getting initial location:', error)
          setUserLocation({ lat: 32.7767, lng: -96.7970, accuracy: null })
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      )

      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const now = Date.now()
          if (now - lastUpdateTime < UPDATE_THROTTLE_MS) return

          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          }

          setUserLocation((prevLocation) => {
            if (!prevLocation) return location

            const latDiff = Math.abs(location.lat - prevLocation.lat)
            const lngDiff = Math.abs(location.lng - prevLocation.lng)
            const distanceMeters = Math.sqrt(
              Math.pow(latDiff * 111000, 2) +
              Math.pow(lngDiff * 111000 * Math.cos(location.lat * Math.PI / 180), 2)
            )

            if (distanceMeters >= 2) {
              lastUpdateTime = now
              return location
            }
            return prevLocation
          })
        },
        (error) => {
          console.error('Error watching location:', error)
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      )

    } else {
      setUserLocation({ lat: 32.7767, lng: -96.7970, accuracy: null })
    }

    return () => {
      if (watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId)
      }
    }
  }, [permissionsReady])

  // Load user data (deal pipeline, leads, tasks, notes, skip traced, etc.) when signed in
  useEffect(() => {
    if (!currentUser?.uid || !getToken) return
    loadUserData(getToken).then(() => {
      setDealPipelineLeads(loadLeads())
    })
  }, [currentUser?.uid, getToken])

  // Load user lists when signed in
  const refreshLists = useCallback(async () => {
    if (!currentUser) return
    try {
      const next = await fetchLists(getToken)
      setLists(next)
    } catch (error) {
      console.error('Error loading lists:', error)
    }
  }, [currentUser, getToken])

  useEffect(() => {
    if (currentUser) refreshLists()
    else setLists([])
  }, [currentUser, refreshLists])

  // Load user paths when signed in
  const refreshPaths = useCallback(async () => {
    if (!currentUser) return
    try {
      const next = await fetchPaths(getToken)
      setPaths(next)
    } catch (error) {
      console.error('Error loading paths:', error)
    }
  }, [currentUser, getToken])

  useEffect(() => {
    if (currentUser) refreshPaths()
    else { setPaths([]); setVisiblePathIds([]) }
  }, [currentUser, refreshPaths])

  const handleTogglePathTracking = useCallback(async () => {
    if (isPathTrackingActive) {
      const tracker = pathTrackerRef.current
      if (!tracker) {
        setIsPathTrackingActive(false)
        return
      }
      const rawPoints = tracker.getRawPoints()
      if (rawPoints.length < 2) {
        showToast('Path too short to save', 'warning')
        tracker.reset()
        setIsPathTrackingActive(false)
        return
      }
      try {
        const distance = totalDistanceMiles(rawPoints)
        const name = 'Path - ' + new Date().toLocaleString(undefined, {
          month: 'short', day: 'numeric', year: 'numeric',
          hour: 'numeric', minute: '2-digit'
        })
        await createPath(getToken, name, rawPoints, distance)
        const displayDist = settings.distanceUnit === 'km'
          ? `${Math.round(distance * 1.60934 * 100) / 100} km`
          : `${distance} mi`
        showToast(`Path saved (${displayDist})`, 'success')
        await refreshPaths()
      } catch (e) {
        console.error('Error saving path:', e)
        showToast(e.message || 'Failed to save path', 'error')
      }
      tracker.reset()
      setIsPathTrackingActive(false)
    } else {
      setIsPathTrackingActive(true)
      showToast('Recording path...', 'info')
    }
  }, [isPathTrackingActive, getToken, refreshPaths, settings.distanceUnit])

  const handleDeletePath = useCallback(async (path) => {
    const confirmed = await showConfirm({
      title: 'Delete path',
      message: `Delete "${path.name}"? This cannot be undone.`,
      confirmText: 'Delete',
      variant: 'danger'
    })
    if (!confirmed) return
    try {
      await deletePathApi(getToken, path.id)
      setVisiblePathIds(prev => prev.filter(id => id !== path.id))
      await refreshPaths()
      showToast('Path deleted', 'success')
    } catch (e) {
      showToast(e.message || 'Failed to delete path', 'error')
    }
  }, [getToken, refreshPaths])

  const handleRenamePath = useCallback(async (pathId, name) => {
    await renamePathApi(getToken, pathId, name)
    await refreshPaths()
  }, [getToken, refreshPaths])

  const handleTogglePathVisibility = useCallback((pathId) => {
    setVisiblePathIds(prev =>
      prev.includes(pathId) ? prev.filter(id => id !== pathId) : [...prev, pathId]
    )
  }, [])

  const refreshPipelines = useCallback(async () => {
    if (!currentUser) return
    try {
      const next = await fetchPipelines(getToken)
      if (next.length > 0) {
        setPipelines(next)
        setActivePipelineId((prev) => {
          if (prev && next.some((p) => p.id === prev)) return prev
          const first = next.find((p) => p.ownerId === currentUser.uid) || next[0]
          return first?.id ?? null
        })
      } else {
        const cols = loadColumns()
        const leads = loadLeads()
        const title = (() => {
          try { return localStorage.getItem('deal_pipeline_title') || 'Deal Pipeline' } catch { return 'Deal Pipeline' }
        })()
        if (leads.length > 0 || cols.some((c) => (c?.name || '').trim())) {
          try {
            const created = await createPipeline(getToken, { title, columns: cols, leads })
            setPipelines([created])
            setActivePipelineId(created.id)
            setDealPipelineLeads(created.leads || [])
          } catch (e) {
            console.warn('Pipeline migration failed:', e.message)
            setPipelines([])
            setActivePipelineId(null)
          }
        } else {
          setPipelines([])
          setActivePipelineId(null)
        }
      }
    } catch (error) {
      console.error('Error loading pipelines:', error)
      setPipelines([])
      setActivePipelineId(null)
    }
  }, [currentUser, getToken])

  useEffect(() => {
    if (currentUser) refreshPipelines()
    else {
      setPipelines([])
      setActivePipelineId(null)
    }
  }, [currentUser, refreshPipelines])

  // Load deal pipeline leads when panel opens (localStorage mode only; API mode uses pipelines)
  useEffect(() => {
    if (isDealPipelineOpen && pipelines.length === 0) setDealPipelineLeads(loadLeads())
  }, [isDealPipelineOpen, pipelines.length])

  // Refresh leads when schedule or tasks panel opens (localStorage mode only)
  useEffect(() => {
    if ((isSchedulePanelOpen || isTasksPanelOpen) && pipelines.length === 0) setDealPipelineLeads(loadLeads())
  }, [isSchedulePanelOpen, isTasksPanelOpen, pipelines.length])

  const isParcelALeadCheck = useCallback((parcelId) => {
    if (pipelines.length > 0) {
      return pipelines.some((p) => (p.leads || []).some((l) => l.parcelId === parcelId))
    }
    return isParcelALead(parcelId)
  }, [pipelines])

  const handleAddLeadToPipeline = useCallback(async (parcelData, pipelineId) => {
    const pipe = pipelines.find((p) => p.id === pipelineId)
    if (!pipe || !canAddLeadsToPipeline(currentUser, pipe)) {
      showToast('You cannot add leads to this pipeline', 'error')
      return
    }
    const firstColId = pipe.columns?.[0]?.id || 'col-0'
    const now = Date.now()
    const lead = {
      id: `lead-${now}-${parcelData.id}`,
      parcelId: parcelData.id,
      address: getStreetAddress(parcelData),
      owner: parcelData.properties?.OWNER_NAME || null,
      lat: parcelData.lat ?? (parcelData.properties?.LATITUDE ? parseFloat(parcelData.properties.LATITUDE) : null),
      lng: parcelData.lng ?? (parcelData.properties?.LONGITUDE ? parseFloat(parcelData.properties.LONGITUDE) : null),
      status: firstColId,
      createdAt: now,
      statusEnteredAt: now,
      cumulativeTimeByStatus: {},
      properties: parcelData.properties || null
    }
    try {
      await updatePipeline(getToken, pipelineId, { leads: [...(pipe.leads || []), lead] })
      await refreshPipelines()
      setActivePipelineId(pipelineId)
      setIsDealPipelineOpen(true)
      showToast('Parcel added to Deal Pipeline', 'success')
    } catch (e) {
      showToast(e.message || 'Could not add lead', 'error')
    }
  }, [currentUser, getToken, pipelines, refreshPipelines])

  const handleConvertToLead = useCallback(async (parcelData) => {
    if (!currentUser || !currentUser.uid) {
      setIsLoginOpen(true)
      showToast('Please sign in to use the Deal Pipeline', 'info')
      return
    }
    if (!parcelData?.id) {
      showToast('Invalid parcel data', 'error')
      return
    }
    if (isParcelALeadCheck(parcelData.id)) {
      showToast('Parcel is already a lead', 'warning')
      return
    }
    if (pipelines.length > 0) {
      const eligible = pipelines.filter((p) => canAddLeadsToPipeline(currentUser, p))
      if (eligible.length === 0) {
        showToast('You need a pipeline you own or can edit to add leads.', 'warning')
        return
      }
      if (eligible.length === 1) {
        await handleAddLeadToPipeline(parcelData, eligible[0].id)
        return
      }
      setPickPipelineForParcel({ parcelData, eligiblePipelines: eligible })
      return
    }
    const columns = loadColumns()
    const lead = addLead(parcelData, columns)
    if (lead) {
      setDealPipelineLeads(loadLeads())
      scheduleUserDataSync(getToken)
      setIsDealPipelineOpen(true)
      showToast('Parcel added to Deal Pipeline', 'success')
    } else {
      showToast('Could not add lead', 'error')
    }
  }, [currentUser, getToken, pipelines, isParcelALeadCheck, handleAddLeadToPipeline, scheduleUserDataSync])

  // Background polling for skip trace jobs
  useEffect(() => {
    // Clean up old jobs on mount
    cleanupOldJobs()
    scheduleUserDataSync(getToken)

    const processSkipTraceJob = async (job) => {
      try {
        console.log(`🔄 Processing skip trace job: ${job.jobId} for list "${job.listName}"`)
        
        // Update job status to processing
        updateSkipTraceJob(job.jobId, { status: 'processing' })
        scheduleUserDataSync(getToken)

        // Poll for results
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        const maxRetries = isMobile ? 120 : 60
        const interval = isMobile ? 6000 : 5000
        
        const results = await pollSkipTraceJobUntilComplete(job.jobId, maxRetries, interval)
        
        // Process results
        if (results.length === 0) {
          console.warn(`⚠️ Job ${job.jobId} completed but returned no results`)
          updateSkipTraceJob(job.jobId, {
            status: 'completed',
            results: [],
            completedAt: new Date().toISOString()
          })
          scheduleUserDataSync(getToken)
          
          // Remove from in progress
          setSkipTracingInProgress(prev => {
            const next = new Set(prev)
            job.parcelsToTrace.forEach(p => next.delete(p.parcelId))
            return next
          })
          
          showToast(`Skip trace completed for "${job.listName}", but no contact information was found.`, 'warning')
          notifySkipTraceComplete(job.listName, 'no contact information was found')
          return
        }

        // Address matching utilities (same as in handleBulkSkipTraceList)
        const parseAddress = (addressStr) => {
          if (!addressStr || !addressStr.trim()) return null
          const parts = addressStr.split(',').map(p => p.trim()).filter(p => p.length > 0)
          let street = addressStr
          let city = ''
          let state = 'TX'
          let zip = ''
          
          if (parts.length >= 3) {
            street = parts[0]
            city = parts[1]
            const lastPart = parts[parts.length - 1]
            const stateZipMatch = lastPart.match(/^([A-Z]{2})(\s+(\d{5}(?:-\d{4})?))?$/i)
            if (stateZipMatch) {
              state = stateZipMatch[1].toUpperCase()
              zip = stateZipMatch[3] || ''
            } else if (/^[A-Z]{2}$/i.test(lastPart)) {
              state = lastPart.toUpperCase()
            }
          } else if (parts.length === 2) {
            street = parts[0]
            const secondPart = parts[1]
            if (/^[A-Z]{2}$/i.test(secondPart)) {
              state = secondPart.toUpperCase()
              city = 'Fort Worth'
            } else {
              city = secondPart
              state = 'TX'
            }
          } else {
            street = parts[0]
            city = 'Fort Worth'
            state = 'TX'
          }
          
          if (!city) city = 'Fort Worth'
          if (!state) state = 'TX'
          
          return { street, city, state, zip }
        }
        
        const normalizeAddress = (addressStr) => {
          if (!addressStr) return ''
          return addressStr.toLowerCase().trim().replace(/\s+/g, ' ')
        }
        
        const buildAddressKey = (street, city, state) => {
          return normalizeAddress([street, city, state].filter(Boolean).join(', '))
        }
        
        // Match results to parcels
        const addressToParcelMap = new Map()
        job.parcelsToTrace.forEach(parcel => {
          const parsed = parseAddress(parcel.address)
          if (parsed) {
            const normalized = buildAddressKey(parsed.street, parsed.city, parsed.state)
            if (normalized) {
              if (!addressToParcelMap.has(normalized)) {
                addressToParcelMap.set(normalized, [])
              }
              addressToParcelMap.get(normalized).push(parcel)
            }
          }
        })
        
        const resultsWithParcelIds = []
        const matchedParcelIds = new Set()
        
        results.forEach((contactInfo) => {
          const matchKey = contactInfo.inputAddress || buildAddressKey(
            contactInfo.inputAddressRaw || '',
            contactInfo.inputCity || '',
            contactInfo.inputState || ''
          )
          
          if (matchKey && addressToParcelMap.has(matchKey)) {
            const matchingParcels = addressToParcelMap.get(matchKey)
            const matchedParcel = matchingParcels.find(p => !matchedParcelIds.has(p.parcelId))
            
            if (matchedParcel) {
              matchedParcelIds.add(matchedParcel.parcelId)
              resultsWithParcelIds.push({
                parcelId: matchedParcel.parcelId,
                phone: contactInfo.phone || null,
                email: contactInfo.email || null,
                phoneNumbers: contactInfo.phoneNumbers || (contactInfo.phone ? [contactInfo.phone] : []),
                emails: contactInfo.emails || (contactInfo.email ? [contactInfo.email] : []),
                address: contactInfo.address || null,
                skipTracedAt: new Date().toISOString()
              })
            }
          }
        })
        
        // Save results
        saveSkipTracedParcels(resultsWithParcelIds)
        scheduleUserDataSync(getToken)

        // Get list to add to skip traced list
        let list = null
        list = lists.find(l => l.id === job.listId)

        if (list) {
          const matchedParcelIdsSet = new Set(resultsWithParcelIds.map(r => r.parcelId))
          const skipTracedParcels = list.parcels.filter(p => {
            const pid = p.id || p.properties?.PROP_ID || p
            return matchedParcelIdsSet.has(pid)
          })
          
          if (skipTracedParcels.length > 0) {
            addListToSkipTracedList(job.listId, job.listName, skipTracedParcels)
            scheduleUserDataSync(getToken)
          }
        }

        // Update job status
        updateSkipTraceJob(job.jobId, {
          status: 'completed',
          results: resultsWithParcelIds,
          completedAt: new Date().toISOString()
        })
        scheduleUserDataSync(getToken)

        // Remove from in progress
        setSkipTracingInProgress(prev => {
          const next = new Set(prev)
          job.parcelsToTrace.forEach(p => next.delete(p.parcelId))
          return next
        })

        // Show success notification
        const matchedCount = resultsWithParcelIds.length
        const totalRequested = job.parcelsToTrace.length
        showToast(`✅ Skip trace completed for "${job.listName}": ${matchedCount} of ${totalRequested} parcel${totalRequested > 1 ? 's' : ''} found!`, 'success', 8000)
        notifySkipTraceComplete(job.listName, `${matchedCount} of ${totalRequested} parcel${totalRequested > 1 ? 's' : ''} found`)

      } catch (error) {
        console.error(`❌ Error processing skip trace job ${job.jobId}:`, error)
        updateSkipTraceJob(job.jobId, {
          status: 'failed',
          error: error.message,
          completedAt: new Date().toISOString()
        })
        scheduleUserDataSync(getToken)
        
        // Remove from in progress
        setSkipTracingInProgress(prev => {
          const next = new Set(prev)
          job.parcelsToTrace.forEach(p => next.delete(p.parcelId))
          return next
        })
        
        showToast(`❌ Skip trace failed for "${job.listName}": ${error.message}`, 'error', 8000)
      }
    }

    // Poll for pending jobs every 10 seconds
    const pollInterval = setInterval(() => {
      const pendingJobs = getPendingSkipTraceJobs()
      
      if (pendingJobs.length > 0) {
        console.log(`📋 Found ${pendingJobs.length} pending skip trace job(s)`)
        
        // Process jobs one at a time (don't process if one is already running)
        pendingJobs.forEach(job => {
          // Only process if status is pending (not already processing)
          if (job.status === 'pending') {
            processSkipTraceJob(job)
          }
        })
      }
    }, 10000) // Check every 10 seconds

    return () => {
      clearInterval(pollInterval)
    }
  }, [lists, getToken])

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

  const handleSharePipeline = useCallback(async (pipelineId, sharedWith) => {
    try {
      await updatePipeline(getToken, pipelineId, { sharedWith })
      await refreshPipelines()
      showToast('Pipeline sharing updated', 'success')
    } catch (error) {
      showToast(error.message || 'Failed to update sharing', 'error')
    }
  }, [getToken, refreshPipelines])

  const handleShareList = useCallback(async (listId, sharedWith) => {
    try {
      await updateList(getToken, listId, { sharedWith })
      await refreshLists()
      showToast('List sharing updated', 'success')
    } catch (error) {
      showToast(error.message || 'Failed to update sharing', 'error')
    }
  }, [getToken, refreshLists])

  // Delete a list (owner only)
  const handleDeleteList = useCallback(async (list) => {
    const listId = list?.id || list
    const listName = typeof list === 'object' ? list?.name : 'this list'
    const parcelCount = typeof list === 'object' ? (list?.parcels?.length ?? 0) : 0
    const parcelText = parcelCount === 1 ? '1 parcel' : `${parcelCount} parcels`
    setIsListPanelOpen(false)
    const confirmed = await showConfirm(
      `Are you sure you want to delete "${listName}" (${parcelText})? This cannot be undone.`,
      'Delete List'
    )
    setIsListPanelOpen(true)
    if (!confirmed) return
    try {
      await deleteList(getToken, listId)
      await refreshLists()
      setSelectedListIds(prev => prev.filter(id => id !== listId))
      showToast('List deleted', 'success')
    } catch (error) {
      showToast(error.message || 'Failed to delete list', 'error')
    }
  }, [getToken, refreshLists])

  // Handle parcel click
  const handleParcelClick = useCallback((event) => {
    // Wait for auth to finish loading before checking
    if (authLoading) {
      console.log('⏳ Auth still loading, ignoring parcel click')
      return
    }
    
    // Require authentication for parcel interactions
    if (!currentUser || !currentUser.uid) {
      console.log('❌ No current user, showing login prompt. currentUser:', currentUser, 'authLoading:', authLoading)
      setIsLoginOpen(true)
      showToast('Please sign in to interact with parcels', 'info')
      return
    }
    console.log('✅ User authenticated, allowing parcel interaction:', currentUser.email)

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
      
      // Check if parcel has been skip traced or is in progress
      const hasSkipTraced = isParcelSkipTraced(parcelId)
      const isSkipTracingInProgress = skipTracingInProgress.has(parcelId)
      
      const listsWithParcel = (lists || []).filter(l => 
        (l.parcels || []).some(p => (p.id || p) === parcelId)
      )
      const listNamesHtml = listsWithParcel.length > 0
        ? `<p style="margin: 4px 0; font-size: 12px;"><strong>In lists:</strong> ${listsWithParcel.map(l => l.name).join(', ')}</p>`
        : ''
      
      if (mapInstanceRef.current) {
        const popup = L.popup({ className: 'parcel-popup-liquid-glass', closeOnClick: false, closeButton: false })
          .setLatLng(latlng)
          .setContent(`
            <div style="min-width: 200px;" id="parcel-popup-${parcelId}">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                <h3 style="margin: 0; font-size: 14px; font-weight: 600;">Parcel Details</h3>
                <button type="button" onclick="window.closeParcelPopup()" class="parcel-popup-close-btn" title="Close" aria-label="Close" style="background: none; border: none; padding: 4px; cursor: pointer; color: rgba(255,255,255,0.9); display: flex; align-items: center; justify-content: center; font-size: 18px; line-height: 1;">&times;</button>
              </div>
              <p style="margin: 4px 0; font-size: 12px;"><strong>Address:</strong> ${address}</p>
              ${properties.OWNER_NAME ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Owner:</strong> ${properties.OWNER_NAME}</p>` : ''}
              ${age !== null ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Age:</strong> ${age} years</p>` : ''}
              ${listNamesHtml || '<p style="margin: 4px 0; font-size: 12px; color: #6b7280;"><strong>In lists:</strong> None</p>'}
              ${hasSkipTraced ? `<div style="margin: 8px 0; padding: 6px 8px; background: #dcfce7; border-radius: 8px; display: flex; align-items: center; gap: 6px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #16a34a;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg><span style="font-size: 12px; color: #16a34a; font-weight: 600;">Contact Found</span></div>` : ''}
              ${isSkipTracingInProgress ? `<div style="margin: 8px 0; padding: 6px 8px; background: #fef3c7; border-radius: 8px; display: flex; align-items: center; gap: 6px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #d97706;"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg><span style="font-size: 12px; color: #d97706; font-weight: 600;">Skip Tracing...</span></div>` : ''}
              <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.5); display: flex; flex-direction: column; gap: 8px;">
                <button 
                  id="more-details-btn-${parcelId}"
                  style="width: 100%; padding: 8px 12px; background: rgba(107,114,128,0.9); color: white; border: 1px solid rgba(255,255,255,0.3); border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;"
                  onclick="window.openParcelDetails()"
                >
                  More Details
                </button>
                ${!hasSkipTraced && !isSkipTracingInProgress ? `<button 
                  id="get-contact-btn-${parcelId}"
                  style="width: 100%; padding: 8px 12px; background: rgba(22,163,74,0.9); color: white; border: 1px solid rgba(255,255,255,0.3); border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;"
                  onclick="window.skipTraceParcel()"
                >
                  Get Contact
                </button>` : ''}
                <button 
                  id="add-to-list-btn-${parcelId}"
                  style="width: 100%; padding: 8px 12px; background: rgba(37,99,235,0.9); color: white; border: 1px solid rgba(255,255,255,0.3); border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;"
                  onclick="window.addParcelToList('${parcelId}')"
                >
                  Add to List
                </button>
                ${!isParcelALeadCheck(parcelId) ? `<button 
                  id="convert-to-lead-btn-${parcelId}"
                  style="width: 100%; padding: 8px 12px; background: rgba(124,58,237,0.9); color: white; border: 1px solid rgba(255,255,255,0.3); border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;"
                  onclick="window.convertToLead()"
                >
                  Convert to Lead
                </button>` : ''}
              </div>
            </div>
          `)
        
        // Store popup reference and open it
        currentPopupRef.current = popup
        popup.openOn(mapInstanceRef.current)

        // Smoothly center the map on the tapped parcel after a short delay
        const centerTimer = setTimeout(() => {
          if (mapInstanceRef.current && currentPopupRef.current === popup) {
            mapInstanceRef.current.panTo(latlng, { animate: true, duration: 0.5 })
          }
        }, 1500)
        
        // Clear popup reference and clicked parcel ID when popup is closed
        popup.on('remove', () => {
          clearTimeout(centerTimer)
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
  }, [isMultiSelectActive, lists, currentUser, authLoading, mapInstanceRef, skipTracingInProgress, showToast, isParcelALeadCheck])
  
  // Add single parcel to list (called from popup button)
  const handleAddSingleParcelToList = useCallback(async (listId) => {
    if (!clickedParcelData) {
      showToast('No parcel selected', 'error')
      return
    }
    const list = lists.find(l => l.id === listId)
    if (!list) {
      showToast('List not found', 'error')
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
    const existingIds = new Set((list.parcels || []).map(p => p.id || p))
    if (existingIds.has(parcelToAdd.id)) {
      showToast('Parcel already in this list', 'warning')
      return
    }
    try {
      await updateList(getToken, listId, { parcels: [...(list.parcels || []), parcelToAdd] })
      await refreshLists()
      showToast(`Added parcel to ${list.name}`, 'success')
      if (mapInstanceRef.current) mapInstanceRef.current.closePopup()
      if (currentPopupRef.current) currentPopupRef.current = null
      setClickedParcelId(null)
      setClickedParcelData(null)
      setShowListSelector(false)
      setIsListPanelOpen(false)
    } catch (error) {
      showToast(error.message || 'Failed to add parcel', 'error')
    }
  }, [clickedParcelData, lists, getToken, refreshLists])

  // Recenter map on user location and resume follow-mode
  const handleRecenter = useCallback(() => {
    setIsFollowing(true)
    if (recenterMapRef.current) {
      recenterMapRef.current()
    }
  }, [])

  const handleToggleCompass = useCallback(async () => {
    // On iOS, the first tap must grant orientation permission.
    // Absorb that tap instead of toggling so the user doesn't see compass flip off.
    if (needsGesture) {
      await requestOrientation()
      return
    }
    setIsCompassActive(prev => !prev)
  }, [needsGesture, requestOrientation])

  // Toggle multi-select mode
  const handleToggleMultiSelect = useCallback(() => {
    // Wait for auth to finish loading before checking
    if (authLoading) {
      console.log('⏳ Auth still loading, waiting...')
      return
    }
    
    // Require authentication for multi-select
    if (!currentUser || !currentUser.uid) {
      console.log('❌ No current user, showing login prompt for multi-select')
      setIsLoginOpen(true)
      showToast('Please sign in to use multi-select', 'info')
      return
    }
    console.log('✅ User authenticated, toggling multi-select:', currentUser.email)
    setIsMultiSelectActive(prev => !prev)
    setSelectedParcels(new Set()) // Clear selection when toggling mode
    setSelectedParcelsData(new Map()) // Clear parcel data
    setClickedParcelId(null) // Clear single click highlight
  }, [currentUser])

  // Add selected parcels to list
  const handleAddParcelsToList = useCallback(async (listId) => {
    const parcelIds = Array.from(selectedParcels)
    if (parcelIds.length === 0) {
      alert('No parcels selected')
      return
    }
    const list = lists.find(l => l.id === listId)
    if (!list) {
      showToast('List not found', 'error')
      return
    }
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
      return { id: parcelId, addedAt: new Date().toISOString() }
    })
    const existingIds = new Set((list.parcels || []).map(p => p.id || p))
    const uniqueNew = parcelsWithData.filter(p => !existingIds.has(p.id))
    if (uniqueNew.length === 0) {
      showToast('Selected parcels are already in this list', 'warning')
      return
    }
    try {
      await updateList(getToken, listId, { parcels: [...(list.parcels || []), ...uniqueNew] })
      await refreshLists()
      setSelectedParcels(new Set())
      setSelectedParcelsData(new Map())
      setIsMultiSelectActive(false)
      if (!selectedListIds.includes(listId)) {
        setSelectedListIds(prev => {
          const next = prev.filter(id => id !== listId).concat(listId)
          return next.slice(-5) // keep max 5
        })
      }
      showToast(`Added ${uniqueNew.length} parcels to ${list.name}`, 'success')
    } catch (error) {
      showToast(error.message || 'Failed to add parcels', 'error')
    }
  }, [selectedParcels, selectedParcelsData, lists, selectedListIds, getToken, refreshLists])

  // Remove parcel from list
  const handleRemoveParcelFromList = useCallback(async (listId, parcelId) => {
    const confirmed = await showConfirm(
      'Are you sure you want to remove this parcel from the list?',
      'Remove Parcel'
    )
    if (!confirmed) return
    const list = lists.find(l => l.id === listId)
    if (!list) {
      showToast('List not found', 'error')
      return
    }
    try {
      await updateList(getToken, listId, { removeParcels: [parcelId] })
      await refreshLists()
      if (!selectedListIds.includes(listId)) {
        setSelectedListIds(prev => {
          const next = prev.filter(id => id !== listId).concat(listId)
          return next.slice(-5) // keep max 5
        })
      }
      showToast('Parcel removed from list', 'success')
    } catch (error) {
      showToast(error.message || 'Failed to remove parcel', 'error')
    }
  }, [lists, selectedListIds, getToken, refreshLists])

  // Function to open parcel details (can accept parcel data or use clickedParcelData)
  const handleOpenParcelDetails = useCallback((parcelData = null) => {
    // Wait for auth to finish loading before checking
    if (authLoading) {
      console.log('⏳ Auth still loading, waiting...')
      return
    }
    
    // Require authentication to view parcel details
    if (!currentUser || !currentUser.uid) {
      console.log('❌ No current user, showing login prompt for parcel details')
      setIsLoginOpen(true)
      showToast('Please sign in to view parcel details', 'info')
      return
    }
    console.log('✅ User authenticated, opening parcel details:', currentUser.email)
    // Track source: from list (parcelData passed) vs map (popup)
    parcelDetailsSourceRef.current = parcelData ? 'list' : 'map'
    // If parcelData is provided (from list), use it; otherwise use clickedParcelData
    if (parcelData) {
      setClickedParcelData(parcelData)
    }
    // Close parcel popup when opening More Details panel (only exists when opened from map)
    if (mapInstanceRef.current && currentPopupRef.current) {
      mapInstanceRef.current.closePopup(currentPopupRef.current)
      currentPopupRef.current = null
    }
    setIsParcelDetailsOpen(true)
  }, [currentUser, authLoading])

  const handleDealPipelineFocusHandled = useCallback(() => {
    setDealPipelineFocusParcelId(null)
  }, [])

  const handleOpenTaskInDealPipeline = useCallback(({ pipelineId, parcelId, mode }) => {
    setIsTasksPanelOpen(false)
    setDealPipelineFocusParcelId(parcelId ?? null)
    if (mode === 'api' && pipelineId) {
      setActivePipelineId(pipelineId)
    }
    setDealPipelineLeadFocusKey((k) => k + 1)
    setIsDealPipelineOpen(true)
  }, [])

  const handlePhoneClick = useCallback((phone, parcelData) => {
    setPhoneActionPanel({ phone, parcelData: parcelData || null })
  }, [])

  // Reopen parcel popup (used when More Details is closed via X)
  const openParcelPopup = useCallback((data) => {
    if (!mapInstanceRef.current || !data) return
    const parcelId = data.id || data.properties?.PROP_ID
    const address = data.address || data.properties?.SITUS_ADDR || data.properties?.SITE_ADDR || data.properties?.ADDRESS || 'No address'
    const properties = data.properties || {}
    const latlng = L.latLng(data.lat ?? data.latlng?.lat, data.lng ?? data.latlng?.lng)
    const currentYear = new Date().getFullYear()
    const yearBuilt = properties.YEAR_BUILT ? parseInt(properties.YEAR_BUILT) : null
    const age = yearBuilt ? currentYear - yearBuilt : null
    const hasSkipTraced = isParcelSkipTraced(parcelId)
    const isSkipTracingInProgress = skipTracingInProgress.has(parcelId)
    const listsWithParcel = (lists || []).filter(l => (l.parcels || []).some(p => (p.id || p) === parcelId))
    const listNamesHtml = listsWithParcel.length > 0
      ? `<p style="margin: 4px 0; font-size: 12px;"><strong>In lists:</strong> ${listsWithParcel.map(l => l.name).join(', ')}</p>`
      : ''
    const popup = L.popup({ className: 'parcel-popup-liquid-glass', closeOnClick: false, closeButton: false })
      .setLatLng(latlng)
      .setContent(`
        <div style="min-width: 200px;" id="parcel-popup-${parcelId}">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <h3 style="margin: 0; font-size: 14px; font-weight: 600;">Parcel Details</h3>
            <button type="button" onclick="window.closeParcelPopup()" class="parcel-popup-close-btn" title="Close" aria-label="Close" style="background: none; border: none; padding: 4px; cursor: pointer; color: rgba(255,255,255,0.9); display: flex; align-items: center; justify-content: center; font-size: 18px; line-height: 1;">&times;</button>
          </div>
          <p style="margin: 4px 0; font-size: 12px;"><strong>Address:</strong> ${address}</p>
          ${properties.OWNER_NAME ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Owner:</strong> ${properties.OWNER_NAME}</p>` : ''}
          ${age !== null ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Age:</strong> ${age} years</p>` : ''}
          ${listNamesHtml || '<p style="margin: 4px 0; font-size: 12px; color: #6b7280;"><strong>In lists:</strong> None</p>'}
          ${hasSkipTraced ? `<div style="margin: 8px 0; padding: 6px 8px; background: #dcfce7; border-radius: 8px; display: flex; align-items: center; gap: 6px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #16a34a;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg><span style="font-size: 12px; color: #16a34a; font-weight: 600;">Contact Found</span></div>` : ''}
          ${isSkipTracingInProgress ? `<div style="margin: 8px 0; padding: 6px 8px; background: #fef3c7; border-radius: 8px; display: flex; align-items: center; gap: 6px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #d97706;"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg><span style="font-size: 12px; color: #d97706; font-weight: 600;">Skip Tracing...</span></div>` : ''}
          <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.5); display: flex; flex-direction: column; gap: 8px;">
            <button id="more-details-btn-${parcelId}" style="width: 100%; padding: 8px 12px; background: rgba(107,114,128,0.9); color: white; border: 1px solid rgba(255,255,255,0.3); border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;" onclick="window.openParcelDetails()">More Details</button>
            ${!hasSkipTraced && !isSkipTracingInProgress ? `<button id="get-contact-btn-${parcelId}" style="width: 100%; padding: 8px 12px; background: rgba(22,163,74,0.9); color: white; border: 1px solid rgba(255,255,255,0.3); border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;" onclick="window.skipTraceParcel()">Get Contact</button>` : ''}
            <button id="add-to-list-btn-${parcelId}" style="width: 100%; padding: 8px 12px; background: rgba(37,99,235,0.9); color: white; border: 1px solid rgba(255,255,255,0.3); border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;" onclick="window.addParcelToList('${parcelId}')">Add to List</button>
            ${!isParcelALeadCheck(parcelId) ? `<button id="convert-to-lead-btn-${parcelId}" style="width: 100%; padding: 8px 12px; background: rgba(124,58,237,0.9); color: white; border: 1px solid rgba(255,255,255,0.3); border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;" onclick="window.convertToLead()">Convert to Lead</button>` : ''}
          </div>
        </div>
      `)
    currentPopupRef.current = popup
    popup.openOn(mapInstanceRef.current)
    popup.on('remove', () => {
      if (currentPopupRef.current === popup) {
        currentPopupRef.current = null
        setClickedParcelId(null)
      }
    })
  }, [lists, skipTracingInProgress, isParcelALeadCheck])

  const handleCloseParcelPopup = useCallback(() => {
    if (mapInstanceRef.current && currentPopupRef.current) {
      mapInstanceRef.current.closePopup(currentPopupRef.current)
    }
    currentPopupRef.current = null
    setClickedParcelId(null)
    setClickedParcelData(null)
  }, [])

  const handleParcelDetailsClose = useCallback((options = {}) => {
    setIsParcelDetailsOpen(false)
    // Only reopen map popup when ParcelDetails was opened from map (More Details button), not from list
    const openedFromMap = parcelDetailsSourceRef.current === 'map'
    if (options.reopenPopup && openedFromMap && clickedParcelData && mapInstanceRef.current) {
      openParcelPopup(clickedParcelData)
    } else {
      setClickedParcelId(null)
      setClickedParcelData(null)
      if (currentPopupRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.closePopup(currentPopupRef.current)
      }
      currentPopupRef.current = null
    }
  }, [clickedParcelData, openParcelPopup])

  // Handle email click from parcel details
  const handleEmailClick = useCallback((email, parcelData) => {
    // Wait for auth to finish loading before checking
    if (authLoading) {
      console.log('⏳ Auth still loading, waiting...')
      return
    }
    
    // Require authentication for email features
    if (!currentUser || !currentUser.uid) {
      console.log('❌ No current user, showing login prompt for email')
      setIsLoginOpen(true)
      showToast('Please sign in to send emails', 'info')
      return
    }
    console.log('✅ User authenticated, opening email templates:', currentUser.email)
    // Open email templates panel to select a template (single parcel mode)
    setIsBulkEmailMode(false)
    setEmailComposerParcelData(parcelData)
    setEmailComposerRecipient({ email, name: parcelData?.properties?.OWNER_NAME || '' })
    setIsEmailTemplatesPanelOpen(true)
  }, [currentUser, authLoading])

  // Handle opening email templates from MapControls button (bulk mode)
  const handleOpenEmailTemplates = useCallback(() => {
    // Wait for auth to finish loading before checking
    if (authLoading) {
      console.log('⏳ Auth still loading, waiting...')
      return
    }
    
    if (!currentUser || !currentUser.uid) {
      console.log('❌ No current user, showing login prompt for email templates')
      setIsLoginOpen(true)
      return
    }
    console.log('✅ User authenticated, opening email templates:', currentUser.email)
    setIsBulkEmailMode(true)
    setEmailComposerParcelData(null)
    setEmailComposerRecipient({ email: '', name: '' })
    setBulkEmailList(null)
    setBulkEmailListId(null)
    setIsEmailTemplatesPanelOpen(true)
  }, [currentUser, authLoading])

  const handleOpenTextTemplates = useCallback(() => {
    if (authLoading) return
    if (!currentUser || !currentUser.uid) {
      setIsLoginOpen(true)
      return
    }
    setIsTextTemplatesPanelOpen(true)
  }, [currentUser, authLoading])

  // Handle email button click from list (opens template selection, then preview)
  const handleBulkEmailFromList = useCallback((listId) => {
    setBulkEmailListId(listId)
    setIsListPanelOpen(false)
    setIsBulkEmailMode(true)
    setEmailComposerParcelData(null)
    setEmailComposerRecipient({ email: '', name: '' })
    setIsEmailTemplatesPanelOpen(true)
  }, [])

  // Track if we're in bulk email mode
  const [isBulkEmailMode, setIsBulkEmailMode] = useState(false)

  // Handle template selection from EmailTemplatesPanel
  const handleTemplateSelect = useCallback(async (template) => {
    if (isBulkEmailMode) {
      if (bulkEmailListId) {
        setSelectedEmailTemplate(template)
        setIsEmailTemplatesPanelOpen(false)
        setIsListPanelOpen(false)
        try {
          const list = lists.find(l => l.id === bulkEmailListId)
          if (!list) {
            showToast('List not found', 'error')
            return
          }

          // Check if list has any parcels with emails
          const { getSkipTracedParcel } = await import('./utils/skipTrace')
          const parcelsWithEmails = list.parcels.filter(parcel => {
            const parcelId = parcel.id || parcel.properties?.PROP_ID || parcel
            const skipTracedInfo = getSkipTracedParcel(parcelId)
            return skipTracedInfo && skipTracedInfo.email
          })

          if (parcelsWithEmails.length === 0) {
            showToast('No parcels in this list have email addresses', 'warning')
            return
          }

          setBulkEmailList(list)
          setIsBulkEmailPreviewOpen(true)
        } catch (error) {
          console.error('Error showing preview:', error)
          showToast('Error loading list preview', 'error')
        }
      } else {
        // No list selected yet - prompt for list selection
        setSelectedEmailTemplate(template)
        setIsEmailTemplatesPanelOpen(false)
        setIsListPanelOpen(true)
        setShowListSelector(true)
        showToast('Select a list to email', 'info')
      }
    } else {
      setSelectedEmailTemplate(template)
      setIsEmailTemplatesPanelOpen(false)
      setIsEmailComposerOpen(true)
    }
  }, [isBulkEmailMode, bulkEmailListId, lists])

  // Handle list selection for bulk email (after template is selected)
  const handleBulkEmailListSelected = useCallback(async (listId) => {
    if (!selectedEmailTemplate) {
      showToast('No template selected', 'error')
      return
    }
    const list = lists.find(l => l.id === listId)
    if (!list || !list.parcels || list.parcels.length === 0) {
      showToast('List is empty', 'warning')
      return
    }

    // Check if list has any parcels with emails
    const { getSkipTracedParcel } = await import('./utils/skipTrace')
    const parcelsWithEmails = list.parcels.filter(parcel => {
      const parcelId = parcel.id || parcel.properties?.PROP_ID || parcel
      const skipTracedInfo = getSkipTracedParcel(parcelId)
      return skipTracedInfo && skipTracedInfo.email
    })

    if (parcelsWithEmails.length === 0) {
      showToast('No parcels in this list have email addresses', 'warning')
      return
    }

    setBulkEmailList(list)
    setBulkEmailListId(listId)
    setIsListPanelOpen(false)
    setShowListSelector(false)
    setIsBulkEmailPreviewOpen(true)
  }, [selectedEmailTemplate, lists])

  // Handle bulk email confirmation from preview panel
  const handleBulkEmailConfirm = useCallback(async ({ template, listId }) => {
    if (!template) {
      showToast('No template selected', 'error')
      return
    }
    const testMode = settings.emailTestMode && settings.defaultEmail
    const list = lists.find(l => l.id === listId)
    if (!list || !list.parcels || list.parcels.length === 0) {
      showToast('List is empty', 'warning')
      return
    }

    const { getSkipTracedParcel } = await import('./utils/skipTrace')
    const { replaceTemplateTags } = await import('./utils/emailTemplates')

    const parcelsWithEmails = []
    for (const parcel of list.parcels) {
      const parcelId = parcel.id || parcel.properties?.PROP_ID || parcel
      const skipTracedInfo = getSkipTracedParcel(parcelId)
      
      if (skipTracedInfo && skipTracedInfo.email) {
        parcelsWithEmails.push({
          parcel,
          email: skipTracedInfo.email,
          skipTracedInfo
        })
      }
    }

    if (parcelsWithEmails.length === 0) {
      showToast('No parcels in this list have email addresses', 'warning')
      return
    }

    const confirmMsg = testMode
      ? `Send email to ${parcelsWithEmails.length} parcel${parcelsWithEmails.length > 1 ? 's' : ''} in "${list.name}"? (Test mode - all emails will go to ${settings.defaultEmail})`
      : `Send email to ${parcelsWithEmails.length} parcel${parcelsWithEmails.length > 1 ? 's' : ''} in "${list.name}"?`
    const confirmed = await showConfirm(confirmMsg, 'Bulk Email')
    if (!confirmed) return

    let sentCount = 0
    for (const { parcel, email, skipTracedInfo } of parcelsWithEmails) {
      const parcelData = {
        id: parcel.id || parcel.properties?.PROP_ID || parcel,
        properties: parcel.properties || parcel,
        address: parcel.address || parcel.properties?.SITUS_ADDR || parcel.properties?.SITE_ADDR || '',
        ownerName: parcel.properties?.OWNER_NAME || ''
      }

      const subject = replaceTemplateTags(template.subject || '', parcelData)
      const body = replaceTemplateTags(template.body || '', parcelData)

      const recipient = testMode ? settings.defaultEmail : email
      const mailtoLink = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      
      window.open(mailtoLink, '_blank')
      sentCount++

      if (sentCount < parcelsWithEmails.length) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    const toastMsg = testMode
      ? `Successfully sent ${sentCount} email${sentCount > 1 ? 's' : ''} to ${settings.defaultEmail}!`
      : `Successfully sent ${sentCount} email${sentCount > 1 ? 's' : ''}!`
    showToast(toastMsg, 'success', 8000)
    
    // Reset state
    setSelectedEmailTemplate(null)
    setIsListPanelOpen(false)
    setShowListSelector(false)
    setIsBulkEmailMode(false)
    setIsBulkEmailPreviewOpen(false)
    setBulkEmailList(null)
    setBulkEmailListId(null)
    setIsSendingBulkEmails(false)
  }, [lists, settings.emailTestMode, settings.defaultEmail])

  // Handle export list as CSV and email to user
  const handleExportList = useCallback(async (listId) => {
    const list = lists.find(l => l.id === listId)
    if (!list) {
      showToast('List not found', 'error')
      return
    }

    if (!list.parcels || list.parcels.length === 0) {
      showToast('List is empty', 'warning')
      return
    }

    if (!currentUser?.email) {
      showToast('Please sign in to export lists', 'error')
      return
    }

    const exportEmail = (settings.defaultEmail && settings.emailTestMode) ? settings.defaultEmail : currentUser.email

    try {
      const csvContent = listToCsv(list)
      const res = await fetch('/api/export-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listName: list.name,
          csvContent,
          userEmail: exportEmail
        })
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.message || data.error || `Export failed (${res.status})`)
      }

      showToast(`Export sent to ${exportEmail}`, 'success')
    } catch (err) {
      console.error('Export list error:', err)
      showToast(err.message || 'Failed to export list', 'error')
    }
  }, [lists, currentUser, settings.emailTestMode, settings.defaultEmail])

  const handleBulkEmailList = useCallback(async (listId) => {
    await handleBulkEmailListSelected(listId)
  }, [handleBulkEmailListSelected])

  const handleBulkSkipTraceList = useCallback(async (listId) => {
    try {
      const list = lists.find(l => l.id === listId)
      if (!list || !list.parcels || list.parcels.length === 0) {
        showToast('List is empty', 'warning')
        return
      }

      // Prepare parcels for skip tracing (filter out already skip traced ones)
      const parcelsToTrace = list.parcels
        .filter(parcel => {
          const parcelId = parcel.id || parcel
          return !isParcelSkipTraced(parcelId)
        })
        .map(parcel => {
          const parcelId = parcel.id || parcel
          const props = parcel.properties || parcel
          // Use MAIL_ADDR for skip tracing (has full address with city, state, zip)
          const address = props.MAIL_ADDR || props.MAILING_ADDR || parcel.address || props.SITUS_ADDR || props.SITE_ADDR || props.ADDRESS || ''
          const ownerName = props.OWNER_NAME || ''
          return { parcelId, address, ownerName }
        })
        .filter(p => p.address) // Only include parcels with addresses

      if (parcelsToTrace.length === 0) {
        showToast('No parcels to skip trace (all already traced or missing addresses)', 'info')
        return
      }

      const confirmed = await showConfirm(
        `Skip trace ${parcelsToTrace.length} parcel${parcelsToTrace.length > 1 ? 's' : ''} from "${list.name}"? This will run in the background and you'll be notified when complete.`,
        'Bulk Skip Trace'
      )
      if (!confirmed) {
        return
      }

      // Mark all as in progress
      setSkipTracingInProgress(prev => {
        const next = new Set(prev)
        parcelsToTrace.forEach(p => next.add(p.parcelId))
        return next
      })

      showToast(`Starting bulk skip trace for ${parcelsToTrace.length} parcels...`, 'info', 3000)
      
      try {
        // Submit skip trace job
        const result = await skipTraceParcels(parcelsToTrace)
        
        if (!result.jobId) {
          throw new Error('No job ID returned')
        }

        // Add job to background tracking
        addSkipTraceJob({
          jobId: result.jobId,
          listId,
          listName: list.name,
          parcelsToTrace,
          status: 'pending'
        })
        scheduleUserDataSync(getToken)

        showToast(`Skip trace job submitted for ${parcelsToTrace.length} parcels. You'll be notified when it completes.`, 'success', 5000)
      } catch (error) {
        console.error('Bulk skip trace submission error:', error)
        showToast(`Failed to submit skip trace job: ${error.message}`, 'error')
        // Remove from in progress on error
        setSkipTracingInProgress(prev => {
          const next = new Set(prev)
          parcelsToTrace.forEach(p => next.delete(p.parcelId))
          return next
        })
      }
      
    } catch (error) {
      console.error('Bulk skip trace error:', error)
      showToast(`Bulk skip trace failed: ${error.message}`, 'error')
    }
  }, [lists, skipTracingInProgress])

  // Handle skip tracing a single parcel (from popup or list)
  const handleSkipTraceParcel = useCallback(async (parcelData) => {
    if (!parcelData) {
      showToast('No parcel selected', 'error')
      return
    }

    // Wait for auth to finish loading before checking
    if (authLoading) {
      console.log('⏳ Auth still loading, waiting...')
      return
    }

    const parcelId = parcelData.id
    // Use MAIL_ADDR for skip tracing (has full address with city, state, zip)
    const address = parcelData.properties?.MAIL_ADDR || parcelData.properties?.MAILING_ADDR || parcelData.address || parcelData.properties?.SITUS_ADDR || parcelData.properties?.SITE_ADDR || parcelData.properties?.ADDRESS || ''
    const ownerName = parcelData.properties?.OWNER_NAME || ''

    if (!address) {
      showToast('Parcel mailing address is required for skip tracing', 'error')
      return
    }

    // Check if already skip traced
    if (isParcelSkipTraced(parcelId)) {
      showToast('This parcel has already been skip traced', 'info')
      return
    }

    // Check if already in progress
    if (skipTracingInProgress.has(parcelId)) {
      showToast('Skip trace already in progress for this parcel', 'info')
      return
    }

    try {
      // Mark as in progress
      setSkipTracingInProgress(prev => new Set(prev).add(parcelId))
      
      showToast('Starting skip trace...', 'info', 2000)
      
      // Submit skip trace job
      const result = await skipTraceParcels([{ parcelId, address, ownerName }])
      
      if (!result.jobId) {
        throw new Error('No job ID returned')
      }

      // For synchronous jobs (jobId === 'sync'), results are returned immediately
      let results = []
      if (result.jobId === 'sync' && result.async === false && result.results) {
        // Results are already in the response, no need to poll
        console.log('✅ Synchronous skip trace - results returned immediately')
        results = result.results || []
      } else {
        // Asynchronous job - poll for results
        showToast('Skip trace submitted. Waiting for results...', 'info', 5000)
        
        // Poll for results (with timeout)
        // Use longer timeout on mobile to account for slower networks and background throttling
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        const maxRetries = isMobile ? 60 : 30 // Double retries on mobile
        const interval = isMobile ? 6000 : 5000 // Slightly longer interval on mobile
        
        results = await pollSkipTraceJobUntilComplete(result.jobId, maxRetries, interval)
      }
      
      // Note: Empty results array is valid - it means no contact info was found
      // Only throw error if we actually got an error, not if results are empty
      if (results.length === 0) {
        console.warn('⚠️ Skip trace completed but returned no results. This may mean no contact information was found for this parcel.')
        // Don't throw error - empty results is a valid outcome
        showToast('Skip trace completed, but no contact information was found for this parcel.', 'warning')
        return
      }

      const contactInfo = results[0]
      
      console.log('💾 Saving skip trace results for parcel:', parcelId)
      console.log('📞 Contact info from API:', {
        phone: contactInfo.phone,
        phoneNumbers: contactInfo.phoneNumbers,
        phoneNumbersLength: contactInfo.phoneNumbers?.length || 0,
        email: contactInfo.email,
        emails: contactInfo.emails,
        emailsLength: contactInfo.emails?.length || 0,
        address: contactInfo.address,
        fullContactInfo: contactInfo
      })
      
      // Ensure phoneNumbers is an array
      const phoneNumbers = Array.isArray(contactInfo.phoneNumbers) 
        ? contactInfo.phoneNumbers 
        : (contactInfo.phone ? [contactInfo.phone] : [])
      
      // Ensure emails is an array
      const emails = Array.isArray(contactInfo.emails)
        ? contactInfo.emails
        : (contactInfo.email ? [contactInfo.email] : [])
      
      // Save to global list
      const dataToSave = {
        phone: contactInfo.phone || phoneNumbers[0] || null,
        email: contactInfo.email || emails[0] || null,
        phoneNumbers: phoneNumbers,
        emails: emails,
        address: contactInfo.address || null,
        skipTracedAt: new Date().toISOString()
      }
      
      console.log('💾 Data being saved:', dataToSave)
      
      saveSkipTracedParcel(parcelId, dataToSave)
      scheduleUserDataSync(getToken)

      // Verify it was saved
      const saved = getSkipTracedParcel(parcelId)
      console.log('✅ Verified saved skip trace data:', saved)
      console.log('📞 Saved phone:', saved?.phone, 'phoneNumbers:', saved?.phoneNumbers)

      // Add to skip traced list
      addParcelToSkipTracedList(parcelData)
      scheduleUserDataSync(getToken)

      showToast('Skip trace completed successfully!', 'success')
      
      // Update clicked parcel data if it's the current parcel (for both map popup and list)
      if (clickedParcelData && clickedParcelData.id === parcelId) {
        setClickedParcelData({
          ...clickedParcelData,
          skipTraced: getSkipTracedParcel(parcelId)
        })
      }
      
      // Refresh popup to show status icon
      if (mapInstanceRef.current && clickedParcelId === parcelId && clickedParcelData) {
        // Get latlng - could be in latlng property or lat/lng properties
        const latlng = clickedParcelData.latlng || (clickedParcelData.lat && clickedParcelData.lng ? [clickedParcelData.lat, clickedParcelData.lng] : null)
        
        if (!latlng) {
          console.warn('Cannot refresh popup: missing latlng', clickedParcelData)
          return
        }
        
        const address = clickedParcelData.address || clickedParcelData.properties?.SITUS_ADDR || clickedParcelData.properties?.SITE_ADDR || clickedParcelData.properties?.ADDRESS || 'No address'
        const properties = clickedParcelData.properties || {}
        const parcelIdForPopup = clickedParcelData.id
        
        // Calculate age
        const currentYear = new Date().getFullYear()
        const yearBuilt = properties.YEAR_BUILT ? parseInt(properties.YEAR_BUILT) : null
        const age = yearBuilt ? currentYear - yearBuilt : null
        
        const hasSkipTraced = isParcelSkipTraced(parcelIdForPopup)
        const listsWithParcelForPopup = (lists || []).filter(l =>
          (l.parcels || []).some(p => (p.id || p) === parcelIdForPopup)
        )
        const listNamesHtmlForPopup = listsWithParcelForPopup.length > 0
          ? `<p style="margin: 4px 0; font-size: 12px;"><strong>In lists:</strong> ${listsWithParcelForPopup.map(l => l.name).join(', ')}</p>`
          : '<p style="margin: 4px 0; font-size: 12px; color: #6b7280;"><strong>In lists:</strong> None</p>'
        
        if (mapInstanceRef.current) {
          // Convert latlng to L.LatLng if it's an array
          const leafletLatLng = Array.isArray(latlng) ? L.latLng(latlng[0], latlng[1]) : latlng
          
          const popup = L.popup({ className: 'parcel-popup-liquid-glass', closeOnClick: false, closeButton: false })
            .setLatLng(leafletLatLng)
            .setContent(`
              <div style="min-width: 200px;" id="parcel-popup-${parcelIdForPopup}">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                  <h3 style="margin: 0; font-size: 14px; font-weight: 600;">Parcel Details</h3>
                  <button type="button" onclick="window.closeParcelPopup()" class="parcel-popup-close-btn" title="Close" aria-label="Close" style="background: none; border: none; padding: 4px; cursor: pointer; color: rgba(255,255,255,0.9); display: flex; align-items: center; justify-content: center; font-size: 18px; line-height: 1;">&times;</button>
                </div>
                <p style="margin: 4px 0; font-size: 12px;"><strong>Address:</strong> ${address}</p>
                ${properties.OWNER_NAME ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Owner:</strong> ${properties.OWNER_NAME}</p>` : ''}
                ${age !== null ? `<p style="margin: 4px 0; font-size: 12px;"><strong>Age:</strong> ${age} years</p>` : ''}
                ${listNamesHtmlForPopup || '<p style="margin: 4px 0; font-size: 12px; color: #6b7280;"><strong>In lists:</strong> None</p>'}
                ${hasSkipTraced ? `<div style="margin: 8px 0; padding: 6px 8px; background: #dcfce7; border-radius: 8px; display: flex; align-items: center; gap: 6px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #16a34a;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg><span style="font-size: 12px; color: #16a34a; font-weight: 600;">Contact Found</span></div>` : ''}
                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.5); display: flex; flex-direction: column; gap: 8px;">
                  <button 
                  id="more-details-btn-${parcelIdForPopup}"
                  style="width: 100%; padding: 8px 12px; background: rgba(107,114,128,0.9); color: white; border: 1px solid rgba(255,255,255,0.3); border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;"
                  onclick="window.openParcelDetails()"
                >
                  More Details
                </button>
                ${!hasSkipTraced ? `<button 
                  id="get-contact-btn-${parcelIdForPopup}"
                  style="width: 100%; padding: 8px 12px; background: rgba(22,163,74,0.9); color: white; border: 1px solid rgba(255,255,255,0.3); border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;"
                  onclick="window.skipTraceParcel()"
                >
                  Get Contact
                </button>` : ''}
                <button 
                  id="add-to-list-btn-${parcelIdForPopup}"
                    style="width: 100%; padding: 8px 12px; background: rgba(37,99,235,0.9); color: white; border: 1px solid rgba(255,255,255,0.3); border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;"
                    onclick="window.addParcelToList('${parcelId}')"
                  >
                    Add to List
                  </button>
                ${!isParcelALeadCheck(parcelIdForPopup) ? `<button 
                  id="convert-to-lead-btn-${parcelIdForPopup}"
                  style="width: 100%; padding: 8px 12px; background: rgba(124,58,237,0.9); color: white; border: 1px solid rgba(255,255,255,0.3); border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;"
                  onclick="window.convertToLead()"
                >
                  Convert to Lead
                </button>` : ''}
                </div>
              </div>
            `)
            .openOn(mapInstanceRef.current)
        }
      }
    } catch (error) {
      console.error('Skip trace error:', error)
      showToast(`Skip trace failed: ${error.message}`, 'error')
    } finally {
      // Remove from in progress
      setSkipTracingInProgress(prev => {
        const next = new Set(prev)
        next.delete(parcelId)
        return next
      })
    }
  }, [clickedParcelData, clickedParcelId, skipTracingInProgress, lists, isParcelALeadCheck])

  // Expose function to window for popup button
  useEffect(() => {
    window.openParcelDetails = handleOpenParcelDetails
    window.closeParcelPopup = handleCloseParcelPopup
    window.addParcelToList = () => {
      setShowListSelector(true)
      setIsListPanelOpen(true)
    }
    window.skipTraceParcel = () => {
      if (clickedParcelData) {
        handleSkipTraceParcel(clickedParcelData)
      }
    }
    window.convertToLead = () => {
      if (clickedParcelData) {
        handleConvertToLead(clickedParcelData)
      }
    }
    return () => {
      delete window.openParcelDetails
      delete window.closeParcelPopup
      delete window.addParcelToList
      delete window.skipTraceParcel
      delete window.convertToLead
    }
  }, [handleOpenParcelDetails, handleCloseParcelPopup, handleSkipTraceParcel, handleConvertToLead, clickedParcelData])

  return (
    <UserDataSyncProvider getToken={getToken}>
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 'var(--vw-height, 100vh)' }}>
      {!permissionsReady && (
        <PermissionPrompt onComplete={() => setPermissionsReady(true)} />
      )}
      {permissionsReady && (
        <NotificationPrompt getToken={getToken} />
      )}
      {/* Map layer - explicitly at z-index 0 so dialogs/panels appear above */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <MapContainer
        center={userLocation || [32.7767, -96.7970]}
        zoom={settings.defaultZoom}
        minZoom={1}
        maxZoom={20}
        style={{ height: '100%', minHeight: 'var(--vw-height, 100vh)', width: '100%' }}
        zoomControl={false}
        attributionControl={false}
        rotate={true}
        rotateControl={false}
        touchRotate={true}
      >
        <>
          {settings.mapStyle === 'street' ? (
            <TileLayer
              key="street"
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              subdomains="abcd"
              maxZoom={20}
              maxNativeZoom={19}
              keepBuffer={6}
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
            />
          ) : (
            <>
              <TileLayer
                key="satellite"
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                maxNativeZoom={19}
                maxZoom={22}
                keepBuffer={6}
                attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
              />
              <TileLayer
                key="labels"
                url={settings.mapStyle === 'hybrid'
                  ? "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png"
                  : "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png"
                }
                subdomains="abcd"
                maxZoom={20}
                maxNativeZoom={19}
                keepBuffer={6}
                opacity={1}
                className="satellite-labels-layer"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
              />
            </>
          )}
        </>
        <ZoomControl position="topleft" />
        <MapController 
          userLocation={userLocation}
          onMapReady={(map) => { 
            mapInstanceRef.current = map
            mapRef.current = map
          }}
          onRecenterMap={setRecenterMap}
          onCountyChange={handleCountyChange}
          isFollowing={isFollowing}
          anyPanelOpen={anyPanelOpen}
          hasPopup={hasPopup}
          onFollowingChange={setIsFollowing}
          followResumeDelay={settings.followResumeDelay}
        />
        <CompassOrientation isActive={isCompassActive} heading={heading} isFollowing={isFollowing} />
        <NorthIndicator />
        {pmtilesUrl && (
          <PMTilesParcelLayer 
            pmtilesUrl={pmtilesUrl}
            onParcelClick={handleParcelClick}
            clickedParcelId={clickedParcelId}
            selectedParcels={selectedParcels}
            selectedListIds={selectedListIds}
            lists={lists}
            onLayerReady={(layerFunctions) => {
              parcelLayerRef.current = layerFunctions
            }}
          />
        )}
        <PathTracker
          ref={pathTrackerRef}
          isTracking={isPathTrackingActive}
          userLocation={userLocation}
          savedPathsToShow={paths.filter(p => visiblePathIds.includes(p.id))}
          smoothingLevel={settings.pathSmoothing}
        />
        {userLocation && (
          <LocationMarker
            position={userLocation}
            heading={heading}
            compassActive={isCompassActive}
          />
        )}
      </MapContainer>
      </div>

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
        onToggleCompass={handleToggleCompass}
        isCompassActive={isCompassActive}
        onToggleMultiSelect={handleToggleMultiSelect}
        isMultiSelectActive={isMultiSelectActive}
        onOpenListPanel={() => {
          // Wait for auth to finish loading before checking
          if (authLoading) {
            console.log('⏳ Auth still loading, waiting...')
            return
          }
          
          if (!currentUser || !currentUser.uid) {
            console.log('❌ No current user, showing login prompt for list panel')
            setIsLoginOpen(true)
            return
          }
          console.log('✅ User authenticated, opening list panel:', currentUser.email)
          setIsListPanelOpen(true)
        }}
        selectedListIds={selectedListIds}
        onOpenSkipTracedListPanel={() => {
          // Wait for auth to finish loading before checking
          if (authLoading) {
            console.log('⏳ Auth still loading, waiting...')
            return
          }
          
          if (!currentUser || !currentUser.uid) {
            console.log('❌ No current user, showing login prompt for skip traced list')
            setIsLoginOpen(true)
            return
          }
          console.log('✅ User authenticated, opening skip traced list:', currentUser.email)
          setIsSkipTracedListPanelOpen(true)
        }}
        onOpenEmailTemplates={handleOpenEmailTemplates}
        onOpenTextTemplates={handleOpenTextTemplates}
        onOpenDealPipeline={() => {
          if (authLoading) return
          if (!currentUser || !currentUser.uid) {
            setIsLoginOpen(true)
            return
          }
          setIsDealPipelineOpen(true)
        }}
        onOpenTasks={() => {
          if (authLoading) return
          if (!currentUser || !currentUser.uid) {
            setIsLoginOpen(true)
            return
          }
          setIsTasksPanelOpen(true)
        }}
        onOpenSchedule={() => {
          if (authLoading) return
          if (!currentUser || !currentUser.uid) {
            setIsLoginOpen(true)
            return
          }
          setIsSchedulePanelOpen(true)
        }}
        onTogglePathTracking={() => {
          if (authLoading) return
          if (!currentUser || !currentUser.uid) {
            setIsLoginOpen(true)
            return
          }
          handleTogglePathTracking()
        }}
        isPathTrackingActive={isPathTrackingActive}
        onOpenPathsPanel={() => {
          if (authLoading) return
          if (!currentUser || !currentUser.uid) {
            setIsLoginOpen(true)
            return
          }
          setIsPathsPanelOpen(true)
        }}
        onOpenSettings={() => setIsSettingsPanelOpen(true)}
        onOpenLeads={() => setIsLeadsPanelOpen(true)}
        currentUser={currentUser}
        onLogin={() => setIsLoginOpen(true)}
        onLogout={logout}
      />

      <ListPanel
        currentUser={currentUser}
        isOpen={isListPanelOpen && !isParcelListPanelOpen}
        onClose={() => {
          setIsListPanelOpen(false)
          setShowListSelector(false)
          setClickedParcelData(null)
        }}
        selectedListIds={selectedListIds}
        onToggleListHighlight={(listId) => {
          setSelectedListIds(prev => {
            if (prev.includes(listId)) return prev.filter(id => id !== listId)
            if (prev.length >= 20) return prev
            return [...prev, listId]
          })
        }}
        onAddParcelsToList={showListSelector && clickedParcelData 
          ? handleAddSingleParcelToList 
          : (showListSelector && selectedEmailTemplate 
            ? handleBulkEmailListSelected
            : handleAddParcelsToList)}
        selectedParcelsCount={showListSelector && clickedParcelData ? 1 : selectedParcels.size}
        lists={lists}
        onListsChange={refreshLists}
        onDeleteList={handleDeleteList}
        onShareList={handleShareList}
        onValidateShareEmail={(email) => validateShareEmail(getToken, email)}
        onCreateList={async (name) => {
          await createList(getToken, name, [])
          await refreshLists()
        }}
        onViewListContents={(listId) => {
          setViewingListId(listId)
          setIsParcelListPanelOpen(true)
        }}
        onBulkSkipTrace={handleBulkSkipTraceList}
        onBulkEmail={handleBulkEmailFromList}
        onExportList={handleExportList}
        isAddingSingleParcel={showListSelector && !!clickedParcelData}
        isBulkEmailMode={showListSelector && !!selectedEmailTemplate}
      />

      <ParcelListPanel
        isOpen={isParcelListPanelOpen}
        onClose={() => {
          setIsParcelListPanelOpen(false)
          setViewingListId(null)
        }}
        selectedListId={viewingListId}
        lists={lists}
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
        onPhoneClick={handlePhoneClick}
        onSkipTraceParcel={handleSkipTraceParcel}
        onConvertToLead={handleConvertToLead}
        isParcelALead={isParcelALeadCheck}
        onBulkSkipTrace={handleBulkSkipTraceList}
        onExportList={handleExportList}
        skipTracingInProgress={skipTracingInProgress}
      />

      {createPortal(
        <ParcelDetails
          isOpen={isParcelDetailsOpen}
          onClose={handleParcelDetailsClose}
          parcelData={clickedParcelData}
          onEmailClick={handleEmailClick}
          onPhoneClick={handlePhoneClick}
          lists={lists}
          enableAutoClose={false}
        />,
        document.body
      )}

      <SkipTracedListPanel
        isOpen={isSkipTracedListPanelOpen}
        onClose={() => setIsSkipTracedListPanelOpen(false)}
        onOpenParcelDetails={handleOpenParcelDetails}
      />

      <DealPipeline
        isOpen={isDealPipelineOpen}
        onClose={() => setIsDealPipelineOpen(false)}
        pipelines={pipelines}
        activePipelineId={activePipelineId}
        focusLeadRequestKey={dealPipelineLeadFocusKey}
        focusParcelId={dealPipelineFocusParcelId}
        onFocusLeadHandled={handleDealPipelineFocusHandled}
        onPipelinesChange={refreshPipelines}
        onActivePipelineChange={setActivePipelineId}
        onSharePipeline={handleSharePipeline}
        onValidateShareEmail={(email) => validatePipelineShareEmail(getToken, email)}
        currentUser={currentUser}
        getToken={getToken}
        leads={pipelines.length > 0 ? (pipelines.find((p) => p.id === activePipelineId)?.leads ?? []) : dealPipelineLeads}
        onLeadsChange={pipelines.length > 0 ? async (newLeads) => {
          if (!activePipelineId) return
          try {
            await updatePipeline(getToken, activePipelineId, { leads: newLeads })
            await refreshPipelines()
          } catch (e) { showToast(e.message || 'Failed to update', 'error') }
        } : setDealPipelineLeads}
        onColumnsChange={pipelines.length > 0 && activePipelineId ? async (cols) => {
          try {
            await updatePipeline(getToken, activePipelineId, { columns: cols })
            await refreshPipelines()
          } catch (e) { showToast(e.message || 'Failed to update', 'error') }
        } : undefined}
        onTitleChange={pipelines.length > 0 && activePipelineId ? async (title) => {
          try {
            await updatePipeline(getToken, activePipelineId, { title })
            await refreshPipelines()
          } catch (e) { showToast(e.message || 'Failed to update', 'error') }
        } : undefined}
        onOpenParcelDetails={handleOpenParcelDetails}
        onEmailClick={handleEmailClick}
        onPhoneClick={handlePhoneClick}
        onSkipTraceParcel={handleSkipTraceParcel}
        skipTracingInProgress={skipTracingInProgress}
        onOpenScheduleAtDate={(ts) => {
          setIsDealPipelineOpen(false)
          setScheduleInitialDate(ts)
          setIsSchedulePanelOpen(true)
        }}
        onCenterParcel={(location) => {
          if (mapRef.current) {
            mapRef.current.setView([location.lat, location.lng], 17, {
              animate: true,
              duration: 0.5
            })
          }
        }}
      />

      <SchedulePanel
        isOpen={isSchedulePanelOpen}
        onClose={() => { setIsSchedulePanelOpen(false); setScheduleInitialDate(null) }}
        initialDate={scheduleInitialDate}
        onInitialDateConsumed={() => setScheduleInitialDate(null)}
        leads={pipelines.length > 0 ? (pipelines.find((p) => p.id === activePipelineId)?.leads ?? []) : dealPipelineLeads}
        pipelines={pipelines}
        activePipelineId={activePipelineId}
        onLeadsChange={pipelines.length > 0 ? () => refreshPipelines() : setDealPipelineLeads}
        onOpenParcelDetails={handleOpenParcelDetails}
        onEmailClick={handleEmailClick}
        onPhoneClick={handlePhoneClick}
        onSkipTraceParcel={handleSkipTraceParcel}
        skipTracingInProgress={skipTracingInProgress}
      />

      <TasksPanel
        isOpen={isTasksPanelOpen}
        onClose={() => setIsTasksPanelOpen(false)}
        pipelines={pipelines}
        activePipelineId={activePipelineId}
        leads={pipelines.length > 0 ? (pipelines.find((p) => p.id === activePipelineId)?.leads ?? []) : dealPipelineLeads}
        onLeadsChange={pipelines.length > 0 ? () => refreshPipelines() : setDealPipelineLeads}
        onOpenTaskInDealPipeline={handleOpenTaskInDealPipeline}
      />

      <PhoneActionPanel
        isOpen={!!phoneActionPanel}
        onClose={() => setPhoneActionPanel(null)}
        phone={phoneActionPanel?.phone}
        parcelData={phoneActionPanel?.parcelData}
      />

      <TextTemplatesPanel
        isOpen={isTextTemplatesPanelOpen}
        onClose={() => setIsTextTemplatesPanelOpen(false)}
      />

      <EmailTemplatesPanel
        isOpen={isEmailTemplatesPanelOpen}
        onClose={() => {
          setIsEmailTemplatesPanelOpen(false)
          setSelectedEmailTemplate(null)
          setIsBulkEmailMode(false)
        }}
        onSelectTemplate={handleTemplateSelect}
        isBulkMode={isBulkEmailMode}
      />

      <EmailComposer
        isOpen={isEmailComposerOpen}
        onClose={() => {
          setIsEmailComposerOpen(false)
          setSelectedEmailTemplate(null)
          setEmailComposerParcelData(null)
          setEmailComposerRecipient({ email: '', name: '' })
        }}
        template={selectedEmailTemplate}
        parcelData={emailComposerParcelData}
        recipientEmail={emailComposerRecipient.email}
        recipientName={emailComposerRecipient.name}
        onSend={(emailData) => {
          console.log('Email sent:', emailData)
          showToast('Email opened in your email client', 'success')
        }}
        emailTestMode={settings.emailTestMode}
        testEmail={settings.defaultEmail}
      />

      <BulkEmailPreview
        isOpen={isBulkEmailPreviewOpen}
        onClose={() => {
          setIsBulkEmailPreviewOpen(false)
          setBulkEmailList(null)
          setBulkEmailListId(null)
        }}
        template={selectedEmailTemplate}
        list={bulkEmailList}
        listId={bulkEmailListId}
        onConfirm={handleBulkEmailConfirm}
        onCancel={() => {
          setIsBulkEmailPreviewOpen(false)
          setBulkEmailList(null)
          setBulkEmailListId(null)
        }}
      />

      <PathsPanel
        isOpen={isPathsPanelOpen}
        onClose={() => setIsPathsPanelOpen(false)}
        paths={paths}
        onPathsChange={refreshPaths}
        onDeletePath={handleDeletePath}
        onRenamePath={handleRenamePath}
        visiblePathIds={visiblePathIds}
        onTogglePathVisibility={handleTogglePathVisibility}
        distanceUnit={settings.distanceUnit}
      />

      <SettingsPanel
        isOpen={isSettingsPanelOpen}
        onClose={() => setIsSettingsPanelOpen(false)}
        settings={settings}
        onSettingsChange={handleSettingsChange}
        getToken={getToken}
      />

      <LeadsPanel
        isOpen={isLeadsPanelOpen}
        onClose={() => setIsLeadsPanelOpen(false)}
        pipelines={pipelines}
        dealPipelineLeads={dealPipelineLeads}
        onOpenDealPipeline={() => {
          setIsLeadsPanelOpen(false)
          setIsDealPipelineOpen(true)
        }}
        onOpenParcelDetails={handleOpenParcelDetails}
        onEmailClick={handleEmailClick}
        onPhoneClick={handlePhoneClick}
        onSkipTraceParcel={handleSkipTraceParcel}
        skipTracingInProgress={skipTracingInProgress}
        onLeadsChange={pipelines.length > 0 ? async (newLeads, pipelineId) => {
          const pid = pipelineId || activePipelineId
          if (!pid) return
          try {
            await updatePipeline(getToken, pid, { leads: newLeads })
            await refreshPipelines()
          } catch (e) { showToast(e.message || 'Failed to update', 'error') }
        } : setDealPipelineLeads}
        onOpenScheduleAtDate={(ts) => {
          setIsLeadsPanelOpen(false)
          setScheduleInitialDate(ts)
          setIsSchedulePanelOpen(true)
        }}
      />

      {/* Authentication Dialogs */}
      <Login
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onSwitchToSignUp={() => {
          setIsLoginOpen(false)
          setIsSignUpOpen(true)
        }}
        onSwitchToForgotPassword={() => {
          setIsLoginOpen(false)
          setIsForgotPasswordOpen(true)
        }}
      />
      <SignUp
        isOpen={isSignUpOpen}
        onClose={() => setIsSignUpOpen(false)}
        onSwitchToLogin={() => {
          setIsSignUpOpen(false)
          setIsLoginOpen(true)
        }}
      />
      <ForgotPassword
        isOpen={isForgotPasswordOpen}
        onClose={() => setIsForgotPasswordOpen(false)}
        onSwitchToLogin={() => {
          setIsForgotPasswordOpen(false)
          setIsLoginOpen(true)
        }}
      />

      <ConvertToLeadPipelineDialog
        open={!!pickPipelineForParcel}
        onOpenChange={(o) => { if (!o) setPickPipelineForParcel(null) }}
        pipelines={pickPipelineForParcel?.eligiblePipelines ?? []}
        currentUser={currentUser}
        onSelect={(pipelineId) => {
          const ctx = pickPipelineForParcel
          setPickPipelineForParcel(null)
          if (ctx?.parcelData) handleAddLeadToPipeline(ctx.parcelData, pipelineId)
        }}
      />

      <ToastContainer />
      <ConfirmDialog />
    </div>
    </UserDataSyncProvider>
  )
}

export default App
