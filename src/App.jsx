import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import MapGL, { Marker as MapMarker, Source, Layer } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { CompassOrientation } from './components/CompassOrientation'
import { NorthIndicator } from './components/NorthIndicator'
import { PMTilesParcelLayer } from './components/PMTilesParcelLayer'
import { MapControls } from './components/MapControls'
import { AddressSearch } from './components/AddressSearch'
import { ListPanel } from './components/ListPanel'
import { SkipTracedListPanel } from './components/SkipTracedListPanel'
import { ParcelListPanel } from './components/ParcelListPanel'
import { ParcelDetailsV3 as ParcelDetails } from './components/parcel-details'
import { ParcelPopupV1 } from './components/parcel-popup'
import { PhoneActionPanel } from './components/PhoneActionPanel'
import { OutreachPanel } from './components/OutreachPanel'
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
import { fetchLists, createList, updateList, deleteList, validateShareEmail } from './utils/lists'
import { fetchPipelines, createPipeline, updatePipeline, validateShareEmail as validatePipelineShareEmail, canAddLeadsToPipeline } from './utils/pipelines'
import { auth } from './config/firebase'
import { skipTraceParcels, pollSkipTraceJobUntilComplete, saveSkipTracedParcel, saveSkipTracedParcels, getSkipTracedParcel, isParcelSkipTraced } from './utils/skipTrace'
import { addParcelToSkipTracedList, addListToSkipTracedList } from './utils/skipTracedList'
import { computeOwnerOccupied } from './utils/ownerOccupied'
import { DealPipeline } from './components/DealPipeline'
import { SchedulePanel } from './components/SchedulePanel'
import { TasksPanel } from './components/TasksPanel'
import PathTracker from './components/PathTracker'
import { PathsPanel } from './components/PathsPanel'
import { fetchPaths, createPath, renamePath as renamePathApi, deletePath as deletePathApi, sharePath as sharePathApi, sharePathWithTeams as sharePathWithTeamsApi } from './utils/paths'
import { TeamsPanel } from './components/TeamsPanel'
import { fetchTeams } from './utils/teams'
import { reverseGeocodeCity } from './utils/reverseGeocode'
import { smoothPath, totalDistanceMiles, totalDistanceKm } from './utils/pathSmoothing'
import { SettingsPanel } from './components/SettingsPanel'
import { ConvertToLeadPipelineDialog } from './components/ConvertToLeadPipelineDialog'
import { LeadsPanel } from './components/LeadsPanel'
import { RoofInspectorPanel } from './components/RoofInspectorPanel'
import { PermissionPrompt, hasGrantedPermissions } from './components/PermissionPrompt'
import { NotificationPrompt } from './components/NotificationPrompt'
import { getSettings, updateSettings } from './utils/settings'
import { getAllTasks } from './utils/leadTasks'
import { showLocalNotification } from './utils/pushNotifications'
import { addLead, loadColumns, loadLeads, isParcelALead, getStreetAddress } from './utils/dealPipeline'
import { listToCsv } from './utils/exportList'
import { addSkipTraceJob, updateSkipTraceJob, getPendingSkipTraceJobs, removeSkipTraceJob, cleanupOldJobs } from './utils/skipTraceJobs'
import { useDeviceHeading } from './hooks/useDeviceHeading'
import WelcomeTour from './components/WelcomeTour'

