import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import MapGL, { Marker as MapMarker, Source, Layer } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { CompassOrientation } from './components/CompassOrientation'
// import { NorthIndicator } from './components/NorthIndicator'
import { PMTilesParcelLayer } from './components/PMTilesParcelLayer'
import { MapControls } from './components/MapControls'
import { MobileActionBar } from './components/MobileActionBar'
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
import { useNavigation } from './navigation/NavigationContext'
import { UserDataSyncProvider } from './contexts/UserDataSyncContext'
import { loadUserData, scheduleUserDataSync } from './utils/userDataSync'
import { fetchLists, createList, updateList, deleteList, validateShareEmail } from './utils/lists'
import { fetchPipelines, createPipeline, updatePipeline, deletePipeline, validateShareEmail as validatePipelineShareEmail, canAddDealsToPipeline, canAddLeadsToPipeline } from './utils/pipelines'
import { auth } from './config/firebase'
import { skipTraceParcels, pollSkipTraceJobUntilComplete, saveSkipTracedParcel, saveSkipTracedParcels, getSkipTracedParcel, isParcelSkipTraced, deleteSkipTracedParcel, buildSkipTraceRequest } from './utils/skipTrace'
import { addParcelToSkipTracedList, addListToSkipTracedList } from './utils/skipTracedList'
import { computeOwnerOccupied } from './utils/ownerOccupied'
import { DealPipeline } from './components/DealPipeline'
import { SchedulePanel } from './components/SchedulePanel'
import { TasksPanel } from './components/TasksPanel'
import PathTracker from './components/PathTracker'
import { PathsPanel } from './components/PathsPanel'
const FormsPanel = lazy(() => import('./components/forms/FormsPanel').then(m => ({ default: m.FormsPanel })))
import { QuotesPanel } from './components/quotes/QuotesPanel'
import { setCachedDealQuotes, getCachedDealQuotes } from './utils/quotes'
import { PublicFormPage } from './components/forms/PublicFormPage'
import { PublicQuotePage } from './components/quotes/PublicQuotePage'
import { fetchPaths, createPath, renamePath as renamePathApi, deletePath as deletePathApi, sharePath as sharePathApi, sharePathWithTeams as sharePathWithTeamsApi } from './utils/paths'
import { shareTemplate as shareTemplateApi, shareTemplateWithTeams as shareTemplateWithTeamsApi } from './utils/forms'
import { TeamsPanel } from './components/TeamsPanel'
import { fetchTeamContext } from './utils/teams'
import { resolveTeamMemberFeatures, canAccessTeamFeature, canSeeDealAmounts, TEAM_FEATURE_ACCESS_DENIED_MESSAGE, featureIdForFeedNav } from './utils/teamFeatures'
import { subscribeToWebPush } from './utils/pushNotifications'
import { reverseGeocodeCity } from './utils/reverseGeocode'
import { smoothPath, totalDistanceMiles, totalDistanceKm } from './utils/pathSmoothing'
import { SettingsPanel } from './components/SettingsPanel'
import { ConvertToLeadPipelineDialog } from './components/ConvertToLeadPipelineDialog'
import { LeadsPanel } from './components/LeadsPanel'
import { DealsPanel } from './components/DealsPanel'
import { CreateLeadDialog } from './components/CreateLeadDialog'
import { CreateDealDialog } from './components/CreateDealDialog'
import { DealTemplatePickerDialog } from './components/DealTemplatePickerDialog'
import { DealTemplateEditorDialog } from './components/DealTemplateEditorDialog'
import { DealTemplatesManagerDialog } from './components/DealTemplatesManagerDialog'
import { templateToCreateDealPrefill } from './utils/dealTemplates'
import { AppLoadingScreen } from './components/AppLoadingScreen'
import { HailDataPanel } from './components/HailDataPanel'
import { HailStormOverlay, HailStormDismissPill, HailStormMapMarkers } from './components/HailStormOverlay'
import { useHailStormTimeline } from './hooks/useHailStormTimeline'
// import { RoofInspectorPanel } from './components/RoofInspectorPanel' // roof inspector — restore later
import { PermissionPrompt, hasGrantedPermissions } from './components/PermissionPrompt'
import { NotificationPrompt } from './components/NotificationPrompt'
import { useNotificationInbox } from './components/NotificationInbox'
import { useTeamDataSync } from './hooks/useTeamDataSync'
import { getSettings, updateSettings } from './utils/settings'
import { applyUiTheme, getUiThemeFromSettings } from './utils/uiTheme'
import { getAllTasks, getLeadTasks, deleteAllLeadTasks, restoreLeadTasks, migrateLeadTasksToPipelines, updateTaskById } from './utils/leadTasks'
import { removePipelineTask, addPipelineTask } from './utils/pipelineTasks'
import { getParcelNote, saveParcelNote } from './utils/parcelNotes'
import { loadClosedDeals, addClosedDeal, buildClosedDealRecord, runApiPipelinesFreshStartMigration, runLeadsDealsFreshStartMigration } from './utils/closedDeals'
import { fetchLeads, buildLeadPrefillFromParcel, isParcelALead as isParcelInLeadsList, displayLeadName } from './utils/leads'
import { buildDealFromLead, resolvePipelineId } from './utils/deals'
import { createTasksForDeal } from './utils/dealTasks'
import { loadColumns, loadDeals, saveDeals, loadTitle } from './utils/dealPipeline'
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