function nextDefaultPathName(paths) {
  let max = 0
  for (const p of paths || []) {
    const m = /^Path\s+(\d+)$/i.exec(String(p.name || '').trim())
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `Path ${max + 1}`
}

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

function getMapStyle(mapStyleSetting) {
  const sources = {}
  const layers = []
  const mbToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || ''

  sources['terrain-dem'] = {
    type: 'raster-dem',
    tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
    tileSize: 256,
    maxzoom: 15,
    encoding: 'terrarium',
  }

  if (mapStyleSetting === 'street') {
    sources['carto-street'] = {
      type: 'raster',
      tiles: ['https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    }
    layers.push({ id: 'carto-street-layer', type: 'raster', source: 'carto-street' })
  } else {
    if (mbToken) {
      sources['satellite'] = {
        type: 'raster',
        tiles: [`https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${mbToken}`],
        tileSize: 512,
        maxzoom: 22,
        attribution: '&copy; Mapbox &copy; Maxar Technologies &copy; Airbus',
      }
    } else {
      sources['satellite'] = {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        maxzoom: 19,
        attribution: '&copy; Esri',
      }
    }
    layers.push({ id: 'satellite-layer', type: 'raster', source: 'satellite' })

    const labelUrl = mapStyleSetting === 'hybrid'
      ? 'https://a.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png'
      : 'https://a.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}@2x.png'
    sources['carto-labels'] = {
      type: 'raster',
      tiles: [labelUrl],
      tileSize: 256,
      maxzoom: 19,
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    }
    layers.push({ id: 'carto-labels-layer', type: 'raster', source: 'carto-labels' })
  }

  return {
    version: 8,
    sources,
    layers,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    terrain: { source: 'terrain-dem', exaggeration: 1.5 },
  }
}


function LocationMarker({ position }) {
  const [interpPos, setInterpPos] = useState(null)
  const animRef = useRef({ from: null, to: null, startTime: 0, duration: 900, rafId: null })

  useEffect(() => {
    if (!position) return
    const a = animRef.current
    if (!a.to) {
      setInterpPos({ lat: position.lat, lng: position.lng })
      a.from = { lat: position.lat, lng: position.lng }
      a.to = { lat: position.lat, lng: position.lng }
      return
    }
    if (a.rafId) cancelAnimationFrame(a.rafId)
    const now = performance.now()
    const elapsed = now - a.startTime
    const t = a.from && a.startTime ? Math.min(1, elapsed / a.duration) : 1
    const curLat = a.from.lat + (a.to.lat - a.from.lat) * t
    const curLng = a.from.lng + (a.to.lng - a.from.lng) * t
    a.from = { lat: curLat, lng: curLng }
    a.to = { lat: position.lat, lng: position.lng }
    a.startTime = now
    const animate = (ts) => {
      const progress = Math.min(1, (ts - a.startTime) / a.duration)
      const ease = 1 - Math.pow(1 - progress, 3)
      const lat = a.from.lat + (a.to.lat - a.from.lat) * ease
      const lng = a.from.lng + (a.to.lng - a.from.lng) * ease
      setInterpPos({ lat, lng })
      if (progress < 1) { a.rafId = requestAnimationFrame(animate) } else { a.rafId = null }
    }
    a.rafId = requestAnimationFrame(animate)
    return () => { if (a.rafId) cancelAnimationFrame(a.rafId) }
  }, [position])

  if (!interpPos) return null
  return (
    <MapMarker longitude={interpPos.lng} latitude={interpPos.lat} anchor="center">
      <div className="user-location-dot" />
    </MapMarker>
  )
}

function App() {
  const { currentUser, getToken, logout, loading: authLoading } = useAuth()
  
  // Debug: Log current user state
  useEffect(() => {
  }, [currentUser, authLoading])

  // Handle logout - close all panels and clear state
  const handleLogout = useCallback(async () => {
    try {
      // Close all panels before logout
      setIsListPanelOpen(false)
      setIsSkipTracedListPanelOpen(false)
      setIsParcelListPanelOpen(false)
      setIsParcelDetailsOpen(false)
      setIsOutreachPanelOpen(false)
      setPhoneActionPanel(null)
      setIsEmailComposerOpen(false)
      setIsBulkEmailPreviewOpen(false)
      setIsMultiSelectActive(false)
      setIsPathTrackingActive(false)
      setIsPathsPanelOpen(false)
      setIsTeamsPanelOpen(false)
      setTeams([])
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
    } catch (error) {
      console.error('Logout error:', error)
    }
  }, [logout])
  const [isLoginOpen, setIsLoginOpen] = useState(false)
  const [isSignUpOpen, setIsSignUpOpen] = useState(false)
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false)
  const [permissionsReady, setPermissionsReady] = useState(() => hasGrantedPermissions())
  const [userLocation, setUserLocation] = useState(null)

  const [isListPanelOpen, setIsListPanelOpen] = useState(false)
  const [isSkipTracedListPanelOpen, setIsSkipTracedListPanelOpen] = useState(false)
  const [isParcelListPanelOpen, setIsParcelListPanelOpen] = useState(false)
  const [viewingListId, setViewingListId] = useState(null) // List ID being viewed in ParcelListPanel
  const [isParcelDetailsOpen, setIsParcelDetailsOpen] = useState(false) // Parcel details panel
  const [isOutreachPanelOpen, setIsOutreachPanelOpen] = useState(false)
  const [outreachInitialTab, setOutreachInitialTab] = useState('email')
  const [isEmailComposerOpen, setIsEmailComposerOpen] = useState(false)
  const [isBulkEmailPreviewOpen, setIsBulkEmailPreviewOpen] = useState(false)
  const [selectedEmailTemplate, setSelectedEmailTemplate] = useState(null)
  const [emailComposerParcelData, setEmailComposerParcelData] = useState(null)
  const [emailComposerRecipient, setEmailComposerRecipient] = useState({ email: '', name: '' })
  const [bulkEmailList, setBulkEmailList] = useState(null)
  const [bulkEmailListId, setBulkEmailListId] = useState(null)
  const [isSendingBulkEmails, setIsSendingBulkEmails] = useState(false)
  const [isMultiSelectActive, setIsMultiSelectActive] = useState(false)
  // On fresh visits (prompt shown), compass starts from settings default.
  // On return visits where iOS needs a gesture, start OFF until orientation is confirmed.
  const [isCompassActive, setIsCompassActive] = useState(() => {
    const wantCompass = getSettings().compassDefault
    if (!wantCompass) return false
    // If we're returning (prompt already dismissed) and iOS needs permission, start off
    if (hasGrantedPermissions() &&
        typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      return false
    }
    return true
  })
  const [isFollowing, setIsFollowing] = useState(() => getSettings().autoFollow)
  const { heading, requestOrientation, needsGesture } = useDeviceHeading(permissionsReady)

  // When orientation becomes available (needsGesture flips to false),
  // auto-enable compass if user's setting wants it.
  useEffect(() => {
    if (!needsGesture && getSettings().compassDefault && !isCompassActive) {
      setIsCompassActive(true)
    }
  }, [needsGesture])
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
  const [isTeamsPanelOpen, setIsTeamsPanelOpen] = useState(false)
  const [teams, setTeams] = useState([])
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false)
  const [isLeadsPanelOpen, setIsLeadsPanelOpen] = useState(false)
  const [isRoofInspectorOpen, setIsRoofInspectorOpen] = useState(false)
  const [roofInspectorParcel, setRoofInspectorParcel] = useState(null)
  const [settings, setSettings] = useState(() => getSettings())
  const [showMenu, setShowMenu] = useState(false)
  const pathTrackerRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const mapRef = useRef(null)
  const parcelLayerRef = useRef(null)
  const currentPopupRef = useRef(null)
  const parcelDetailsSourceRef = useRef('map')
  const programmaticMoveRef = useRef(false)
  const initialSetDoneRef = useRef(false)
  const prevFollowingRef = useRef(false)
  const lastAutoZoomRef = useRef(null)
  const [mapReady, setMapReady] = useState(false)
  const [popupData, setPopupData] = useState(null)
  const [viewState, setViewState] = useState({
    longitude: -96.7970,
    latitude: 32.7767,
    zoom: settings.defaultZoom || 15,
    bearing: 0,
    pitch: 0,
  })

  const memoizedMapStyle = useMemo(() => getMapStyle(settings.mapStyle), [settings.mapStyle])

  const anyPanelOpen = isListPanelOpen || isParcelListPanelOpen || isParcelDetailsOpen ||
    isSkipTracedListPanelOpen || isOutreachPanelOpen ||
    isEmailComposerOpen || isBulkEmailPreviewOpen || isDealPipelineOpen ||
    isSchedulePanelOpen || isTasksPanelOpen || isPathsPanelOpen || isTeamsPanelOpen || isSettingsPanelOpen || isLeadsPanelOpen || isRoofInspectorOpen
  const hasPopup = clickedParcelId != null

  // iOS Safari resize fix
  useEffect(() => {
    const handler = () => { mapInstanceRef.current?.resize() }
    window.visualViewport?.addEventListener('resize', handler)
    window.visualViewport?.addEventListener('scroll', handler)
    return () => {
      window.visualViewport?.removeEventListener('resize', handler)
      window.visualViewport?.removeEventListener('scroll', handler)
    }
  }, [])

  // Initial center on first GPS fix
  useEffect(() => {
    if (userLocation && !initialSetDoneRef.current && mapInstanceRef.current) {
      initialSetDoneRef.current = true
      const initZoom = 17
      const map = mapInstanceRef.current
      map.jumpTo({ center: [userLocation.lng, userLocation.lat], zoom: initZoom, pitch: 0 })
      map.fire('moveend')
      setViewState(prev => ({ ...prev, longitude: userLocation.lng, latitude: userLocation.lat, zoom: initZoom, pitch: 0 }))
    }
  }, [userLocation])

  // Follow-mode panning
  useEffect(() => {
    if (!userLocation || !initialSetDoneRef.current || !isFollowing) {
      prevFollowingRef.current = isFollowing
      return
    }
    const map = mapInstanceRef.current
    if (!map) { prevFollowingRef.current = isFollowing; return }
    const justResumed = !prevFollowingRef.current && isFollowing
    prevFollowingRef.current = isFollowing
    if (justResumed) {
      const raf = requestAnimationFrame(() => {
        programmaticMoveRef.current = true
        map.easeTo({ center: [userLocation.lng, userLocation.lat], duration: 500 })
        setTimeout(() => { programmaticMoveRef.current = false }, 600)
      })
      return () => cancelAnimationFrame(raf)
    }
    const c = map.getCenter()
    const dx = Math.abs(c.lng - userLocation.lng)
    const dy = Math.abs(c.lat - userLocation.lat)
    if (dx < 0.00002 && dy < 0.00002) return
    programmaticMoveRef.current = true
    map.easeTo({ center: [userLocation.lng, userLocation.lat], duration: 900, easing: (t) => 1 - Math.pow(1 - t, 3) })
    setTimeout(() => { programmaticMoveRef.current = false }, 1000)
  }, [userLocation, isFollowing])

  // Recenter map function
  const recenterMapRef = useRef(null)
  const setRecenterMap = useCallback((func) => { recenterMapRef.current = func }, [])
  useEffect(() => {
    recenterMapRef.current = () => {
      const map = mapInstanceRef.current
      if (map && userLocation) {
        programmaticMoveRef.current = true
        map.easeTo({ center: [userLocation.lng, userLocation.lat], duration: 500 })
        setTimeout(() => { programmaticMoveRef.current = false }, 600)
      }
    }
  }, [userLocation])

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
    Promise.all([
      loadUserData(getToken),
      fetchLists(getToken).catch(() => []),
    ]).then(([, serverLists]) => {
      setDealPipelineLeads(loadLeads())
      const fresh = getSettings()
      setSettings(fresh)
      if (serverLists.length > 0) setLists(serverLists)
      // Existing users who predate the tour: auto-skip so they aren't shown it
      if (serverLists.length > 0 && !fresh.tourCompleted) {
        const next = updateSettings({ tourCompleted: true }, getToken)
        setSettings(next)
      }
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

  useEffect(() => {
    if (!currentUser || !Array.isArray(lists) || lists.length === 0) return
    const email = (currentUser.email || '').toLowerCase()
    const hasShared = lists.some((l) => {
      const ownedByMe = l.ownerId === currentUser.uid
      const sharedToMe = Array.isArray(l.sharedWith) && l.sharedWith.map((e) => (e || '').toLowerCase()).includes(email)
      const ownerSharedToOthers = ownedByMe && ((Array.isArray(l.sharedWith) && l.sharedWith.length > 0) || (Array.isArray(l.teamShares) && l.teamShares.length > 0))
      return sharedToMe || ownerSharedToOthers
    })
    if (!hasShared) return
    const noticeKey = `teams_list_rights_notice_v1_${currentUser.uid}`
    try {
      if (localStorage.getItem(noticeKey)) return
      showToast(
        'Heads up: list collaborators can now add/remove parcels on shared lists. Only owners can rename, re-share, or delete.',
        'info',
        10000
      )
      localStorage.setItem(noticeKey, '1')
    } catch {
      // ignore storage errors
    }
  }, [currentUser, lists])

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

  const refreshTeams = useCallback(async () => {
    if (!currentUser) return
    try {
      const next = await fetchTeams(getToken)
      setTeams(next)
    } catch (error) {
      console.error('Error loading teams:', error)
    }
  }, [currentUser, getToken])

  useEffect(() => {
    if (currentUser) refreshTeams()
    else setTeams([])
  }, [currentUser, refreshTeams])

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
        const name = nextDefaultPathName(paths)
        const sample = rawPoints[Math.floor(rawPoints.length / 2)]
        const lat = Number(sample?.lat ?? sample?.[0])
        const lng = Number(sample?.lng ?? sample?.[1])
        const city =
          !Number.isNaN(lat) && !Number.isNaN(lng)
            ? await reverseGeocodeCity(lat, lng)
            : ''
        await createPath(getToken, name, rawPoints, distance, city)
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
  }, [isPathTrackingActive, getToken, refreshPaths, settings.distanceUnit, paths])

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

  const handleSharePath = useCallback(async (pathId, sharedWith) => {
    try {
      await sharePathApi(getToken, pathId, sharedWith)
      await refreshPaths()
      showToast('Path sharing updated', 'success')
    } catch (error) {
      showToast(error.message || 'Failed to update sharing', 'error')
    }
  }, [getToken, refreshPaths])

  const handleSharePathWithTeams = useCallback(async (pathId, teamShares) => {
    try {
      await sharePathWithTeamsApi(getToken, pathId, teamShares)
      await refreshPaths()
      showToast('Team sharing updated', 'success')
    } catch (error) {
      showToast(error.message || 'Failed to update team sharing', 'error')
    }
  }, [getToken, refreshPaths])

  const handleCenterOnPath = useCallback((pathId) => {
    const path = paths.find(p => p.id === pathId)
    if (!path || !path.points || path.points.length === 0) return
    if (!visiblePathIds.includes(pathId)) {
      setVisiblePathIds(prev => [...prev, pathId])
    }
    if (mapRef.current) {
      const lats = path.points.map(p => p.lat || p[0])
      const lngs = path.points.map(p => p.lng || p[1])
      const bounds = [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)]
      ]
      mapRef.current.fitBounds(bounds, { padding: 40, animate: true, duration: 500 })
    }
  }, [paths, visiblePathIds])

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
          try { return localStorage.getItem('deal_pipeline_title') || 'Pipes' } catch { return 'Pipes' }
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
      showToast('Parcel added to Pipes', 'success')
    } catch (e) {
      showToast(e.message || 'Could not add lead', 'error')
    }
  }, [currentUser, getToken, pipelines, refreshPipelines])

  const handleConvertToLead = useCallback(async (parcelData) => {
    if (!currentUser || !currentUser.uid) {
      setIsLoginOpen(true)
      showToast('Please sign in to use Pipes', 'info')
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
      showToast('Parcel added to Pipes', 'success')
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
          console.warn(`Job ${job.jobId} completed but returned no results`)
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
        console.error(`Error processing skip trace job ${job.jobId}:`, error)
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


  const handleSharePipeline = useCallback(async (pipelineId, sharedWith) => {
    try {
      await updatePipeline(getToken, pipelineId, { sharedWith })
      await refreshPipelines()
      showToast('Pipeline sharing updated', 'success')
    } catch (error) {
      showToast(error.message || 'Failed to update sharing', 'error')
    }
  }, [getToken, refreshPipelines])

  const handleSharePipelineWithTeams = useCallback(async (pipelineId, teamShares) => {
    try {
      await updatePipeline(getToken, pipelineId, { teamShares })
      await refreshPipelines()
      showToast('Team sharing updated', 'success')
    } catch (error) {
      showToast(error.message || 'Failed to update team sharing', 'error')
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

  const handleShareListWithTeams = useCallback(async (listId, teamShares) => {
    try {
      await updateList(getToken, listId, { teamShares })
      await refreshLists()
      showToast('Team sharing updated', 'success')
    } catch (error) {
      showToast(error.message || 'Failed to update team sharing', 'error')
    }
  }, [getToken, refreshLists])

  const handleRenameList = useCallback(async (listId, newName) => {
    try {
      await updateList(getToken, listId, { name: newName })
      await refreshLists()
      showToast('List renamed', 'success')
    } catch (error) {
      showToast(error.message || 'Failed to rename list', 'error')
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
      return
    }
    
    // Require authentication for parcel interactions
    if (!currentUser || !currentUser.uid) {
      setIsLoginOpen(true)
      showToast('Please sign in to interact with parcels', 'info')
      return
    }

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
        }
        return newSet
      })
    } else {
      setClickedParcelId(parcelId)
      const currentYear = new Date().getFullYear()
      const yearBuilt = properties.YEAR_BUILT ? parseInt(properties.YEAR_BUILT) : null
      const age = yearBuilt ? currentYear - yearBuilt : null
      const parcelData = { id: parcelId, properties, address, lat: latlng.lat, lng: latlng.lng }
      setClickedParcelData(parcelData)
      const hasSkipTraced = isParcelSkipTraced(parcelId)
      const isSkipTracingInProgress = skipTracingInProgress.has(parcelId)
      const listsWithParcel = (lists || []).filter(l => (l.parcels || []).some(p => (p.id || p) === parcelId))
      setPopupData({
        parcelId, lat: latlng.lat, lng: latlng.lng, address,
        ownerName: properties.OWNER_NAME || '', age,
        ownerOccupied: computeOwnerOccupied(properties),
        listNames: listsWithParcel.map(l => l.name),
        hasSkipTraced, isSkipTracing: isSkipTracingInProgress,
      })
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.easeTo({ center: [latlng.lng, latlng.lat], duration: 500 })
        }
      }, 300)
    }
    
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
      setPopupData(null)
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
    if (needsGesture) {
      const granted = await requestOrientation()
      setIsCompassActive(granted)
      if (granted) setIsFollowing(true)
      return
    }
    setIsCompassActive(prev => {
      const next = !prev
      if (next) setIsFollowing(true)
      return next
    })
  }, [needsGesture, requestOrientation])


  // Toggle multi-select mode
  const handleToggleMultiSelect = useCallback(() => {
    // Wait for auth to finish loading before checking
    if (authLoading) {
      return
    }
    
    // Require authentication for multi-select
    if (!currentUser || !currentUser.uid) {
      setIsLoginOpen(true)
      showToast('Please sign in to use multi-select', 'info')
      return
    }
    setIsMultiSelectActive(prev => !prev)
    setSelectedParcels(new Set()) // Clear selection when toggling mode
    setSelectedParcelsData(new Map()) // Clear parcel data
    setClickedParcelId(null) // Clear single click highlight
    setClickedParcelData(null) // Prevent stale single-parcel add-to-list flow
    setPopupData(null) // Close any open parcel popup
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
      return
    }
    
    // Require authentication to view parcel details
    if (!currentUser || !currentUser.uid) {
      setIsLoginOpen(true)
      showToast('Please sign in to view parcel details', 'info')
      return
    }
    // Track source: from list (parcelData passed) vs map (popup)
    parcelDetailsSourceRef.current = parcelData ? 'list' : 'map'
    // If parcelData is provided (from list), use it; otherwise use clickedParcelData
    if (parcelData) {
      setClickedParcelData(parcelData)
    }
    suppressPopupCloseRef.current = true
    setPopupData(null)
    setIsParcelDetailsOpen(true)

    const target = parcelData || clickedParcelData
    if (target && mapInstanceRef.current) {
      const lng = target.lng ?? target.properties?.longitude
      const lat = target.lat ?? target.properties?.latitude
      if (lng != null && lat != null) {
        mapInstanceRef.current.easeTo({ center: [lng, lat], duration: 500 })
      }
    }
  }, [currentUser, authLoading, clickedParcelData])

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

  const openParcelPopup = useCallback((data) => {
    if (!data) return
    const parcelId = data.id || data.properties?.PROP_ID
    const address = data.address || data.properties?.SITUS_ADDR || data.properties?.SITE_ADDR || data.properties?.ADDRESS || 'No address'
    const properties = data.properties || {}
    const lat = data.lat ?? data.latlng?.lat
    const lng = data.lng ?? data.latlng?.lng
    if (lat == null || lng == null) return
    const currentYear = new Date().getFullYear()
    const yearBuilt = properties.YEAR_BUILT ? parseInt(properties.YEAR_BUILT) : null
    const age = yearBuilt ? currentYear - yearBuilt : null
    const hasSkipTraced = isParcelSkipTraced(parcelId)
    const isSkipTracingInProgress = skipTracingInProgress.has(parcelId)
    const listsWithParcel = (lists || []).filter(l => (l.parcels || []).some(p => (p.id || p) === parcelId))
    setClickedParcelId(parcelId)
    setClickedParcelData(data)
    setPopupData({
      parcelId, lat, lng, address,
      ownerName: properties.OWNER_NAME || '', age,
      ownerOccupied: computeOwnerOccupied(properties),
      listNames: listsWithParcel.map(l => l.name),
      hasSkipTraced, isSkipTracing: isSkipTracingInProgress,
    })
  }, [lists, skipTracingInProgress])

  const suppressPopupCloseRef = useRef(false)
  const handleCloseParcelPopup = useCallback(() => {
    if (suppressPopupCloseRef.current) {
      suppressPopupCloseRef.current = false
      return
    }
    setPopupData(null)
    setClickedParcelId(null)
    setClickedParcelData(null)
  }, [])

  const handleParcelDetailsClose = useCallback((options = {}) => {
    setIsParcelDetailsOpen(false)
    const openedFromMap = parcelDetailsSourceRef.current === 'map'
    if (options.reopenPopup && openedFromMap && clickedParcelData) {
      openParcelPopup(clickedParcelData)
    } else {
      setPopupData(null)
      setClickedParcelId(null)
      setClickedParcelData(null)
    }
  }, [clickedParcelData, openParcelPopup])

  // Handle email click from parcel details
  const handleEmailClick = useCallback((email, parcelData) => {
    // Wait for auth to finish loading before checking
    if (authLoading) {
      return
    }
    
    // Require authentication for email features
    if (!currentUser || !currentUser.uid) {
      setIsLoginOpen(true)
      showToast('Please sign in to send emails', 'info')
      return
    }
    // Open email templates panel to select a template (single parcel mode)
    setIsBulkEmailMode(false)
    setEmailComposerParcelData(parcelData)
    setEmailComposerRecipient({ email, name: parcelData?.properties?.OWNER_NAME || '' })
    setOutreachInitialTab('email')
    setIsOutreachPanelOpen(true)
  }, [currentUser, authLoading])

  const handleOpenOutreach = useCallback(() => {
    if (authLoading) return
    if (!currentUser || !currentUser.uid) {
      setIsLoginOpen(true)
      return
    }
    setIsBulkEmailMode(true)
    setEmailComposerParcelData(null)
    setEmailComposerRecipient({ email: '', name: '' })
    setBulkEmailList(null)
    setBulkEmailListId(null)
    setOutreachInitialTab('email')
    setIsOutreachPanelOpen(true)
  }, [currentUser, authLoading])

  // Handle email button click from list (opens template selection, then preview)
  const handleBulkEmailFromList = useCallback((listId) => {
    setBulkEmailListId(listId)
    setIsListPanelOpen(false)
    setIsBulkEmailMode(true)
    setEmailComposerParcelData(null)
    setEmailComposerRecipient({ email: '', name: '' })
    setOutreachInitialTab('email')
    setIsOutreachPanelOpen(true)
  }, [])

  // Track if we're in bulk email mode
  const [isBulkEmailMode, setIsBulkEmailMode] = useState(false)

  // Handle template selection from EmailTemplatesPanel
  const handleTemplateSelect = useCallback(async (template) => {
    if (isBulkEmailMode) {
      if (bulkEmailListId) {
        setSelectedEmailTemplate(template)
        setIsOutreachPanelOpen(false)
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
        setIsOutreachPanelOpen(false)
        setIsListPanelOpen(true)
        setShowListSelector(true)
        showToast('Select a list to email', 'info')
      }
    } else {
      setSelectedEmailTemplate(template)
      setIsOutreachPanelOpen(false)
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
        console.warn('Skip trace completed but returned no results. This may mean no contact information was found for this parcel.')
        // Don't throw error - empty results is a valid outcome
        showToast('Skip trace completed, but no contact information was found for this parcel.', 'warning')
        return
      }

      const contactInfo = results[0]
      
      
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
      
      
      saveSkipTracedParcel(parcelId, dataToSave)
      scheduleUserDataSync(getToken)

      // Verify it was saved
      const saved = getSkipTracedParcel(parcelId)

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
      
      if (clickedParcelId === parcelId && clickedParcelData) {
        openParcelPopup(clickedParcelData)
      }
    } catch (error) {
      console.error('Skip trace error:', error)
      showToast(`Skip trace failed: ${error.message}`, 'error')
    } finally {
      setSkipTracingInProgress(prev => {
        const next = new Set(prev)
        next.delete(parcelId)
        return next
      })
    }
  }, [clickedParcelData, clickedParcelId, skipTracingInProgress, lists, isParcelALeadCheck, openParcelPopup])

  return (
    <UserDataSyncProvider getToken={getToken}>
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 'var(--vw-height, 100vh)' }}>
      {!permissionsReady && (
        <PermissionPrompt onComplete={(orientationGranted) => {
          setPermissionsReady(true)
          if (orientationGranted && getSettings().compassDefault) {
            setIsCompassActive(true)
          } else if (!orientationGranted) {
            setIsCompassActive(false)
          }
        }} />
      )}
      {permissionsReady && (
        <NotificationPrompt getToken={getToken} />
      )}
      {currentUser && permissionsReady && !settings.tourCompleted && (
        <WelcomeTour
          onComplete={() => handleSettingsChange({ tourCompleted: true })}
          setShowMenu={setShowMenu}
        />
      )}
      {/* Map layer - explicitly at z-index 0 so dialogs/panels appear above */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <MapGL
          {...viewState}
          onMove={(evt) => {
            setViewState(evt.viewState)
          }}
          onDragStart={() => {
            if (!programmaticMoveRef.current) setIsFollowing(false)
          }}
          onZoomStart={() => {
            if (!programmaticMoveRef.current) setIsFollowing(false)
          }}
          onLoad={(evt) => {
            const map = evt.target
            mapInstanceRef.current = map
            mapRef.current = map
            setMapReady(true)
            if (userLocation && !initialSetDoneRef.current) {
              initialSetDoneRef.current = true
              const initZoom = 17
              map.jumpTo({
                center: [userLocation.lng, userLocation.lat],
                zoom: initZoom,
                pitch: 0,
              })
              map.fire('moveend')
              setViewState(prev => ({
                ...prev,
                longitude: userLocation.lng,
                latitude: userLocation.lat,
                zoom: initZoom,
                pitch: 0,
              }))
            }
          }}
          style={{ width: '100%', height: '100%', minHeight: 'var(--vw-height, 100vh)' }}
          mapStyle={memoizedMapStyle}
          minZoom={1}
          maxZoom={20.5}
          maxPitch={0}
          attributionControl={false}
          dragRotate={true}
          touchZoomRotate={true}
          pitchWithRotate={false}
          touchPitch={false}
        >
          <CompassOrientation isActive={isCompassActive} heading={heading} mapRef={mapInstanceRef} />
          <NorthIndicator mapRef={mapInstanceRef} />
          <PMTilesParcelLayer 
            mapRef={mapInstanceRef}
            mapReady={mapReady}
            onParcelClick={handleParcelClick}
            clickedParcelId={clickedParcelId}
            selectedParcels={selectedParcels}
            selectedListIds={selectedListIds}
            lists={lists}
            onLayerReady={(layerFunctions) => {
              parcelLayerRef.current = layerFunctions
            }}
          />
          <PathTracker
            ref={pathTrackerRef}
            mapRef={mapInstanceRef}
            isTracking={isPathTrackingActive}
            userLocation={userLocation}
            savedPathsToShow={paths.filter(p => visiblePathIds.includes(p.id))}
            smoothingLevel={settings.pathSmoothing}
          />
          {userLocation && (
            <LocationMarker position={userLocation} />
          )}
        </MapGL>
      </div>

      <ParcelPopupV1
        popupData={popupData}
        clickedParcelData={clickedParcelData}
        mapRef={mapInstanceRef}
        onClose={handleCloseParcelPopup}
        onOpenDetails={() => handleOpenParcelDetails()}
        onAddToList={() => { setShowListSelector(true); setIsListPanelOpen(true) }}
        onConvertToLead={() => { if (clickedParcelData) handleConvertToLead(clickedParcelData) }}
        isLead={popupData ? isParcelALeadCheck(popupData.parcelId) : false}
      />

      <AddressSearch
        onLocationFound={(location) => {
          showToast(`Navigated to: ${location.address}`, 'success')
          // The map will be centered by AddressSearch component
          // County detection will happen automatically via MapController
          
          // After map centers, wait for parcels to load, then find and highlight the parcel
          setTimeout(() => {
            if (parcelLayerRef.current && parcelLayerRef.current.findParcelAtLocation) {
              const found = parcelLayerRef.current.findParcelAtLocation(location.lat, location.lng)
              if (!found) {
              }
            } else {
              // Retry after a longer delay if layer isn't ready
              setTimeout(() => {
                if (parcelLayerRef.current && parcelLayerRef.current.findParcelAtLocation) {
                  const found = parcelLayerRef.current.findParcelAtLocation(location.lat, location.lng)
                  if (!found) {
                  }
                }
              }, 2000)
            }
          }, 1500) // Wait 1.5 seconds for map to center and parcels to load
        }}
        mapInstanceRef={mapInstanceRef}
        onCloseParcelPopup={() => {
          setPopupData(null)
          setClickedParcelId(null)
          setClickedParcelData(null)
        }}
      />

      <MapControls
        onRecenter={handleRecenter}
        onToggleCompass={handleToggleCompass}
        isCompassActive={isCompassActive}
        onToggleMultiSelect={handleToggleMultiSelect}
        isMultiSelectActive={isMultiSelectActive}
        multiSelectParcelCount={selectedParcels.size}
        onCancelMultiSelect={() => {
          setIsMultiSelectActive(false)
          setSelectedParcels(new Set())
          setSelectedParcelsData(new Map())
          setClickedParcelId(null)
        }}
        onOpenListPanel={() => {
          if (authLoading) {
            return
          }

          if (!currentUser || !currentUser.uid) {
            setIsLoginOpen(true)
            return
          }
          if (isMultiSelectActive && selectedParcels.size > 0) {
            setShowListSelector(true)
          }
          setIsListPanelOpen(true)
        }}
        selectedListIds={selectedListIds}
        onOpenSkipTracedListPanel={() => {
          // Wait for auth to finish loading before checking
          if (authLoading) {
            return
          }
          
          if (!currentUser || !currentUser.uid) {
            setIsLoginOpen(true)
            return
          }
          setIsSkipTracedListPanelOpen(true)
        }}
        onOpenOutreach={handleOpenOutreach}
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
        onOpenTeamsPanel={() => {
          if (authLoading) return
          if (!currentUser || !currentUser.uid) {
            setIsLoginOpen(true)
            return
          }
          setIsTeamsPanelOpen(true)
        }}
        onOpenSettings={() => setIsSettingsPanelOpen(true)}
        onOpenLeads={() => setIsLeadsPanelOpen(true)}
        currentUser={currentUser}
        onLogin={() => setIsLoginOpen(true)}
        onLogout={logout}
        showMenu={showMenu}
        setShowMenu={setShowMenu}
        onCloseParcelPopup={() => {
          setPopupData(null)
          setClickedParcelId(null)
          setClickedParcelData(null)
        }}
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
        onRenameList={handleRenameList}
        onShareList={handleShareList}
        onShareListWithTeams={handleShareListWithTeams}
        teams={teams}
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
            mapRef.current.flyTo({ center: [location.lng, location.lat], zoom: 17, duration: 500 })
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
          popupData={popupData}
          isLead={clickedParcelData ? isParcelALeadCheck(clickedParcelData.id) : false}
          onSkipTrace={() => { if (clickedParcelData) handleSkipTraceParcel(clickedParcelData) }}
          onAddToList={() => { setShowListSelector(true); setIsListPanelOpen(true) }}
          onConvertToLead={() => { if (clickedParcelData) handleConvertToLead(clickedParcelData) }}
          onHailData={() => { if (clickedParcelData) { setRoofInspectorParcel(clickedParcelData); setIsRoofInspectorOpen(true) } }}
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
        onSharePipelineWithTeams={handleSharePipelineWithTeams}
        teams={teams}
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
            mapRef.current.flyTo({ center: [location.lng, location.lat], zoom: 17, duration: 500 })
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

      <OutreachPanel
        isOpen={isOutreachPanelOpen}
        onClose={() => {
          setIsOutreachPanelOpen(false)
          setSelectedEmailTemplate(null)
          setIsBulkEmailMode(false)
        }}
        onSelectTemplate={handleTemplateSelect}
        isBulkMode={isBulkEmailMode}
        initialTab={outreachInitialTab}
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
        currentUser={currentUser}
        paths={paths}
        onPathsChange={refreshPaths}
        onDeletePath={handleDeletePath}
        onRenamePath={handleRenamePath}
        onSharePath={handleSharePath}
        onSharePathWithTeams={handleSharePathWithTeams}
        teams={teams}
        onValidateShareEmail={(email) => validateShareEmail(getToken, email)}
        onCenterOnPath={handleCenterOnPath}
        visiblePathIds={visiblePathIds}
        onTogglePathVisibility={handleTogglePathVisibility}
        distanceUnit={settings.distanceUnit}
      />

      <TeamsPanel
        isOpen={isTeamsPanelOpen}
        onClose={() => setIsTeamsPanelOpen(false)}
        currentUser={currentUser}
        getToken={getToken}
        teams={teams}
        onTeamsChange={refreshTeams}
      />

      <SettingsPanel
        isOpen={isSettingsPanelOpen}
        onClose={() => setIsSettingsPanelOpen(false)}
        settings={settings}
        onSettingsChange={handleSettingsChange}
        getToken={getToken}
        onRestartTour={() => {
          setIsSettingsPanelOpen(false)
          setShowMenu(false)
          handleSettingsChange({ tourCompleted: false })
        }}
      />

      <LeadsPanel
        isOpen={isLeadsPanelOpen}
        onClose={() => setIsLeadsPanelOpen(false)}
        pipelines={pipelines}
        dealPipelineLeads={dealPipelineLeads}
        onOpenDealPipeline={(pipelineId) => {
          setIsLeadsPanelOpen(false)
          if (pipelineId) setActivePipelineId(pipelineId)
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

      <RoofInspectorPanel
        isOpen={isRoofInspectorOpen}
        onClose={() => setIsRoofInspectorOpen(false)}
        parcelData={roofInspectorParcel}
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