function notifySkipTraceEvent(label, detail, { failed = false } = {}) {
  try {
    const ns = getSettings().notifications
    if (ns?.deviceAlertsEnabled === false) return
    const allowed = failed ? ns?.skipTraceFailed !== false : ns?.skipTraceComplete !== false
    if (!allowed) return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    showLocalNotification(failed ? 'Skip trace failed' : 'Skip trace complete', {
      body: `${label}: ${detail}`,
      tag: `skip-${failed ? 'fail' : 'ok'}-${label}-${Date.now()}`
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
  const nav = useNavigation()
  const pp = nav.panelProps

  const {
    isActivityPanelOpen,
    isActivityPanelFocused,
    skipPanelExitAnimation,
    isListPanelOpen,
    isParcelListPanelOpen,
    viewingListId,
    isLeadsPanelOpen,
    leadsDetailLeadId,
    isDealsPanelOpen,
    dealsDetailDealId,
    dealsDetailPipelineId,
    dealsClosedRecordId,
    dealsLeadOverlayId,
    isDealPipelineOpen,
    pipesPipelineId,
    pipesDealId,
    pipesLeadOverlayId,
    isTasksPanelOpen,
    isSchedulePanelOpen,
    scheduleInitialDate,
    scheduleLeadId,
    scheduleStacked,
    hasScheduleOpener,
    isPathsPanelOpen,
    isFormsPanelOpen,
    formsView,
    formsTemplateId,
    isQuotesPanelOpen,
    quotesEditorFrame,
    quotesDetailQuoteId,
    quotesDetailQuote,
    quotesDetailReturnToDeal,
    isTeamsPanelOpen,
    teamsDetailTeamId,
    isSettingsPanelOpen,
    isSkipTracedListPanelOpen,
    isOutreachPanelOpen,
    outreachInitialTab,
    isEmailComposerOpen,
    isBulkEmailPreviewOpen,
    bulkEmailListId: navBulkEmailListId,
    isParcelDetailsOpen,
    parcelDetailsSource,
    isHailDataOpen,
    hailDataParcel,
    phoneActionPanel,
    popupData,
    clickedParcelId,
    clickedParcelData,
    fromActivity,
    showMenu,
    isLoginOpen,
    isSignUpOpen,
    isForgotPasswordOpen,
    createLeadOpen,
    createLeadPrefill,
    createDealOpen,
    createDealPrefill,
    dealTemplatePickerOpen,
    pendingCreateDealPrefill,
    dealTemplateEditorOpen,
    editingDealTemplateId,
    dealTemplatesManagerOpen,
    moveDealContext,
  } = pp
  
  // Debug: Log current user state
  useEffect(() => {
  }, [currentUser, authLoading])

  // Handle logout - close all panels and clear state
  const handleLogout = useCallback(async () => {
    try {
      nav.resetToMapFullState()
      setIsMultiSelectActive(false)
      setIsPathTrackingActive(false)
      setTeams([])
      setTeamMembership(null)
      setPendingTeamInvites([])
      setPaths([])
      setVisiblePathIds([])
      setSelectedParcels(new Set())
      setSelectedParcelsData(new Map())
      await logout()
    } catch (error) {
      console.error('Logout error:', error)
    }
  }, [logout, nav])
  const [permissionsReady, setPermissionsReady] = useState(() => hasGrantedPermissions())
  const [userLocation, setUserLocation] = useState(null)

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
  const [lists, setLists] = useState([])
  const [showListSelector, setShowListSelector] = useState(false) // Show list selector in popup
  const [skipTracingInProgress, setSkipTracingInProgress] = useState(new Set()) // Track parcels being skip traced
  const [dealPipelineDeals, setDealPipelineDeals] = useState([])
  const [leads, setLeads] = useState([])
  const [editLead, setEditLead] = useState(null)
  const [closedDeals, setClosedDeals] = useState(() => loadClosedDeals())
  const [pipelines, setPipelines] = useState([])
  const [activePipelineId, setActivePipelineId] = useState(null)
  const [createDealSaving, setCreateDealSaving] = useState(false)
  const [dealTemplatesRefreshKey, setDealTemplatesRefreshKey] = useState(0)
  const [quotesRefreshEpoch, setQuotesRefreshEpoch] = useState(0)
  /** When set, user is choosing a target pipeline to move a deal into. */
  const [dealPipelineAddTaskKey, setDealPipelineAddTaskKey] = useState(0)
  const [dealPipelineAddTaskParcelId, setDealPipelineAddTaskParcelId] = useState(null)
  const [isPathTrackingActive, setIsPathTrackingActive] = useState(false)
  const [paths, setPaths] = useState([])
  const [visiblePathIds, setVisiblePathIds] = useState([])
  const [teams, setTeams] = useState([])
  const [teamMembership, setTeamMembership] = useState(null)
  const [pendingTeamInvites, setPendingTeamInvites] = useState([])
  const [selectedHailEvent, setSelectedHailEvent] = useState(null)
  /** Parcel context for storm map view after hail/parcel panels are dismissed */
  const [hailStormParcel, setHailStormParcel] = useState(null)
  const [hailOpening, setHailOpening] = useState(false)
  // const [isRoofInspectorOpen, setIsRoofInspectorOpen] = useState(false) // roof inspector — restore later
  // const [roofInspectorParcel, setRoofInspectorParcel] = useState(null)
  const [settings, setSettings] = useState(() => getSettings())

  useEffect(() => {
    applyUiTheme(getUiThemeFromSettings(settings))
  }, [settings.uiTheme])
  const pathTrackerRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const mapRef = useRef(null)
  const parcelLayerRef = useRef(null)
  const currentPopupRef = useRef(null)
  const programmaticMoveRef = useRef(false)
  /** Viewport to restore after closing Hail Data / storm map (saved before storm zoom). */
  const hailViewportRestoreRef = useRef(null)
  const initialSetDoneRef = useRef(false)
  const prevFollowingRef = useRef(false)
  const lastAutoZoomRef = useRef(null)
  const [mapReady, setMapReady] = useState(false)
  const showAppLoading = authLoading || (permissionsReady && !mapReady)
  const [viewState, setViewState] = useState({
    longitude: -96.7970,
    latitude: 32.7767,
    zoom: settings.defaultZoom || 15,
    bearing: 0,
    pitch: 0,
  })

  const memoizedMapStyle = useMemo(() => getMapStyle(settings.mapStyle), [settings.mapStyle])

  const captureMapViewportForHailRestore = useCallback(() => {
    if (hailViewportRestoreRef.current) return
    const map = mapInstanceRef.current
    if (!map) return
    const center = map.getCenter()
    hailViewportRestoreRef.current = {
      center: [center.lng, center.lat],
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    }
  }, [])

  const restoreMapViewportAfterHail = useCallback(() => {
    const snap = hailViewportRestoreRef.current
    hailViewportRestoreRef.current = null
    const map = mapInstanceRef.current
    if (!snap || !map) return
    programmaticMoveRef.current = true
    map.easeTo({
      center: snap.center,
      zoom: snap.zoom,
      bearing: snap.bearing,
      pitch: snap.pitch,
      duration: 650,
    })
    setTimeout(() => { programmaticMoveRef.current = false }, 750)
  }, [])

  const handleCloseHailData = useCallback(() => {
    restoreMapViewportAfterHail()
    setSelectedHailEvent(null)
    setHailStormParcel(null)
    nav.popMapOverlay()
  }, [nav, restoreMapViewportAfterHail])

  const hailParcelCoords = useMemo(() => {
    const parcel = hailStormParcel ?? hailDataParcel
    if (!parcel) return null
    const lat = parcel.lat ?? parcel.properties?.LATITUDE
    const lng = parcel.lng ?? parcel.properties?.LONGITUDE
    if (lat == null || lng == null) return null
    const latN = Number(lat)
    const lngN = Number(lng)
    if (Number.isNaN(latN) || Number.isNaN(lngN)) return null
    return { lat: latN, lng: lngN }
  }, [hailStormParcel, hailDataParcel])

  const handleSelectHailEvent = useCallback((evt) => {
    captureMapViewportForHailRestore()
    const parcel = clickedParcelData ?? hailDataParcel
    if (parcel) setHailStormParcel(parcel)
    setSelectedHailEvent(evt)
    setHailOpening(false)
    nav.dismissParcelAndHailPanels()
  }, [nav, clickedParcelData, hailDataParcel, captureMapViewportForHailRestore])

  const handleDismissHailEvent = useCallback(() => {
    setSelectedHailEvent(null)
    const parcel = hailStormParcel ?? clickedParcelData ?? hailDataParcel
    if (parcel) {
      nav.openHailOverlay({ type: 'hail', parcelId: parcel.id, parcelData: parcel })
    }
  }, [nav, hailStormParcel, clickedParcelData, hailDataParcel])

  const hailStormTimeline = useHailStormTimeline(selectedHailEvent)

  useEffect(() => {
    if (isHailDataOpen) {
      setHailOpening(false)
      captureMapViewportForHailRestore()
    }
  }, [isHailDataOpen, captureMapViewportForHailRestore])

  useEffect(() => {
    if (!selectedHailEvent || !mapRef.current) return
    programmaticMoveRef.current = true
    const map = mapRef.current

    if (hailParcelCoords) {
      const minLng = Math.min(hailParcelCoords.lng, selectedHailEvent.lng)
      const maxLng = Math.max(hailParcelCoords.lng, selectedHailEvent.lng)
      const minLat = Math.min(hailParcelCoords.lat, selectedHailEvent.lat)
      const maxLat = Math.max(hailParcelCoords.lat, selectedHailEvent.lat)
      const lngPad = Math.max(0.08, (maxLng - minLng) * 0.35)
      const latPad = Math.max(0.08, (maxLat - minLat) * 0.35)
      map.fitBounds(
        [
          [minLng - lngPad, minLat - latPad],
          [maxLng + lngPad, maxLat + latPad],
        ],
        { padding: 72, maxZoom: 13, duration: 700 }
      )
    } else if (selectedHailEvent.lng != null && selectedHailEvent.lat != null) {
      map.easeTo({
        center: [selectedHailEvent.lng, selectedHailEvent.lat],
        zoom: 11,
        duration: 700,
      })
    }

    setTimeout(() => { programmaticMoveRef.current = false }, 800)
  }, [selectedHailEvent, hailParcelCoords])

  const anyPanelOpen = isListPanelOpen || isParcelListPanelOpen || isParcelDetailsOpen ||
    isSkipTracedListPanelOpen || isOutreachPanelOpen ||
    isEmailComposerOpen || isBulkEmailPreviewOpen || isDealPipelineOpen ||
    isSchedulePanelOpen || isTasksPanelOpen || isActivityPanelOpen || isPathsPanelOpen || isFormsPanelOpen || isQuotesPanelOpen || isTeamsPanelOpen || isSettingsPanelOpen || isLeadsPanelOpen || isDealsPanelOpen || isHailDataOpen
    // || isRoofInspectorOpen // roof inspector — restore later
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
    if (partial.uiTheme != null) {
      applyUiTheme(getUiThemeFromSettings(next))
    }
  }, [getToken])

  // Task deadline local notifications (while app runs)
  useEffect(() => {
    if (!permissionsReady) return undefined
    const tick = () => {
      const g = getSettings()
      const n = g.notifications || {}
      if (n.deviceAlertsEnabled === false || !n.taskDeadline || typeof Notification === 'undefined' || Notification.permission !== 'granted') {
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
      setDealPipelineDeals(loadDeals())
      setClosedDeals(loadClosedDeals())
      const fresh = getSettings()
      setSettings(fresh)
      if (serverLists.length > 0) setLists(serverLists)
      // Existing users who predate the tour: auto-skip so they aren't shown it
      if (serverLists.length > 0 && !fresh.tourCompleted) {
        const next = updateSettings({ tourCompleted: true }, getToken)
        setSettings(next)
      }
      if (fresh.notifications?.pushEnabled && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        subscribeToWebPush(getToken).catch(() => {})
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
      const ctx = await fetchTeamContext(getToken)
      setTeams(ctx.teams)
      setTeamMembership(ctx.membership)
      setPendingTeamInvites(ctx.pendingInvites || [])
    } catch (error) {
      console.error('Error loading teams:', error)
    }
  }, [currentUser, getToken])

  useEffect(() => {
    if (currentUser) refreshTeams()
    else {
      setTeams([])
      setTeamMembership(null)
      setPendingTeamInvites([])
    }
  }, [currentUser, refreshTeams])

  const teamMemberFeatures = useMemo(
    () => resolveTeamMemberFeatures(teamMembership, teams, currentUser),
    [teamMembership, teams, currentUser]
  )

  const canAccessFeature = useCallback(
    (featureId) => canAccessTeamFeature(teamMembership, teamMemberFeatures, featureId),
    [teamMembership, teamMemberFeatures]
  )

  const showDealAmounts = useMemo(
    () => canSeeDealAmounts(teamMembership, teamMemberFeatures, teams),
    [teamMembership, teamMemberFeatures, teams]
  )

  const guardFeature = useCallback((featureId, action) => {
    if (!featureId || canAccessFeature(featureId)) {
      if (typeof action === 'function') action()
      return true
    }
    showToast(TEAM_FEATURE_ACCESS_DENIED_MESSAGE, 'warning')
    return false
  }, [canAccessFeature])

  const requireAuth = useCallback(() => {
    if (authLoading) return false
    if (!currentUser || !currentUser.uid) {
      nav.openLogin()
      return false
    }
    return true
  }, [authLoading, currentUser, nav])

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
      if (!guardFeature('paths')) return
      setIsPathTrackingActive(true)
      showToast('Recording path...', 'info')
    }
  }, [isPathTrackingActive, getToken, refreshPaths, settings.distanceUnit, paths, guardFeature])

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

  const handleShareForm = useCallback(async (templateId, sharedWith) => {
    try {
      const updated = await shareTemplateApi(getToken, templateId, sharedWith)
      showToast('Form sharing updated', 'success')
      return updated
    } catch (error) {
      showToast(error.message || 'Failed to update sharing', 'error')
      throw error
    }
  }, [getToken])

  const handleShareFormWithTeams = useCallback(async (templateId, sharePatch) => {
    try {
      const teamId = teams[0]?.id
      const updated = await shareTemplateWithTeamsApi(getToken, templateId, sharePatch, teamId)
      showToast('Sharing updated', 'success')
      return updated
    } catch (error) {
      showToast(error.message || 'Failed to update sharing', 'error')
      throw error
    }
  }, [getToken, teams])

  const handleSharePathWithTeams = useCallback(async (pathId, sharePatch) => {
    try {
      const teamId = teams[0]?.id
      await sharePathWithTeamsApi(getToken, pathId, sharePatch, teamId)
      await refreshPaths()
      showToast('Sharing updated', 'success')
    } catch (error) {
      showToast(error.message || 'Failed to update sharing', 'error')
    }
  }, [getToken, refreshPaths, teams])

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

  const refreshLeads = useCallback(async () => {
    if (!currentUser) return
    try {
      const next = await fetchLeads(getToken)
      setLeads(next)
    } catch (error) {
      console.error('Error loading leads:', error)
    }
  }, [currentUser, getToken])

  const refreshPipelines = useCallback(async () => {
    if (!currentUser) return
    try {
      const next = await fetchPipelines(getToken)
      if (next.length > 0) {
        setPipelines(next.map((p) => ({ ...p, deals: p.deals || [], leads: undefined })))
        setActivePipelineId((prev) => {
          if (prev && next.some((p) => p.id === prev)) return prev
          const first = next.find((p) => p.ownerId === currentUser.uid) || next[0]
          return first?.id ?? null
        })
      } else {
        const cols = loadColumns()
        const deals = loadDeals()
        const title = loadTitle()
        if (deals.length > 0 || cols.some((c) => (c?.name || '').trim())) {
          try {
            const created = await createPipeline(getToken, { title, columns: cols, deals })
            setPipelines([created])
            setActivePipelineId(created.id)
            setDealPipelineDeals(created.deals || [])
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
    if (currentUser) {
      runLeadsDealsFreshStartMigration()
      refreshPipelines()
      refreshLeads()
    } else {
      setPipelines([])
      setActivePipelineId(null)
      setLeads([])
    }
  }, [currentUser, refreshPipelines, refreshLeads])

  useEffect(() => {
    if (!currentUser || pipelines.length === 0) return
    if (localStorage.getItem('leads_deals_v2_migrated') === '1') return
    ;(async () => {
      const result = await runApiPipelinesFreshStartMigration(getToken, pipelines, updatePipeline)
      if (result.migrated) {
        showToast('Pipes now track Deals linked to Leads. Create a Lead first, then add a Deal to a pipe.', 'info')
        await refreshPipelines()
      }
    })()
  }, [currentUser, pipelines.length, getToken, refreshPipelines])

  // One-shot client migration: move local tasks with a pipelineId up to pipeline.tasks
  const leadTasksMigrationRunRef = useRef(false)
  useEffect(() => {
    if (!currentUser?.uid || !getToken) return
    if (pipelines.length === 0) return
    if (leadTasksMigrationRunRef.current) return
    const flagKey = `leadTasksMigratedV1:${currentUser.uid}`
    let flagged = false
    try { flagged = localStorage.getItem(flagKey) === 'true' } catch { /* ignore */ }
    if (flagged) {
      leadTasksMigrationRunRef.current = true
      return
    }
    leadTasksMigrationRunRef.current = true
    ;(async () => {
      try {
        const stats = await migrateLeadTasksToPipelines(
          pipelines,
          (pipelineId, task) => addPipelineTask(getToken, pipelineId, task)
        )
        if (stats.migrated > 0) {
          await refreshPipelines()
        }
        try { localStorage.setItem(flagKey, 'true') } catch { /* ignore */ }
        scheduleUserDataSync(getToken)
      } catch (e) {
        console.warn('leadTasks migration failed:', e?.message || e)
      }
    })()
  }, [currentUser?.uid, getToken, pipelines, refreshPipelines])

  useEffect(() => {
    if (isDealPipelineOpen && pipelines.length === 0) setDealPipelineDeals(loadDeals())
  }, [isDealPipelineOpen, pipelines.length])

  useEffect(() => {
    if ((isSchedulePanelOpen || isTasksPanelOpen) && pipelines.length === 0) setDealPipelineDeals(loadDeals())
  }, [isSchedulePanelOpen, isTasksPanelOpen, pipelines.length])

  const activePipelineDeals = useMemo(() => {
    if (pipelines.length > 0) {
      return pipelines.find((p) => p.id === activePipelineId)?.deals ?? []
    }
    return dealPipelineDeals
  }, [pipelines, activePipelineId, dealPipelineDeals])

  const isParcelALeadCheck = useCallback((parcelId) => isParcelInLeadsList(leads, parcelId), [leads])

  const handleResolveParcelForLead = useCallback(async (lat, lng) => {
    if (!parcelLayerRef.current?.findParcelAtLocation) return null
    return parcelLayerRef.current.findParcelAtLocation(lat, lng)
  }, [])

  const handleConvertToLead = useCallback((parcelData) => {
    if (!currentUser?.uid) {
      nav.openLogin()
      showToast('Please sign in to create leads', 'info')
      return
    }
    guardFeature('leads', () => {
      if (!parcelData?.id) {
        showToast('Invalid parcel data', 'error')
        return
      }
      if (isParcelALeadCheck(parcelData.id)) {
        showToast('Parcel is already a lead', 'warning')
        return
      }
      const skip = getSkipTracedParcel(parcelData.id)
      nav.pushModal({ type: 'createLead', prefill: buildLeadPrefillFromParcel(parcelData, skip) })
    })
  }, [currentUser, isParcelALeadCheck, nav, guardFeature])

  const handleLeadCreated = useCallback((lead) => {
    setLeads((prev) => [...prev.filter((l) => l.id !== lead.id), lead])
    refreshLeads()
    nav.popModal()
  }, [refreshLeads, nav])

  const handleLeadUpdated = useCallback((lead) => {
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? lead : l)))
    refreshLeads()
    setEditLead(null)
  }, [refreshLeads])

  const handleEditLead = useCallback((lead) => {
    if (lead?.id) setEditLead(lead)
  }, [])

  const handleCreateDeal = useCallback(async (lead, pipelineId, { title, notes, payments, costs, tasks } = {}) => {
    if (!lead?.id) return
    const pid = pipelineId || activePipelineId
    if (pipelines.length > 0) {
      const pipe = pipelines.find((p) => p.id === pid)
      if (!pipe || !canAddDealsToPipeline(currentUser, pipe, teams)) {
        showToast('You cannot add deals to this pipeline', 'error')
        return
      }
      const deal = buildDealFromLead(lead, pipe.columns, pid, { title, notes, payments, costs })
      try {
        await updatePipeline(getToken, pid, { deals: [...(pipe.deals || []), deal] })
        setPipelines((prev) => prev.map((p) => (p.id === pid ? { ...p, deals: [...(p.deals || []), deal] } : p)))
        await refreshPipelines()
        if (Array.isArray(tasks) && tasks.length > 0) {
          const { created, failed } = await createTasksForDeal({
            deal,
            lead,
            pipeline: pipe,
            tasks,
            getToken,
            apiMode: true,
          })
          if (created > 0) await refreshPipelines()
          if (failed > 0) {
            showToast('Deal created but some tasks could not be added', 'warning')
          }
        }
        setActivePipelineId(pid)
        nav.openPipes(pid)
        showToast('Deal added to pipe', 'success')
      } catch (e) {
        showToast(e.message || 'Could not create deal', 'error')
      }
      return
    }
    const cols = loadColumns()
    const deal = buildDealFromLead(lead, cols, null, { title, notes, payments, costs })
    const next = [...loadDeals(), deal]
    saveDeals(next)
    setDealPipelineDeals(next)
    if (Array.isArray(tasks) && tasks.length > 0) {
      const { failed } = await createTasksForDeal({
        deal,
        lead,
        pipeline: null,
        tasks,
        apiMode: false,
      })
      if (failed > 0) {
        showToast('Deal created but some tasks could not be added', 'warning')
      } else {
        scheduleUserDataSync()
      }
    }
    nav.openPipes(activePipelineId)
    showToast('Deal added to pipe', 'success')
  }, [activePipelineId, currentUser, getToken, pipelines, refreshPipelines, teams, nav])

  const dealTemplateNestedOverlay =
    isDealPipelineOpen || isLeadsPanelOpen || isDealsPanelOpen

  const bumpDealTemplatesRefresh = useCallback(() => {
    setDealTemplatesRefreshKey((k) => k + 1)
  }, [])

  const openCreateDealDialog = useCallback((prefill = {}) => {
    if (!currentUser?.uid) {
      nav.openLogin()
      return
    }
    guardFeature('deals', () => {
      const eligible = pipelines.filter((p) => canAddDealsToPipeline(currentUser, p, teams))
      if (pipelines.length > 0 && eligible.length === 0) {
        showToast('Create or open a pipeline first', 'warning')
        return
      }
      nav.pushModal({ type: 'dealTemplatePicker', prefill })
    })
  }, [currentUser, pipelines, teams, nav, guardFeature])

  const handleDealTemplatePicked = useCallback((template) => {
    const pending = pendingCreateDealPrefill || {}
    const merged = template
      ? templateToCreateDealPrefill(template, pending)
      : pending
    nav.replaceModals([{ type: 'createDeal', prefill: merged }])
  }, [pendingCreateDealPrefill, nav])

  const openCreateDealTemplateEditor = useCallback((templateId = null) => {
    nav.pushModal({ type: 'dealTemplateEditor', templateId })
  }, [nav])

  const openManageDealTemplates = useCallback(() => {
    nav.pushModal({ type: 'dealTemplatesManager' })
  }, [nav])

  const handleCreateDealRequest = useCallback((lead, preferredPipelineId) => {
    if (!lead) return
    openCreateDealDialog({
      leadId: lead.id,
      pipelineId: preferredPipelineId || undefined,
    })
  }, [openCreateDealDialog])

  const handleCreateDealSubmit = useCallback(async ({ title, notes, leadId, pipelineId, payments, costs, tasks }) => {
    const lead = leads.find((l) => l.id === leadId)
    if (!lead) {
      showToast('Lead not found', 'error')
      return
    }
    setCreateDealSaving(true)
    try {
      await handleCreateDeal(lead, pipelineId, { title, notes, payments, costs, tasks })
      nav.popModal()
    } finally {
      setCreateDealSaving(false)
    }
  }, [leads, handleCreateDeal, nav])

  const archiveAndRemoveDeal = useCallback(async (deal, pipelineOrId) => {
    if (!deal) return false
    const pipelineId = resolvePipelineId(pipelineOrId)
    const apiPipeline = pipelineId ? pipelines.find((p) => p.id === pipelineId) : null
    const leadRecord = leads.find((l) => l.id === deal.leadId) || null
    const pipelineSnapshot = apiPipeline
      ? { id: apiPipeline.id, title: apiPipeline.title || 'Pipes', isLocal: false, columns: apiPipeline.columns || [] }
      : { id: '_local', title: loadTitle(), isLocal: true, columns: loadColumns() }

    const now = Date.now()
    const cum = { ...(deal.cumulativeTimeByStatus || {}) }
    const entered = deal.statusEnteredAt ?? deal.createdAt
    if (deal.status && entered) {
      cum[deal.status] = (cum[deal.status] || 0) + Math.max(0, now - entered)
    }

    try {
      if (apiPipeline) {
        const remaining = (apiPipeline.deals || []).filter((d) => d.id !== deal.id)
        await updatePipeline(getToken, apiPipeline.id, { deals: remaining })
        setPipelines((prev) => prev.map((p) => (p.id === apiPipeline.id ? { ...p, deals: remaining } : p)))
        await refreshPipelines()
      } else {
        const remaining = loadDeals().filter((d) => d.id !== deal.id)
        saveDeals(remaining)
        setDealPipelineDeals(remaining)
      }

      addClosedDeal(buildClosedDealRecord({
        deal: { ...deal, cumulativeTimeByStatus: cum },
        lead: leadRecord,
        pipeline: pipelineSnapshot,
        stageTime: cum,
      }))
      setClosedDeals(loadClosedDeals())
    } catch (e) {
      showToast(e.message || 'Could not close deal', 'error')
      return false
    }
    scheduleUserDataSync(getToken)
    return true
  }, [getToken, leads, pipelines, refreshPipelines])

  const handleCloseDeal = useCallback(async (deal, pipelineOrId) => {
    if (!deal) return false
    const confirmed = await showConfirm(
      'This deal will be archived and removed from the pipeline.',
      'Close Deal',
      { detail: deal.title || deal.leadAddress || 'Deal', confirmText: 'Close Deal' }
    )
    if (!confirmed) return false
    const ok = await archiveAndRemoveDeal(deal, pipelineOrId)
    if (ok) showToast('Deal closed and archived', 'success')
    return ok
  }, [archiveAndRemoveDeal])

  const handleRemoveDeal = useCallback(async (deal, pipelineOrId) => {
    if (!deal) return false
    const confirmed = await showConfirm(
      'Remove this deal from the pipeline? Tasks and files on the deal will be lost.',
      'Remove Deal',
      { detail: deal.title || 'Deal', confirmText: 'Remove' }
    )
    if (!confirmed) return false
    const pipelineId = resolvePipelineId(pipelineOrId)
    try {
      const apiPipeline = pipelineId ? pipelines.find((p) => p.id === pipelineId) : null
      if (apiPipeline) {
        const remaining = (apiPipeline.deals || []).filter((d) => d.id !== deal.id)
        await updatePipeline(getToken, apiPipeline.id, { deals: remaining })
        setPipelines((prev) => prev.map((p) => (p.id === apiPipeline.id ? { ...p, deals: remaining } : p)))
        await refreshPipelines()
      } else {
        const remaining = loadDeals().filter((d) => d.id !== deal.id)
        saveDeals(remaining)
        setDealPipelineDeals(remaining)
      }
      showToast('Deal removed', 'success')
      return true
    } catch (e) {
      showToast(e.message || 'Could not remove deal', 'error')
      return false
    }
  }, [getToken, pipelines, refreshPipelines])

  const handleRequestMoveDeal = useCallback((deal, sourcePipelineOrId) => {
    const sourcePipelineId = resolvePipelineId(sourcePipelineOrId)
    if (!deal || !sourcePipelineId) return
    const eligible = pipelines.filter((p) =>
      p.id !== sourcePipelineId && canAddDealsToPipeline(currentUser, p, teams)
    )
    if (eligible.length === 0) {
      showToast('No other pipelines you can move this deal to', 'warning')
      return
    }
    nav.pushModal({ type: 'moveDeal', context: { deal, sourcePipelineId, eligiblePipelines: eligible } })
  }, [pipelines, currentUser, teams])

  const handleMoveDeal = useCallback(async (deal, sourcePipelineId, targetPipelineId) => {
    if (!deal || !sourcePipelineId || !targetPipelineId || sourcePipelineId === targetPipelineId) return false
    const source = pipelines.find((p) => p.id === sourcePipelineId)
    const target = pipelines.find((p) => p.id === targetPipelineId)
    if (!source || !target) {
      showToast('Pipeline not found', 'error')
      return false
    }
    const targetColumns = target.columns || []
    const targetStatus = targetColumns.some((c) => c.id === deal.status)
      ? deal.status
      : (targetColumns[0]?.id || deal.status || 'col-0')
    const now = Date.now()
    const movedDeal = {
      ...deal,
      status: targetStatus,
      statusEnteredAt: now,
      cumulativeTimeByStatus: { ...(deal.cumulativeTimeByStatus || {}) },
      updatedAt: now,
    }
    try {
      await updatePipeline(getToken, targetPipelineId, { deals: [...(target.deals || []), movedDeal] })
      const remaining = (source.deals || []).filter((d) => d.id !== deal.id)
      await updatePipeline(getToken, sourcePipelineId, { deals: remaining })
      await refreshPipelines()
      showToast(`Deal moved to ${target.title || 'pipeline'}`, 'success')
      return true
    } catch (e) {
      showToast(e.message || 'Could not move deal', 'error')
      return false
    }
  }, [getToken, pipelines, refreshPipelines])

  const handleDealUpdate = useCallback(async (updatedDeal, pipelineOrId) => {
    const pid = resolvePipelineId(pipelineOrId) || activePipelineId
    if (pipelines.length > 0 && pid) {
      const pipe = pipelines.find((p) => p.id === pid)
      if (!pipe) return
      const deals = (pipe.deals || []).map((d) => (d.id === updatedDeal.id ? updatedDeal : d))
      try {
        await updatePipeline(getToken, pid, { deals })
        setPipelines((prev) => prev.map((p) => (p.id === pid ? { ...p, deals } : p)))
      } catch (e) {
        showToast(e.message || 'Failed to update deal', 'error')
      }
      return
    }
    const next = loadDeals().map((d) => (d.id === updatedDeal.id ? updatedDeal : d))
    saveDeals(next)
    setDealPipelineDeals(next)
  }, [activePipelineId, getToken, pipelines])

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

        // Poll for results (sync API returns results immediately)
        const parcels = []
        for (const p of job.parcelsToTrace || []) {
          if (p.request) {
            parcels.push(p.request)
            continue
          }
          const parcelData = {
            id: p.parcelId,
            properties: { SITUS_ADDR: p.address, PROP_ID: p.parcelId }
          }
          const { payload } = buildSkipTraceRequest(parcelData, {
            previousFullAddress: getSkipTracedParcel(p.parcelId)?.address || ''
          })
          if (payload) parcels.push(payload)
        }
        if (!parcels.length) throw new Error('No valid skip trace requests in job')

        const result = await skipTraceParcels(parcels)
        const results = result.results || []
        
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
          notifySkipTraceEvent(job.listName, 'no contact information was found')
          return
        }

        // Address matching utilities for batch job result ingestion
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
        notifySkipTraceEvent(job.listName, `${matchedCount} of ${totalRequested} parcel${totalRequested > 1 ? 's' : ''} found`)

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
        notifySkipTraceEvent(job.listName, error.message, { failed: true })
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

  const handleSharePipelineWithTeams = useCallback(async (pipelineId, sharePatch) => {
    try {
      const teamId = teams[0]?.id
      await updatePipeline(getToken, pipelineId, {
        visibility: sharePatch.visibility,
        sharedMemberUids: sharePatch.sharedMemberUids || [],
        teamId: sharePatch.visibility === 'team' ? teamId : null,
        teamShares: sharePatch.visibility === 'team' && teamId ? [teamId] : [],
      })
      await refreshPipelines()
      showToast('Sharing updated', 'success')
    } catch (error) {
      showToast(error.message || 'Failed to update sharing', 'error')
    }
  }, [getToken, refreshPipelines, teams])

  const handleDeletePipeline = useCallback(async (pipelineId) => {
    const pipe = pipelines.find((p) => p.id === pipelineId)
    if (!pipe) return
    if (pipe.isTeamPipe) {
      showToast('Team Pipe cannot be deleted', 'error')
      return
    }
    if (pipe.ownerId !== currentUser?.uid) {
      showToast('Only the owner can delete this pipeline', 'error')
      return
    }
    try {
      if (pipelines.length === 1) {
        await updatePipeline(getToken, pipelineId, {
          deals: [],
          columns: loadColumns(),
        })
        await refreshPipelines()
        showToast('Pipeline reset to default', 'success')
      } else {
        await deletePipeline(getToken, pipelineId)
        await refreshPipelines()
        const nextActive = pipelines.find((p) => p.id !== pipelineId)
        if (nextActive && activePipelineId === pipelineId) {
          setActivePipelineId(nextActive.id)
          if (isDealPipelineOpen) nav.openPipes(nextActive.id)
        }
        showToast('Pipeline deleted', 'success')
      }
    } catch (e) {
      showToast(e?.message || 'Failed to delete pipeline', 'error')
    }
  }, [getToken, refreshPipelines, pipelines, currentUser?.uid, activePipelineId, isDealPipelineOpen, nav])

  const handleShareList = useCallback(async (listId, sharedWith) => {
    try {
      await updateList(getToken, listId, { sharedWith })
      await refreshLists()
      showToast('List sharing updated', 'success')
    } catch (error) {
      showToast(error.message || 'Failed to update sharing', 'error')
    }
  }, [getToken, refreshLists])

  const handleShareListWithTeams = useCallback(async (listId, sharePatch) => {
    try {
      const teamId = teams[0]?.id
      await updateList(getToken, listId, {
        visibility: sharePatch.visibility,
        sharedMemberUids: sharePatch.sharedMemberUids || [],
        teamId: sharePatch.visibility === 'team' ? teamId : null,
        teamShares: sharePatch.visibility === 'team' && teamId ? [teamId] : [],
      })
      await refreshLists()
      showToast('Sharing updated', 'success')
    } catch (error) {
      showToast(error.message || 'Failed to update sharing', 'error')
    }
  }, [getToken, refreshLists, teams])

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
    setShowListSelector(false)
    const wasListOpen = isListPanelOpen
    if (wasListOpen) nav.pop()
    const confirmed = await showConfirm(
      `Are you sure you want to delete "${listName}" (${parcelText})? This cannot be undone.`,
      'Delete List'
    )
    if (wasListOpen) nav.openLists()
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

  const buildPopupOverlay = useCallback((data) => {
    if (!data) return null
    const parcelId = data.id || data.parcelId || data.properties?.PROP_ID
    const address = data.address || data.properties?.SITUS_ADDR || data.properties?.SITE_ADDR || data.properties?.ADDRESS || 'No address'
    const properties = data.properties || {}
    const lat = data.lat ?? data.latlng?.lat ?? properties.LATITUDE ?? properties.latitude
    const lng = data.lng ?? data.latlng?.lng ?? properties.LONGITUDE ?? properties.longitude
    if (lat == null || lng == null || !parcelId) return null
    const currentYear = new Date().getFullYear()
    const yearBuilt = properties.YEAR_BUILT ? parseInt(properties.YEAR_BUILT) : null
    const age = yearBuilt ? currentYear - yearBuilt : null
    const hasSkipTraced = isParcelSkipTraced(parcelId)
    const isSkipTracingInProgress = skipTracingInProgress.has(parcelId)
    const listsWithParcel = (lists || []).filter(l => (l.parcels || []).some(p => (p.id || p) === parcelId))
    const parcelData = { id: parcelId, properties, address, lat, lng }
    return {
      type: 'popup',
      parcelId,
      lat,
      lng,
      parcelData,
      popupData: {
        parcelId, lat, lng, address,
        ownerName: properties.OWNER_NAME || '', age,
        ownerOccupied: computeOwnerOccupied(properties),
        listNames: listsWithParcel.map(l => l.name),
        hasSkipTraced, isSkipTracing: isSkipTracingInProgress,
      },
    }
  }, [lists, skipTracingInProgress])

  const openParcelPopup = useCallback((data) => {
    const overlay = buildPopupOverlay(data)
    if (overlay) nav.showParcelPopup(overlay)
  }, [buildPopupOverlay, nav])

  // Handle parcel click
  const handleParcelClick = useCallback((event) => {
    // Wait for auth to finish loading before checking
    if (authLoading) {
      return
    }
    
    // Require authentication for parcel interactions
    if (!currentUser || !currentUser.uid) {
      nav.openLogin()
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
      const parcelData = { id: parcelId, properties, address, lat: latlng.lat, lng: latlng.lng }
      openParcelPopup(parcelData)
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.easeTo({ center: [latlng.lng, latlng.lat], duration: 500 })
        }
      }, 300)
    }
    
  }, [isMultiSelectActive, lists, currentUser, authLoading, mapInstanceRef, skipTracingInProgress, showToast, openParcelPopup, nav])
  
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
      nav.clearMapOverlays()
      setShowListSelector(false)
      nav.pop()
    } catch (error) {
      showToast(error.message || 'Failed to add parcel', 'error')
    }
  }, [clickedParcelData, lists, getToken, refreshLists, nav])

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
      nav.openLogin()
      showToast('Please sign in to use multi-select', 'info')
      return
    }
    setIsMultiSelectActive(prev => !prev)
    setSelectedParcels(new Set())
    setSelectedParcelsData(new Map())
    nav.clearMapOverlays()
  }, [currentUser, authLoading, nav])

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

  const feedCtx = useMemo(() => ({ leads, pipelines, lists }), [leads, pipelines, lists])

  useEffect(() => {
    if (pipesPipelineId) setActivePipelineId(pipesPipelineId)
  }, [pipesPipelineId])

  const closeAllPanelsForMap = useCallback(() => {
    setShowListSelector(false)
    nav.resetToMapFullState()
  }, [nav])

  const handleGoToParcelOnMap = useCallback((raw) => {
    if (!raw) return
    const parcelId = raw.id || raw.parcelId || raw.properties?.PROP_ID || raw.PROP_ID
    const lat = Number(raw.lat ?? raw.latlng?.lat ?? raw.properties?.LATITUDE ?? raw.properties?.latitude)
    const lng = Number(raw.lng ?? raw.latlng?.lng ?? raw.properties?.LONGITUDE ?? raw.properties?.longitude)
    const address = raw.address || raw.properties?.SITUS_ADDR || raw.properties?.SITE_ADDR || raw.properties?.ADDRESS || 'No address'
    const properties = raw.properties || {
      OWNER_NAME: `${raw.firstName || ''} ${raw.lastName || ''}`.trim(),
      SITUS_ADDR: address,
      LATITUDE: lat,
      LONGITUDE: lng,
      PROP_ID: parcelId,
    }
    closeAllPanelsForMap()
    if (!parcelId || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      showToast('No map location for this parcel', 'error')
      return
    }
    openParcelPopup({
      id: parcelId,
      address,
      properties: { ...properties, PROP_ID: parcelId },
      lat,
      lng,
    })
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [lng, lat], zoom: 17, duration: 500 })
    }
  }, [closeAllPanelsForMap, openParcelPopup, showToast])

  const handleOpenParcelDetails = useCallback((parcelData = null) => {
    if (authLoading) return
    if (!currentUser || !currentUser.uid) {
      nav.openLogin()
      showToast('Please sign in to view parcel details', 'info')
      return
    }
    const source = parcelData ? 'list' : 'map'
    const target = parcelData || clickedParcelData
    if (!target?.id) return
    suppressPopupCloseRef.current = true
    nav.openParcelDetails({
      type: 'parcelDetails',
      parcelId: target.id,
      source,
      parcelData: parcelData || target,
    })
    if (target && mapInstanceRef.current) {
      const lng = target.lng ?? target.properties?.longitude
      const lat = target.lat ?? target.properties?.latitude
      if (lng != null && lat != null) {
        mapInstanceRef.current.easeTo({ center: [lng, lat], duration: 500 })
      }
    }
  }, [currentUser, authLoading, clickedParcelData, nav])

  const handleDealPipelineAddTaskHandled = useCallback(() => {
    setDealPipelineAddTaskParcelId(null)
  }, [])

  const handleOpenTaskInDealPipeline = useCallback(({ pipelineId, dealId, mode }) => {
    if (!guardFeature('tasks')) return
    if (mode === 'api' && pipelineId) setActivePipelineId(pipelineId)
    nav.openTaskInPipes(pipelineId || activePipelineId, dealId)
  }, [nav, activePipelineId, guardFeature])

  const openDealsPanel = useCallback(() => {
    if (!requireAuth()) return
    guardFeature('deals', () => nav.openDeals())
  }, [requireAuth, guardFeature, nav])

  const handlePhoneClick = useCallback((phone, parcelData) => {
    nav.showPhoneOverlay({ type: 'phone', phone, parcelData: parcelData || null })
  }, [nav])

  const suppressPopupCloseRef = useRef(false)
  const isParcelDetailsOpenRef = useRef(false)
  const suppressParcelDetailsDataClearRef = useRef(false)
  const wasParcelDetailsOpenRef = useRef(false)
  useEffect(() => { isParcelDetailsOpenRef.current = isParcelDetailsOpen }, [isParcelDetailsOpen])
  useEffect(() => {
    if (isParcelDetailsOpen && !wasParcelDetailsOpenRef.current) {
      suppressParcelDetailsDataClearRef.current = false
    }
    wasParcelDetailsOpenRef.current = isParcelDetailsOpen
  }, [isParcelDetailsOpen])

  const handleCloseParcelPopup = useCallback(() => {
    if (suppressPopupCloseRef.current) {
      suppressPopupCloseRef.current = false
      return
    }
    if (!isParcelDetailsOpenRef.current) {
      nav.clearMapOverlays()
    } else {
      nav.patchTopOverlay({ popupData: null })
    }
  }, [nav])

  const handleParcelDetailsClose = useCallback((options = {}) => {
    if (isHailDataOpen || hailOpening) return
    if (selectedHailEvent) {
      nav.popMapOverlay()
      return
    }
    nav.popMapOverlay()
    if (suppressParcelDetailsDataClearRef.current) {
      suppressParcelDetailsDataClearRef.current = false
      return
    }
    const openedFromMap = parcelDetailsSource === 'map'
    if (options.reopenPopup && openedFromMap && clickedParcelData) {
      openParcelPopup(clickedParcelData)
    } else {
      nav.clearMapOverlays()
    }
  }, [clickedParcelData, openParcelPopup, nav, parcelDetailsSource, isHailDataOpen, hailOpening, selectedHailEvent])

  const handleEmailClick = useCallback((email, parcelData) => {
    if (authLoading) return
    if (!currentUser || !currentUser.uid) {
      nav.openLogin()
      showToast('Please sign in to send emails', 'info')
      return
    }
    guardFeature('outreach', () => {
      setIsBulkEmailMode(false)
      setEmailComposerParcelData(parcelData)
      setEmailComposerRecipient({ email, name: parcelData?.properties?.OWNER_NAME || '' })
      nav.openOutreach('email')
    })
  }, [currentUser, authLoading, nav, guardFeature])

  const handleOpenOutreach = useCallback(() => {
    if (authLoading) return
    if (!currentUser || !currentUser.uid) {
      nav.openLogin()
      return
    }
    guardFeature('outreach', () => {
      setIsBulkEmailMode(false)
      setEmailComposerParcelData(null)
      setEmailComposerRecipient({ email: '', name: '' })
      setBulkEmailList(null)
      setBulkEmailListId(null)
      nav.openOutreach('email')
    })
  }, [currentUser, authLoading, nav, guardFeature])

  const openDealPipeline = useCallback(() => {
    if (!requireAuth()) return
    guardFeature('pipes', () => nav.openPipes(activePipelineId))
  }, [requireAuth, guardFeature, nav, activePipelineId])

  const openTasks = useCallback(() => {
    if (!requireAuth()) return
    guardFeature('tasks', () => nav.openTasks())
  }, [requireAuth, guardFeature, nav])

  const openSchedule = useCallback(() => {
    if (!requireAuth()) return
    guardFeature('schedule', () => nav.openSchedule())
  }, [requireAuth, guardFeature, nav])

  const openScheduleAtDate = useCallback((ts) => {
    guardFeature('schedule', () => nav.openScheduleAtDate(ts))
  }, [guardFeature, nav])

  const closeSchedulePanel = useCallback(() => {
    nav.pop()
  }, [nav])

  const openListPanel = useCallback(() => {
    if (!requireAuth()) return
    guardFeature('lists', () => {
      if (isMultiSelectActive && selectedParcels.size > 0) setShowListSelector(true)
      nav.openLists()
    })
  }, [requireAuth, guardFeature, isMultiSelectActive, selectedParcels, nav])

  const openPathsPanel = useCallback(() => {
    if (!requireAuth()) return
    guardFeature('paths', () => nav.openPaths())
  }, [requireAuth, guardFeature, nav])

  const openFormsPanel = useCallback(() => {
    if (!requireAuth()) return
    guardFeature('forms', () => nav.openForms())
  }, [requireAuth, guardFeature, nav])

  const openQuotesPanel = useCallback(() => {
    if (!requireAuth()) return
    guardFeature('quotes', () => nav.openQuotes())
  }, [requireAuth, guardFeature, nav])

  const handleCloseQuoteEditor = useCallback((saved) => {
    const prefill = quotesEditorFrame?.prefill
    nav.pop()
    // Create-from-deal opens editor only (no detail frame) — close quotes panel too
    if (prefill?.dealId && saved?.dealId) {
      nav.pop()
    }
    if (saved?.dealId) {
      const dealId = saved.dealId
      const prev = getCachedDealQuotes(dealId) || []
      setCachedDealQuotes(
        dealId,
        [...prev.filter((q) => q.id !== saved.id), saved]
      )
      setQuotesRefreshEpoch((n) => n + 1)
    }
  }, [quotesEditorFrame, nav])

  const handleCloseQuoteDetail = useCallback(() => {
    nav.pop()
    if (quotesDetailReturnToDeal) {
      nav.pop()
      setQuotesRefreshEpoch((n) => n + 1)
    }
  }, [nav, quotesDetailReturnToDeal])

  const handleOpenQuoteFromDeal = useCallback((quote) => {
    if (!quote?.id) return
    guardFeature('quotes', () => nav.openQuoteDetailFromDeal(quote.id, quote))
  }, [nav, guardFeature])

  const handleCreateQuoteForDeal = useCallback(({ deal, pipeline, lead }) => {
    guardFeature('quotes', () => {
      const prefill = {
        title: `Quote — ${deal.title || (lead ? displayLeadName(lead) : deal.leadName) || 'Deal'}`,
        leadId: deal.leadId,
        dealId: deal.id,
        pipelineId: pipeline?.id || deal.pipelineId,
        lineItems: (deal.payments || []).length
          ? deal.payments.map((p, idx) => {
              const costRow = (deal.costs || [])[idx]
              const unitCost = costRow?.amount ?? 0
              const sell = p.amount ?? 0
              const markupPercent = unitCost > 0
                ? Math.round(((sell - unitCost) / unitCost) * 10000) / 100
                : 0
              return {
                name: p.name || 'Payment',
                quantity: 1,
                unitCost,
                markupPercent,
                unitPrice: sell,
                amount: sell,
                dealPaymentLineItemId: p.id,
                dealCostLineItemId: costRow?.id || null,
              }
            })
          : undefined,
      }
      nav.openQuoteEditorFromDeal(prefill)
    })
  }, [nav, guardFeature])

  const openTeamsPanel = useCallback(() => {
    if (!requireAuth()) return
    nav.openTeams()
  }, [requireAuth, nav])

  const handleNotificationNavigate = useCallback((data) => {
    const featureId = featureIdForFeedNav(data)
    if (featureId && !canAccessFeature(featureId)) {
      showToast(TEAM_FEATURE_ACCESS_DENIED_MESSAGE, 'warning')
      return
    }
    const result = nav.navigateFromFeed(data, feedCtx)
    if (result?.toast) showToast(result.toast, 'warning')
    if (result?.pipelineId) setActivePipelineId(result.pipelineId)
    if (result?.listId) {
      setSelectedListIds((prev) => (prev.includes(result.listId) ? prev : [...prev, result.listId].slice(0, 20)))
    }
  }, [nav, feedCtx, canAccessFeature])

  const handleActivityNavigate = useCallback((data) => {
    const featureId = featureIdForFeedNav(data)
    if (featureId && !canAccessFeature(featureId)) {
      showToast(TEAM_FEATURE_ACCESS_DENIED_MESSAGE, 'warning')
      return
    }
    const result = nav.navigateFromActivity(data, feedCtx)
    if (result?.toast) showToast(result.toast, 'warning')
    if (result?.pipelineId) setActivePipelineId(result.pipelineId)
    if (result?.listId) {
      setSelectedListIds((prev) => (prev.includes(result.listId) ? prev : [...prev, result.listId].slice(0, 20)))
    }
  }, [nav, feedCtx, canAccessFeature])

  const handlePanelBack = useCallback(() => {
    if (fromActivity && nav.state.navStack.length === 2 && nav.state.navStack[0]?.type === 'activity') {
      nav.returnToActivity()
    } else {
      nav.pop()
    }
  }, [fromActivity, nav])

  useTeamDataSync({
    enabled: !!currentUser?.uid && teams.length > 0,
    refreshPipelines,
    refreshLeads,
  })

  const notificationInbox = useNotificationInbox({
    isOpen: isActivityPanelOpen,
    isFeedActive: isActivityPanelFocused,
    onOpenChange: (open) => {
      if (open) guardFeature('activity', () => nav.setActivityOpen(true))
      else nav.setActivityOpen(false)
    },
    getToken,
    currentUser,
    teams,
    teamMembership,
    onNavigate: handleActivityNavigate,
  })

  useEffect(() => {
    if (!permissionsReady || typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const notify = params.get('notify')
    if (!notify) return
    handleNotificationNavigate({
      type: notify,
      listId: params.get('listId') || undefined,
      pipelineId: params.get('pipelineId') || undefined,
      pathId: params.get('pathId') || undefined,
      teamId: params.get('teamId') || undefined,
      templateId: params.get('templateId') || undefined,
      leadId: params.get('leadId') || undefined,
      taskId: params.get('taskId') || undefined,
    })
    params.delete('notify')
    ;['listId', 'pipelineId', 'pathId', 'teamId', 'templateId', 'leadId', 'taskId'].forEach((k) => params.delete(k))
    const qs = params.toString()
    window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash || ''}`)
  }, [permissionsReady, handleNotificationNavigate])

  const openLeadsPanel = useCallback(() => {
    if (!requireAuth()) return
    guardFeature('leads', () => nav.openLeads())
  }, [requireAuth, guardFeature, nav])

  const openLeadDetails = useCallback((lead) => {
    if (!lead?.id) return
    guardFeature('leads', () => nav.openLeadDetails(lead.id))
  }, [nav, guardFeature])

  const openSettingsPanel = useCallback(() => nav.openSettings(), [nav])
  const openLogin = useCallback(() => nav.openLogin(), [nav])

  // Handle email button click from list (opens template selection, then preview)
  const handleBulkEmailFromList = useCallback((listId) => {
    guardFeature('outreach', () => {
      setBulkEmailListId(listId)
      setIsBulkEmailMode(true)
      setEmailComposerParcelData(null)
      setEmailComposerRecipient({ email: '', name: '' })
      nav.openOutreach('email')
    })
  }, [nav, guardFeature])

  const [isBulkEmailMode, setIsBulkEmailMode] = useState(false)

  const handleTemplateSelect = useCallback(async (template) => {
    if (isBulkEmailMode) {
      if (bulkEmailListId) {
        setSelectedEmailTemplate(template)
        nav.pop()
        try {
          const list = lists.find(l => l.id === bulkEmailListId)
          if (!list) {
            showToast('List not found', 'error')
            return
          }

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
          nav.push({ type: 'bulkEmailPreview', listId: bulkEmailListId })
        } catch (error) {
          console.error('Error showing preview:', error)
          showToast('Error loading list preview', 'error')
        }
      } else {
        setSelectedEmailTemplate(template)
        nav.pop()
        guardFeature('lists', () => {
          nav.openLists()
          setShowListSelector(true)
          showToast('Select a list to email', 'info')
        })
      }
    } else {
      setSelectedEmailTemplate(template)
      nav.pop()
      nav.push({ type: 'emailComposer' })
    }
  }, [isBulkEmailMode, bulkEmailListId, lists, nav, guardFeature])

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
    setShowListSelector(false)
    nav.replaceStack(nav.recipeClosePrimaryExcept(nav.state.navStack, { list: true }, [{ type: 'bulkEmailPreview', listId }]))
  }, [selectedEmailTemplate, lists, nav])

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
    setShowListSelector(false)
    setIsBulkEmailMode(false)
    nav.pop()
    setBulkEmailList(null)
    setBulkEmailListId(null)
    setIsSendingBulkEmails(false)
  }, [lists, settings.emailTestMode, settings.defaultEmail, nav])

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

  const handleSkipTraceList = useCallback(async (listId) => {
    if (authLoading) return
    if (!currentUser?.uid) { nav.openLogin(); return }
    const list = lists.find((l) => l.id === listId)
    if (!list?.parcels?.length) {
      showToast('List has no parcels to skip trace', 'error')
      return
    }
    const parcelsToTrace = []
    for (const parcel of list.parcels) {
      const parcelId = parcel?.id || parcel?.properties?.PROP_ID || parcel
      const parcelData = typeof parcel === 'object' && parcel?.properties
        ? { id: parcelId, properties: parcel.properties }
        : { id: parcelId, properties: { PROP_ID: parcelId } }
      const { payload, error } = buildSkipTraceRequest(parcelData, {
        previousFullAddress: getSkipTracedParcel(parcelId)?.address || ''
      })
      if (payload) parcelsToTrace.push({ parcelId, address: payload.address, request: payload })
      else if (error) console.warn('skip trace list skip parcel', parcelId, error)
    }
    if (!parcelsToTrace.length) {
      showToast('No parcels with valid addresses to skip trace', 'error')
      return
    }
    addSkipTraceJob({
      listId: list.id,
      listName: list.name,
      parcelsToTrace,
      status: 'pending'
    })
    scheduleUserDataSync(getToken)
    setSkipTracingInProgress((prev) => {
      const next = new Set(prev)
      parcelsToTrace.forEach((p) => next.add(p.parcelId))
      return next
    })
    showToast(`Skip trace queued for "${list.name}" (${parcelsToTrace.length} parcels)`, 'info')
  }, [authLoading, currentUser, lists, getToken])

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
    const previousFullAddress = getSkipTracedParcel(parcelId)?.address || ''

    const { payload: requestParcel, error: addressError } = buildSkipTraceRequest(parcelData, {
      previousFullAddress
    })
    if (addressError) {
      showToast(addressError, 'error', 5000)
      return
    }

    // Check if already in progress
    if (skipTracingInProgress.has(parcelId)) {
      showToast('Skip trace already in progress for this parcel', 'info')
      return
    }

    // Re-running on an already-traced parcel is allowed; we merge new results
    // into the existing record so user-added contacts and user-set flags
    // (primary, verified, callerId edits) are preserved.
    const isRefresh = isParcelSkipTraced(parcelId)

    try {
      // Mark as in progress
      setSkipTracingInProgress(prev => new Set(prev).add(parcelId))

      showToast(isRefresh ? 'Refreshing contact info...' : 'Starting skip trace...', 'info', 2000)

      const result = await skipTraceParcels([requestParcel])
      
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
      
      if (results.length === 0) {
        console.warn('Skip trace completed but returned no results. This may mean no contact information was found for this parcel.')
        showToast('Skip trace completed, but no contact information was found for this parcel.', 'warning')
        notifySkipTraceEvent(requestParcel.address || parcelId, 'no contact information found')
        return
      }

      const contactInfo = results[0]

      // Surface per-parcel errors from the provider (e.g. 403 Forbidden, network
      // errors) instead of silently saving an empty record and showing "Success!".
      if (contactInfo.error) {
        console.error('Skip trace provider error:', contactInfo.error)
        showToast(`Skip trace failed: ${contactInfo.error}`, 'error', 8000)
        notifySkipTraceEvent(requestParcel.address || parcelId, contactInfo.error, { failed: true })
        return
      }

      // If the provider responded OK but found no contacts, say so explicitly.
      const hasAnyContact = (contactInfo.phoneNumbers?.length || 0) > 0 ||
                            (contactInfo.emails?.length || 0) > 0
      if (!hasAnyContact) {
        const warnings = Array.isArray(contactInfo.warnings) ? contactInfo.warnings : []
        const hasInvalidAddress = warnings.some((w) => /invalid address/i.test(w))
        const hasMissingInput = warnings.some((w) => /missing input/i.test(w))
        let message
        if (hasInvalidAddress) {
          message = 'Trestle could not validate this mailing address. Double-check the street number, street name, city, state, and zip for this parcel.'
        } else if (hasMissingInput) {
          message = 'Skip trace request was missing required address fields (need street, city, state, zip).'
        } else {
          const warn = warnings.length ? ` (${warnings.join(', ')})` : ''
          message = `No contact info found for this parcel${warn}.`
        }
        console.warn(
          `[skipTrace] no contacts returned. warnings=[${warnings.join(' | ')}] | request sent: street="${requestParcel.street}" city="${requestParcel.city}" state="${requestParcel.state}" zip="${requestParcel.zip}" | address="${requestParcel.address}" | trestle.address="${contactInfo.address || ''}"`
        )
        console.warn('[skipTrace] parcel props keys:', Object.keys(parcelData?.properties || {}))
        console.warn('[skipTrace] full contactInfo:', JSON.stringify(contactInfo, null, 2))
        showToast(message, 'warning', 7000)
        notifySkipTraceEvent(requestParcel.address || parcelId, message)
        return
      }
      
      
      // Ensure phoneNumbers is an array
      const phoneNumbers = Array.isArray(contactInfo.phoneNumbers) 
        ? contactInfo.phoneNumbers 
        : (contactInfo.phone ? [contactInfo.phone] : [])
      
      // Ensure emails is an array
      const emails = Array.isArray(contactInfo.emails)
        ? contactInfo.emails
        : (contactInfo.email ? [contactInfo.email] : [])
      
      // Save to global list — preserve phoneDetails/emailDetails (with per-contact
      // callerId from Trestle) when the API returns them.
      const dataToSave = {
        phone: contactInfo.phone || phoneNumbers[0] || null,
        email: contactInfo.email || emails[0] || null,
        phoneNumbers: phoneNumbers,
        emails: emails,
        phoneDetails: contactInfo.phoneDetails,
        emailDetails: contactInfo.emailDetails,
        address: contactInfo.address || null,
        skipTracedAt: new Date().toISOString()
      }
      
      
      saveSkipTracedParcel(parcelId, dataToSave, { merge: isRefresh })
      scheduleUserDataSync(getToken)

      // Verify it was saved
      const saved = getSkipTracedParcel(parcelId)

      // Add to skip traced list
      addParcelToSkipTracedList(parcelData)
      scheduleUserDataSync(getToken)

      showToast(isRefresh ? 'Contact info refreshed!' : 'Skip trace completed successfully!', 'success')
      notifySkipTraceEvent(requestParcel.address || parcelId, isRefresh ? 'contact info refreshed' : 'contacts found')
      
      // Update clicked parcel data if it's the current parcel (for both map popup and list)
      if (clickedParcelData && clickedParcelData.id === parcelId) {
        nav.patchTopOverlay({
          parcelData: {
            ...clickedParcelData,
            skipTraced: getSkipTracedParcel(parcelId),
          },
        })
      }
      
      if (clickedParcelId === parcelId && clickedParcelData && !isParcelDetailsOpen) {
        openParcelPopup({ ...clickedParcelData, id: parcelId })
      }
    } catch (error) {
      console.error('Skip trace error:', error)
      showToast(`Skip trace failed: ${error.message}`, 'error')
      notifySkipTraceEvent(parcelId, error.message, { failed: true })
    } finally {
      setSkipTracingInProgress(prev => {
        const next = new Set(prev)
        next.delete(parcelId)
        return next
      })
    }
  }, [clickedParcelData, clickedParcelId, skipTracingInProgress, lists, isParcelALeadCheck, openParcelPopup, isParcelDetailsOpen, nav])

  return (
    <UserDataSyncProvider getToken={getToken}>
    <AppLoadingScreen active={showAppLoading} />
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
          setShowMenu={nav.setShowMenu}
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
          {/* <NorthIndicator mapRef={mapInstanceRef} /> */}
          <PMTilesParcelLayer 
            mapRef={mapInstanceRef}
            mapReady={mapReady}
            onParcelClick={handleParcelClick}
            clickedParcelId={
              selectedHailEvent
                ? (hailStormParcel?.id ?? hailDataParcel?.id ?? clickedParcelId)
                : clickedParcelId
            }
            selectedParcels={selectedParcels}
            isMultiSelectActive={isMultiSelectActive}
            selectedListIds={selectedListIds}
            lists={lists}
            boundaryColor={settings.parcelBoundaryColor}
            boundaryOpacity={settings.parcelBoundaryOpacity}
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
          <HailStormOverlay tileUrl={hailStormTimeline.tileUrl} />
          {selectedHailEvent && hailParcelCoords ? (
            <HailStormMapMarkers
              parcel={hailParcelCoords}
              event={selectedHailEvent}
              address={
                hailStormParcel?.address
                ?? hailStormParcel?.properties?.SITUS_ADDR
                ?? hailDataParcel?.address
                ?? hailDataParcel?.properties?.SITUS_ADDR
              }
            />
          ) : null}
        </MapGL>
        <HailStormDismissPill
          event={selectedHailEvent}
          timeline={hailStormTimeline}
          onDismiss={handleDismissHailEvent}
        />
      </div>

      <ParcelPopupV1
        popupData={popupData}
        clickedParcelData={clickedParcelData}
        mapRef={mapInstanceRef}
        onClose={handleCloseParcelPopup}
        onOpenDetails={() => handleOpenParcelDetails()}
        onAddToList={() => { setShowListSelector(true); openListPanel() }}
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
        onCloseParcelPopup={() => nav.clearMapOverlays()}
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
          nav.clearMapOverlays()
        }}
        onOpenListPanel={openListPanel}
        selectedListIds={selectedListIds}
        onOpenSkipTracedListPanel={() => {
          if (authLoading) return
          if (!currentUser || !currentUser.uid) {
            nav.openLogin()
            return
          }
          nav.openSkipTraced()
        }}
        onOpenOutreach={handleOpenOutreach}
        onTogglePathTracking={() => {
          if (authLoading) return
          if (!currentUser || !currentUser.uid) {
            nav.openLogin()
            return
          }
          handleTogglePathTracking()
        }}
        isPathTrackingActive={isPathTrackingActive}
        onOpenPathsPanel={openPathsPanel}
        onOpenTeamsPanel={openTeamsPanel}
        onOpenSettings={openSettingsPanel}
        onOpenLeads={openLeadsPanel}
        onOpenDeals={openDealsPanel}
        onOpenForms={openFormsPanel}
        onOpenQuotes={openQuotesPanel}
        onOpenPipes={openDealPipeline}
        onOpenTasks={openTasks}
        onOpenSchedule={openSchedule}
        currentUser={currentUser}
        onLogin={openLogin}
        onLogout={logout}
        showMenu={showMenu}
        setShowMenu={nav.setShowMenu}
        hideMenuOnMobile={true}
        onCloseParcelPopup={() => nav.clearMapOverlays()}
        NotificationMenuItem={notificationInbox.MenuItem}
      />

      <MobileActionBar
        activeId={
          isDealPipelineOpen ? 'pipes'
          : isTasksPanelOpen ? 'tasks'
          : isSchedulePanelOpen ? 'schedule'
          : null
        }
        onOpenPipes={openDealPipeline}
        onOpenTasks={openTasks}
        onOpenSchedule={openSchedule}
        showMenu={showMenu}
        setShowMenu={nav.setShowMenu}
        onOpenListPanel={openListPanel}
        selectedListIds={selectedListIds}
        onOpenPathsPanel={openPathsPanel}
        isPathTrackingActive={isPathTrackingActive}
        onOpenOutreach={handleOpenOutreach}
        onOpenLeads={openLeadsPanel}
        onOpenDeals={openDealsPanel}
        onOpenForms={openFormsPanel}
        onOpenQuotes={openQuotesPanel}
        onOpenTeamsPanel={openTeamsPanel}
        onOpenSettings={openSettingsPanel}
        currentUser={currentUser}
        onLogin={openLogin}
        NotificationMenuItem={notificationInbox.MenuItem}
      />

      <ListPanel
        currentUser={currentUser}
        isOpen={isListPanelOpen && !isParcelListPanelOpen}
        onClose={() => {
          handlePanelBack()
          setShowListSelector(false)
        }}
        onBack={handlePanelBack}
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
        teamMembership={teamMembership}
        onValidateShareEmail={(email) => validateShareEmail(getToken, email)}
        onCreateList={async (name) => {
          await createList(getToken, name, [])
          await refreshLists()
        }}
        onViewListContents={(listId) => nav.viewListContents(listId)}
        onExportList={handleExportList}
        isAddingSingleParcel={showListSelector && !!clickedParcelData}
        isBulkEmailMode={showListSelector && !!selectedEmailTemplate}
        parcelBoundaryColor={settings.parcelBoundaryColor}
      />

      <ParcelListPanel
        isOpen={isParcelListPanelOpen}
        onClose={() => nav.pop()}
        selectedListId={viewingListId}
        lists={lists}
        onCenterParcel={(location) => {
          if (mapRef.current) {
            mapRef.current.flyTo({ center: [location.lng, location.lat], zoom: 17, duration: 500 })
          }
        }}
        onBack={() => nav.pop()}
        onRemoveParcel={handleRemoveParcelFromList}
        onOpenParcelDetails={handleOpenParcelDetails}
        onPhoneClick={handlePhoneClick}
        onSkipTraceParcel={handleSkipTraceParcel}
        onConvertToLead={handleConvertToLead}
        isParcelALead={isParcelALeadCheck}
        onExportList={handleExportList}
        skipTracingInProgress={skipTracingInProgress}
      />

      {createPortal(
        <ParcelDetails
          isOpen={isParcelDetailsOpen}
          suspendClose={isHailDataOpen || hailOpening}
          onClose={handleParcelDetailsClose}
          parcelData={clickedParcelData}
          onEmailClick={handleEmailClick}
          onPhoneClick={handlePhoneClick}
          lists={lists}
          enableAutoClose={false}
          popupData={clickedParcelData ? {
            ...(popupData || {}),
            parcelId: clickedParcelData.id,
            isSkipTracing: skipTracingInProgress.has(clickedParcelData.id),
            hasSkipTraced: isParcelSkipTraced(clickedParcelData.id),
          } : popupData}
          isLead={clickedParcelData ? isParcelALeadCheck(clickedParcelData.id) : false}
          onSkipTrace={() => { if (clickedParcelData) handleSkipTraceParcel(clickedParcelData) }}
          onAddToList={() => {
            suppressParcelDetailsDataClearRef.current = true
            setShowListSelector(true)
            nav.popMapOverlay()
            openListPanel()
          }}
          onConvertToLead={() => { if (clickedParcelData) handleConvertToLead(clickedParcelData) }}
          onHailData={() => {
            if (!clickedParcelData) return
            setSelectedHailEvent(null)
            setHailOpening(true)
            suppressParcelDetailsDataClearRef.current = true
            nav.openHailOverlay({ type: 'hail', parcelId: clickedParcelData.id, parcelData: clickedParcelData })
          }}
          /* roof inspector — restore later
          onRoofInspector={() => {
            if (!clickedParcelData) return
            setRoofInspectorParcel(clickedParcelData)
            suppressParcelDetailsDataClearRef.current = true
            returnToParcelDetailsAfterRoofRef.current = true
            setIsParcelDetailsOpen(false)
            setIsRoofInspectorOpen(true)
          }}
          */
        />,
        document.body
      )}

      <SkipTracedListPanel
        isOpen={isSkipTracedListPanelOpen}
        onClose={() => nav.pop()}
        onOpenParcelDetails={handleOpenParcelDetails}
      />

      <DealPipeline
        isOpen={isDealPipelineOpen}
        instantDismiss={skipPanelExitAnimation}
        onClose={handlePanelBack}
        onBack={handlePanelBack}
        pipelines={pipelines}
        activePipelineId={activePipelineId}
        focusDealId={pipesDealId}
        pipesLeadOverlayId={pipesLeadOverlayId}
        onOpenDeal={(dealId) => nav.pushPipesDeal(dealId)}
        onOpenLeadOverlay={(leadId) => nav.pushPipesLead(leadId)}
        onCloseDeal={() => nav.pop()}
        onCloseLeadOverlay={() => nav.pop()}
        addTaskRequestKey={dealPipelineAddTaskKey}
        addTaskRequestParcelId={dealPipelineAddTaskParcelId}
        onAddTaskRequestHandled={handleDealPipelineAddTaskHandled}
        onPipelinesChange={refreshPipelines}
        onActivePipelineChange={setActivePipelineId}
        onSharePipeline={handleSharePipeline}
        onSharePipelineWithTeams={handleSharePipelineWithTeams}
        onDeletePipeline={handleDeletePipeline}
        teams={teams}
        teamMembership={teamMembership}
        onValidateShareEmail={(email) => validatePipelineShareEmail(getToken, email)}
        currentUser={currentUser}
        getToken={getToken}
        leads={leads}
        deals={activePipelineDeals}
        onDealsChange={pipelines.length > 0 ? async (newDeals) => {
          if (!activePipelineId) return
          try {
            await updatePipeline(getToken, activePipelineId, { deals: newDeals })
            setPipelines((prev) => prev.map((p) => p.id === activePipelineId
              ? { ...p, deals: newDeals }
              : p))
            await refreshPipelines()
          } catch (e) { showToast(e.message || 'Failed to update', 'error') }
        } : setDealPipelineDeals}
        onOpenCreateDeal={(prefill) => openCreateDealDialog({ pipelineId: activePipelineId, ...prefill })}
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
        onOpenScheduleAtDate={(ts) => openScheduleAtDate(ts)}
        onGoToParcelOnMap={handleGoToParcelOnMap}
        onRequestCloseDeal={handleCloseDeal}
        onRequestRemoveDeal={handleRemoveDeal}
        onRequestMoveDeal={handleRequestMoveDeal}
        onLeadsChange={setLeads}
        onRefreshLeads={refreshLeads}
        onCreateQuoteForDeal={handleCreateQuoteForDeal}
        onOpenQuoteFromDeal={handleOpenQuoteFromDeal}
        quotesRefreshKey={quotesRefreshEpoch}
        canSeeDealAmounts={showDealAmounts}
        onEditLead={handleEditLead}
      />

      <SchedulePanel
        isOpen={isSchedulePanelOpen}
        stacked={scheduleStacked}
        onClose={closeSchedulePanel}
        onBack={handlePanelBack}
        hasScheduleOpener={hasScheduleOpener}
        initialDate={scheduleInitialDate}
        onInitialDateConsumed={() => nav.consumeScheduleInitialDate()}
        scheduleLeadId={scheduleLeadId}
        onOpenScheduleLead={(leadId) => nav.pushScheduleLead(leadId)}
        onCloseScheduleLead={() => nav.pop()}
        leads={leads}
        pipelines={pipelines}
        activePipelineId={activePipelineId}
        deals={activePipelineDeals}
        onLeadsChange={() => refreshLeads()}
        onDealsChange={() => refreshPipelines()}
        onOpenParcelDetails={handleOpenParcelDetails}
        onEmailClick={handleEmailClick}
        onPhoneClick={handlePhoneClick}
        onSkipTraceParcel={handleSkipTraceParcel}
        skipTracingInProgress={skipTracingInProgress}
        onGoToParcelOnMap={handleGoToParcelOnMap}
        getToken={getToken}
        currentUser={currentUser}
        onPipelinesChange={refreshPipelines}
        teams={teams}
        teamMembership={teamMembership}
        onEditLead={handleEditLead}
      />

      <TasksPanel
        isOpen={isTasksPanelOpen}
        onClose={handlePanelBack}
        onBack={handlePanelBack}
        pipelines={pipelines}
        activePipelineId={activePipelineId}
        leads={leads}
        deals={activePipelineDeals}
        onLeadsChange={() => refreshLeads()}
        onDealsChange={() => refreshPipelines()}
        onOpenTaskInDealPipeline={handleOpenTaskInDealPipeline}
        getToken={getToken}
        currentUser={currentUser}
        onPipelinesChange={refreshPipelines}
        teams={teams}
        onOpenScheduleAtDate={(ts) => openScheduleAtDate(ts)}
        onOpenLead={openLeadDetails}
      />

      <PhoneActionPanel
        isOpen={!!phoneActionPanel}
        onClose={() => nav.popMapOverlay()}
        phone={phoneActionPanel?.phone}
        parcelData={phoneActionPanel?.parcelData}
      />

      <OutreachPanel
        isOpen={isOutreachPanelOpen}
        onClose={() => {
          nav.pop()
          setSelectedEmailTemplate(null)
          setIsBulkEmailMode(false)
        }}
        onUseTemplate={
          isBulkEmailMode || emailComposerParcelData || emailComposerRecipient.email
            ? handleTemplateSelect
            : undefined
        }
        initialTab={outreachInitialTab}
      />

      <EmailComposer
        isOpen={isEmailComposerOpen}
        onClose={() => {
          nav.pop()
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
          nav.pop()
          setBulkEmailList(null)
          setBulkEmailListId(null)
        }}
        template={selectedEmailTemplate}
        list={bulkEmailList}
        listId={bulkEmailListId || navBulkEmailListId}
        onConfirm={handleBulkEmailConfirm}
        onCancel={() => {
          nav.pop()
          setBulkEmailList(null)
          setBulkEmailListId(null)
        }}
      />

      {isFormsPanelOpen && (
        <Suspense fallback={null}>
          <FormsPanel
            isOpen={isFormsPanelOpen}
            onClose={handlePanelBack}
            onBack={handlePanelBack}
            formsView={formsView}
            formsTemplateId={formsTemplateId}
            onOpenEdit={(templateId) => nav.pushFormsEdit(templateId)}
            onOpenFill={(templateId) => nav.pushFormsFill(templateId)}
            onCloseSubView={() => nav.popFormsSubView()}
            teams={teams}
            teamMembership={teamMembership}
            onShareForm={handleShareForm}
            onShareFormWithTeams={handleShareFormWithTeams}
            onValidateShareEmail={(email) => validateShareEmail(getToken, email)}
          />
        </Suspense>
      )}

      {isQuotesPanelOpen && (
          <QuotesPanel
            isOpen={isQuotesPanelOpen}
            onClose={handlePanelBack}
            onBack={handlePanelBack}
            pipelines={pipelines}
            leads={leads}
            editorFrame={quotesEditorFrame}
            detailQuoteId={quotesDetailQuoteId}
            detailQuote={quotesDetailQuote}
            quotesDetailReturnToDeal={quotesDetailReturnToDeal}
            onOpenEditor={(frame) => nav.pushQuotesEditor(frame)}
            onOpenDetail={(quoteId) => nav.pushQuotesDetail(quoteId)}
            onCloseEditor={handleCloseQuoteEditor}
            onCloseDetail={handleCloseQuoteDetail}
            canSeeDealAmounts={showDealAmounts}
            teams={teams}
            teamMembership={teamMembership}
          />
      )}

      <PathsPanel
        isOpen={isPathsPanelOpen}
        onClose={handlePanelBack}
        onBack={handlePanelBack}
        currentUser={currentUser}
        paths={paths}
        onPathsChange={refreshPaths}
        onDeletePath={handleDeletePath}
        onRenamePath={handleRenamePath}
        onSharePath={handleSharePath}
        onSharePathWithTeams={handleSharePathWithTeams}
        teams={teams}
        teamMembership={teamMembership}
        onValidateShareEmail={(email) => validateShareEmail(getToken, email)}
        onCenterOnPath={handleCenterOnPath}
        visiblePathIds={visiblePathIds}
        onTogglePathVisibility={handleTogglePathVisibility}
        distanceUnit={settings.distanceUnit}
      />

      <TeamsPanel
        isOpen={isTeamsPanelOpen}
        onClose={handlePanelBack}
        onBack={handlePanelBack}
        detailTeamId={teamsDetailTeamId}
        onOpenTeamDetail={(teamId) => nav.pushTeamsDetail(teamId)}
        onCloseTeamDetail={() => nav.pop()}
        currentUser={currentUser}
        getToken={getToken}
        teams={teams}
        onTeamsChange={refreshTeams}
        pendingInvites={pendingTeamInvites}
        teamMembership={teamMembership}
      />

      <SettingsPanel
        isOpen={isSettingsPanelOpen}
        onClose={() => nav.pop()}
        settings={settings}
        onSettingsChange={handleSettingsChange}
        getToken={getToken}
        onRestartTour={() => {
          nav.pop()
          nav.setShowMenu(false)
          handleSettingsChange({ tourCompleted: false })
        }}
        onLogout={currentUser ? handleLogout : undefined}
      />

      {notificationInbox.panel}

      <LeadsPanel
        isOpen={isLeadsPanelOpen}
        instantDismiss={skipPanelExitAnimation}
        onClose={handlePanelBack}
        onBack={handlePanelBack}
        leads={leads}
        pipelines={pipelines}
        onLeadsChange={setLeads}
        onRefreshLeads={refreshLeads}
        getToken={getToken}
        onResolveParcel={handleResolveParcelForLead}
        onOpenParcelDetails={handleOpenParcelDetails}
        onEmailClick={handleEmailClick}
        onPhoneClick={handlePhoneClick}
        onGoToParcelOnMap={handleGoToParcelOnMap}
        createDealPipelines={pipelines.filter((p) => canAddDealsToPipeline(currentUser, p, teams))}
        createDealSaving={createDealSaving}
        onCreateDealSubmit={handleCreateDealSubmit}
        pipelinesCount={pipelines.length}
        onOpenDeal={(deal, pipelineId) => {
          guardFeature('deals', () => {
            if (pipelineId) setActivePipelineId(pipelineId)
            nav.openDealInPipes(pipelineId || activePipelineId, deal.id)
          })
        }}
        onOpenScheduleAtDate={(ts) => openScheduleAtDate(ts)}
        onPipelinesChange={refreshPipelines}
        teams={teams}
        teamMembership={teamMembership}
        detailLeadId={leadsDetailLeadId}
        onOpenLeadDetail={(leadId) => guardFeature('leads', () => nav.pushLeadsDetail(leadId))}
        onCloseLeadDetail={() => nav.pop()}
        currentUserId={currentUser?.uid}
        canSeeDealAmounts={showDealAmounts}
        onEditLead={handleEditLead}
      />

      <DealsPanel
        isOpen={isDealsPanelOpen}
        instantDismiss={skipPanelExitAnimation}
        onClose={handlePanelBack}
        onBack={handlePanelBack}
        pipelines={pipelines}
        leads={leads}
        closedDeals={closedDeals}
        onDealUpdate={handleDealUpdate}
        onRequestMoveDeal={handleRequestMoveDeal}
        onRequestCloseDeal={handleCloseDeal}
        onRequestRemoveDeal={handleRemoveDeal}
        onCreateDeal={() => openCreateDealDialog()}
        onCreateDealTemplate={() => openCreateDealTemplateEditor(null)}
        onManageDealTemplates={openManageDealTemplates}
        getToken={getToken}
        teams={teams}
        teamMembership={teamMembership}
        onPipelinesChange={refreshPipelines}
        onOpenScheduleAtDate={(ts) => openScheduleAtDate(ts)}
        onLeadsChange={setLeads}
        onRefreshLeads={refreshLeads}
        onOpenParcelDetails={handleOpenParcelDetails}
        onEmailClick={handleEmailClick}
        onPhoneClick={handlePhoneClick}
        onGoToParcelOnMap={handleGoToParcelOnMap}
        currentUserId={currentUser?.uid}
        onCreateQuoteForDeal={handleCreateQuoteForDeal}
        onOpenQuoteFromDeal={handleOpenQuoteFromDeal}
        quotesRefreshKey={quotesRefreshEpoch}
        dealsDetailDealId={dealsDetailDealId}
        dealsDetailPipelineId={dealsDetailPipelineId}
        dealsClosedRecordId={dealsClosedRecordId}
        dealsLeadOverlayId={dealsLeadOverlayId}
        onOpenDealDetail={(dealId, pipelineId) => nav.pushDealsDetail(dealId, pipelineId)}
        onOpenClosedDeal={(closedRecordId) => nav.pushDealsClosed(closedRecordId)}
        onOpenLeadOverlay={(leadId) => nav.pushDealsLead(leadId)}
        onCloseDealDetail={() => nav.pop()}
        onCloseLeadOverlay={() => nav.pop()}
        onCloseClosedDeal={() => nav.pop()}
        createDealPipelines={pipelines.filter((p) => canAddDealsToPipeline(currentUser, p, teams))}
        createDealSaving={createDealSaving}
        onCreateDealSubmit={handleCreateDealSubmit}
        pipelinesCount={pipelines.length}
        canSeeDealAmounts={showDealAmounts}
        onEditLead={handleEditLead}
      />

      <CreateLeadDialog
        open={createLeadOpen || !!editLead}
        onOpenChange={(v) => {
          if (!v) {
            setEditLead(null)
            if (createLeadOpen) nav.popModal()
          }
        }}
        prefill={createLeadPrefill}
        editLead={editLead}
        getToken={getToken}
        onResolveParcel={handleResolveParcelForLead}
        onCreated={handleLeadCreated}
        onUpdated={handleLeadUpdated}
        existingLeads={leads}
        teams={teams}
        teamMembership={teamMembership}
        nestedOverlay={!!editLead || createLeadOpen}
        topLayer={!!editLead}
        confirmLayer={!!editLead}
      />

      <DealTemplatePickerDialog
        open={dealTemplatePickerOpen}
        onOpenChange={(v) => { if (!v) nav.popModal() }}
        onSelect={handleDealTemplatePicked}
        nestedOverlay={dealTemplateNestedOverlay}
      />

      <DealTemplateEditorDialog
        open={dealTemplateEditorOpen}
        onOpenChange={(v) => { if (!v) nav.popModal() }}
        templateId={editingDealTemplateId}
        pipelines={pipelines.filter((p) => canAddDealsToPipeline(currentUser, p, teams))}
        teams={teams}
        onSaved={bumpDealTemplatesRefresh}
        nestedOverlay={dealTemplateNestedOverlay || dealTemplatesManagerOpen}
        canSeeDealAmounts={showDealAmounts}
      />

      <DealTemplatesManagerDialog
        open={dealTemplatesManagerOpen}
        onOpenChange={(v) => { if (!v) nav.popModal() }}
        onCreateTemplate={() => openCreateDealTemplateEditor(null)}
        onEditTemplate={(id) => {
          nav.popModal()
          openCreateDealTemplateEditor(id)
        }}
        refreshKey={dealTemplatesRefreshKey}
        nestedOverlay={isDealsPanelOpen}
      />

      <CreateDealDialog
        open={createDealOpen}
        onOpenChange={(v) => { if (!v) nav.popModal() }}
        prefill={createDealPrefill}
        leads={leads}
        pipelines={pipelines.filter((p) => canAddDealsToPipeline(currentUser, p, teams))}
        teams={teams}
        saving={createDealSaving}
        onSubmit={handleCreateDealSubmit}
        nestedOverlay={dealTemplateNestedOverlay || dealTemplatePickerOpen}
        canSeeDealAmounts={showDealAmounts}
      />

      <HailDataPanel
        isOpen={isHailDataOpen}
        onClose={handleCloseHailData}
        parcelData={hailDataParcel}
        onSelectEvent={handleSelectHailEvent}
      />

      {/*
      <RoofInspectorPanel
        isOpen={isRoofInspectorOpen}
        onClose={() => {
          setIsRoofInspectorOpen(false)
          if (returnToParcelDetailsAfterRoofRef.current) {
            returnToParcelDetailsAfterRoofRef.current = false
            setIsParcelDetailsOpen(true)
          }
        }}
        parcelData={roofInspectorParcel}
      />
      */}

      {/* Authentication Dialogs */}
      <Login
        isOpen={isLoginOpen}
        onClose={() => nav.closeAuthModals()}
        onSwitchToSignUp={() => nav.openSignUp()}
        onSwitchToForgotPassword={() => nav.openForgotPassword()}
      />
      <SignUp
        isOpen={isSignUpOpen}
        onClose={() => nav.closeAuthModals()}
        onSwitchToLogin={() => nav.openLogin()}
      />
      <ForgotPassword
        isOpen={isForgotPasswordOpen}
        onClose={() => nav.closeAuthModals()}
        onSwitchToLogin={() => nav.openLogin()}
      />

      <ConvertToLeadPipelineDialog
        open={!!moveDealContext}
        onOpenChange={(o) => { if (!o) nav.popModal() }}
        pipelines={moveDealContext?.eligiblePipelines ?? []}
        currentUser={currentUser}
        title="Move to which pipeline?"
        description="Choose a pipeline to move this deal into."
        onSelect={(targetPipelineId) => {
          const ctx = moveDealContext
          nav.popModal()
          if (ctx?.deal && ctx?.sourcePipelineId) {
            handleMoveDeal(ctx.deal, ctx.sourcePipelineId, targetPipelineId)
          }
        }}
      />

      <ToastContainer />
      <ConfirmDialog />
    </div>
    </UserDataSyncProvider>
  )
}

export default App

export function AppWithPublicFormRoute() {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const formToken = params?.get('form')
  const quoteToken = params?.get('quote')
  if (formToken) {
    return (
      <div className="h-[100dvh] overflow-hidden">
        <PublicFormPage token={formToken} />
        <ToastContainer />
      </div>
    )
  }
  if (quoteToken) {
    return (
      <div className="h-[100dvh] overflow-hidden">
        <PublicQuotePage token={quoteToken} />
        <ToastContainer />
      </div>
    )
  }
  return <App />
}
