import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { getModalPortalContainer } from './utils/modalPortal'
import MapGL, { Marker as MapMarker, Source, Layer } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { CompassOrientation } from './components/CompassOrientation'
// import { NorthIndicator } from './components/NorthIndicator'
import { PMTilesParcelLayer } from './components/PMTilesParcelLayer'
import { StateBoundaryLayer } from './components/StateBoundaryLayer'
import { MapControls } from './components/MapControls'
import { MobileActionBar } from './components/MobileActionBar'
import { QuickCreateFab } from './components/QuickCreateFab'
import { AddressSearch } from './components/AddressSearch'
import { ListPanel } from './components/ListPanel'
import { SkipTracedListPanel } from './components/SkipTracedListPanel'
import { ParcelListPanel } from './components/ParcelListPanel'
import { ParcelDetailsV3 as ParcelDetails } from './components/parcel-details'
import { ParcelPopupV1 } from './components/parcel-popup'
import { PhoneActionPanel } from './components/PhoneActionPanel'
import { EmailActionPanel } from './components/EmailActionPanel'
import { Login } from './components/Login'
import { SignUp } from './components/SignUp'
import { ForgotPassword } from './components/ForgotPassword'
import { ToastContainer, showToast } from './components/ui/toast'
import { ConfirmDialog, showConfirm } from './components/ui/confirm-dialog'
import { useAuth } from './contexts/AuthContext'
import { useNavigation } from './navigation/NavigationContext'
import { UserDataSyncProvider } from './contexts/UserDataSyncContext'
import { loadUserData, scheduleUserDataSync } from './utils/userDataSync'
import { fetchLists, updateList, deleteList, validateShareEmail } from './utils/lists'
import { fetchPipelines, createPipeline, updatePipeline, deletePipeline, validateShareEmail as validatePipelineShareEmail, canAddDealsToPipeline, canAddLeadsToPipeline, localPipelineMigrationKey, pipelinesUserCanWorkIn } from './utils/pipelines'
import { auth } from './config/firebase'
import { skipTraceParcels, pollSkipTraceJobUntilComplete, saveSkipTracedParcel, saveSkipTracedParcels, getSkipTracedParcel, isParcelSkipTraced, deleteSkipTracedParcel, buildSkipTraceRequest } from './utils/skipTrace'
import { resolveParcelId } from './utils/parcelPropertyMap'
import { resolveParcelCenter } from './utils/parcelGeometry'
import { resolveLeadParcelAtLocation, parcelDataFromLandRecords } from './utils/resolveLeadParcel'
import { addParcelToSkipTracedList, addListToSkipTracedList } from './utils/skipTracedList'
import { computeOwnerOccupied } from './utils/ownerOccupied'
import PathTracker from './components/PathTracker'
import { getUserLocation, setCurrentUserLocation, subscribeUserLocation, useUserLocation } from './utils/locationStore'
import { getCurrentPositionWithFallback, getWatchPositionOptions } from './utils/geolocation'
import { panelLazy, prefetchPanel } from './utils/panelChunks'
import { useStickyPanelMount } from './hooks/useStickyPanelMount'
import { clearAccountSessionCaches, syncAccountSessionUid } from './utils/accountSession'
const FormsPanel = lazy(panelLazy.forms)
const DealPipeline = lazy(panelLazy.dealPipeline)
const SchedulePanel = lazy(panelLazy.schedule)
const TasksPanel = lazy(panelLazy.tasks)
const PathsPanel = lazy(panelLazy.paths)
const QuotesPanel = lazy(panelLazy.quotes)
const ReportsPanel = lazy(panelLazy.reports)
const SettingsPanel = lazy(panelLazy.settings)
const TeamDetails = lazy(() => import('./components/TeamDetails').then((m) => ({ default: m.TeamDetails })))
const LeadsPanel = lazy(panelLazy.leads)
const DealsPanel = lazy(panelLazy.deals)
const OutreachPanel = lazy(panelLazy.outreach)
const EmailComposer = lazy(panelLazy.emailComposer)
const HailDataPanel = lazy(panelLazy.hailData)
import { setCachedDealQuotes, getCachedDealQuotes } from './utils/quotes'
import { PublicFormPage } from './components/forms/PublicFormPage'
import { ResetPasswordPage } from './components/ResetPasswordPage'
import { PublicQuotePage } from './components/quotes/PublicQuotePage'
import { PublicReportPage } from './components/reports/PublicReportPage'
import { LeadPickerDialog } from './components/photos/LeadPickerDialog'
import { PhotoCaptureModal } from './photos/PhotoCaptureModal'
import { QuickPhotoModeDialog } from './components/photos/QuickPhotoModeDialog'
import { PhotoUploadProvider } from './photos/PhotoUploadProvider'
import { fetchPaths, createPath, renamePath as renamePathApi, deletePath as deletePathApi, sharePath as sharePathApi, sharePathWithTeams as sharePathWithTeamsApi } from './utils/paths'
import { buildPathColorMap } from './utils/pathColors'
import { shareTemplate as shareTemplateApi, shareTemplateWithTeams as shareTemplateWithTeamsApi } from './utils/forms'
import { fetchTeamContext } from './utils/teams'
import { getAllTeamMembers } from './utils/teamTaskUtils'
import { resolveTeamMemberFeatures, canAccessTeamFeature, canSeeDealAmounts, TEAM_FEATURE_ACCESS_DENIED_MESSAGE, featureIdForFeedNav } from './utils/teamFeatures'
import { subscribeToWebPush } from './utils/pushNotifications'
import { reverseGeocodeCity, addressFromProperties, resolveParcelDisplayAddress } from './utils/reverseGeocode'
import { fetchLandRecordsParcel } from './utils/fetchLandRecordsParcel'
import { smoothPath, totalDistanceMiles, totalDistanceKm } from './utils/pathSmoothing'
import { ConvertToLeadPipelineDialog } from './components/ConvertToLeadPipelineDialog'
import { CreateLeadDialog } from './components/CreateLeadDialog'
import { CreateDealDialog } from './components/CreateDealDialog'
import { DealTemplatePickerDialog } from './components/DealTemplatePickerDialog'
import { DealTemplateEditorDialog } from './components/DealTemplateEditorDialog'
import { DealTemplatesManagerDialog } from './components/DealTemplatesManagerDialog'
import { templateToCreateDealPrefill } from './utils/dealTemplates'
import { AppLoadingScreen } from './components/AppLoadingScreen'
import { getAppLoadingMessage } from './config/appLoadingMessages'
import { getPublicRouteFromWindow } from './utils/publicLinks'
import { PanelListLoadingShell } from './components/ui/PanelListLoadingShell'
import { BasemapErrorBanner } from './components/BasemapErrorBanner'
import { useBasemapStyle } from './hooks/useBasemapStyle'
import { useTasksDockLayout } from './hooks/useTasksDockLayout'
import { usePrimaryPanelSwap } from './hooks/usePrimaryPanelSwap'
import { findDockablePrimaryRoot } from './navigation/taskDock'
import { resolvePanelDockSlot } from './navigation/panelDockSlot'
import { HailStormOverlay, HailStormDismissPill, HailStormMapMarkers } from './components/HailStormOverlay'
import { useHailStormTimeline } from './hooks/useHailStormTimeline'
// import { RoofInspectorPanel } from './components/RoofInspectorPanel' // roof inspector — restore later
import { PermissionPrompt, hasGrantedPermissions } from './components/PermissionPrompt'
import { NotificationPrompt } from './components/NotificationPrompt'
import { useNotificationInbox } from './components/NotificationInbox'
import { useTeamDataSync } from './hooks/useTeamDataSync'
import { countPendingUploadsByLeadId, shouldEnableSharedAssetSync } from './utils/sharedAssetSync'
import { photoUploadManager } from './photos/PhotoUploadManager'
import { getSettings, updateSettings } from './utils/settings'
import { resolveLeadStatuses } from './utils/leadStatuses'
import { applyUiTheme, getUiThemeFromSettings } from './utils/uiTheme'
import { getAllTasks, getLeadTasks, deleteAllLeadTasks, restoreLeadTasks, migrateLeadTasksToPipelines, updateTaskById } from './utils/leadTasks'
import { removePipelineTask, addPipelineTask } from './utils/pipelineTasks'
import { getParcelNote, saveParcelNote } from './utils/parcelNotes'
import { loadClosedDeals, addClosedDeal, buildClosedDealRecord, runApiPipelinesFreshStartMigration, runLeadsDealsFreshStartMigration } from './utils/closedDeals'
import {
  fetchLeads,
  fetchLeadById,
  mergeListViewLeads,
  mergeLeadDetail,
  mergeLeadDetailFromPhotoApi,
  isPhotosOnlyEntityChange,
  loadLocalLeads,
  saveLocalLeads,
  upsertLeadInLocalStore,
  createLead,
  buildLeadPrefillFromParcel,
  isParcelALead as isParcelInLeadsList,
  findLeadByParcelId,
  displayLeadName,
  getLeadStatus,
  leadNeedsPhotoHydrate,
  collectLeadsNeedingPhotoHydrate,
} from './utils/leads'
import {
  logLeadOutreach,
  bumpLeadStatusOnContact,
  setLeadStatus,
  logLeadDealCreated,
} from './utils/leadActivity'
import { fetchTagRegistry, upsertTagInRegistry } from './utils/tags'
import { buildDealFromLead, resolvePipelineId, findDealsForLead } from './utils/deals'
import { createTasksForDeal } from './utils/dealTasks'
import { loadColumns, loadDeals, saveDeals, loadTitle } from './utils/dealPipeline'
import { listToCsv } from './utils/exportList'
import { addSkipTraceJob, updateSkipTraceJob, getPendingSkipTraceJobs, removeSkipTraceJob, cleanupOldJobs } from './utils/skipTraceJobs'
import { useDeviceHeading } from './hooks/useDeviceHeading'
import { applySkipTraceContactsToLead, applySkipTraceResultsToLeads } from './utils/leadSkipTraceSync'
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

function LocationMarker() {
  // Subscribes to the location store so GPS ticks re-render only this marker.
  const position = useUserLocation()
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

  useLayoutEffect(() => {
    if (currentUser?.uid) syncAccountSessionUid(currentUser.uid)
  }, [currentUser?.uid])

  const nav = useNavigation()
  const pp = nav.panelProps

  const {
    isActivityPanelOpen,
    isActivityPanelFocused,
    isActivityPanelTopLayer,
    isTasksPanelTopLayer,
    isSettingsPanelTopLayer,
    isLeadsDetailTopLayer,
    isTeamsDetailTopLayer,
    isListPanelOpen,
    isParcelListPanelOpen,
    viewingListId,
    isLeadsPanelOpen,
    leadsDetailLeadId,
    isLeadsDetailStandalone,
    isDealsPanelOpen,
    isDealsDetailStandalone,
    dealsDetailDealId,
    dealsDetailPipelineId,
    dealsDetailReturnToPipes,
    dealsClosedRecordId,
    dealsLeadOverlayId,
    isDealPipelineOpen,
    pipesPipelineId,
    pipesPromotedDealId,
    pipesLeadOverlayId,
    isTasksPanelOpen,
    tasksDockLayout,
    isSchedulePanelOpen,
    scheduleInitialDate,
    scheduleStacked,
    hasScheduleOpener,
    isPathsPanelOpen,
    isFormsPanelOpen,
    formsView,
    formsTemplateId,
    isQuotesPanelOpen,
    isQuotesListOpen,
    quotesEditorFrame,
    quotesDetailQuoteId,
    quotesDetailQuote,
    quotesDetailReturnToDeal,
    isReportsPanelOpen,
    reportsEditorFrame,
    reportsEditorReturnToLead,
    reportsDetailReportId,
    reportsDetailReturnToLead,
    teamsDetailTeamId,
    isSettingsPanelOpen,
    isSkipTracedListPanelOpen,
    isOutreachPanelOpen,
    outreachInitialTab,
    isEmailComposerOpen,
    isParcelDetailsOpen,
    parcelDetailsSource,
    isHailDataOpen,
    hailDataParcel,
    phoneActionPanel,
    emailActionPanel,
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

  const { dockLeaving: tasksDockLeaving } = useTasksDockLayout(
    tasksDockLayout ?? { tasksDocked: false, primaryRoot: null },
    isTasksPanelOpen,
  )
  usePrimaryPanelSwap(
    tasksDockLayout?.tasksDocked
      ? null
      : findDockablePrimaryRoot(nav.state.navStack),
  )

  const dealDetailOverLead = !!(dealsDetailDealId && (leadsDetailLeadId || dealsLeadOverlayId))
  const panelDockSlot = (root, isOpen) => {
    if (dealDetailOverLead && (root === 'deals' || root === 'leads')) return 'primary'
    return resolvePanelDockSlot(root, isOpen, tasksDockLayout)
  }
  const leadOverlayPanelDockSlot =
    panelDockSlot('leads', !!(leadsDetailLeadId || dealsLeadOverlayId))
    ?? panelDockSlot('deals', !!(isDealsPanelOpen || isDealsDetailStandalone || dealsLeadOverlayId))

  const dealPipelineMounted = useStickyPanelMount(isDealPipelineOpen, pipesPromotedDealId, pipesLeadOverlayId)
  const schedulePanelMounted = useStickyPanelMount(isSchedulePanelOpen)
  const tasksPanelMounted = useStickyPanelMount(isTasksPanelOpen)
  const leadsPanelMounted = useStickyPanelMount(isLeadsPanelOpen, leadsDetailLeadId)
  const dealsPanelMounted = useStickyPanelMount(
    isDealsPanelOpen,
    dealsDetailDealId,
    dealsClosedRecordId,
    dealsLeadOverlayId,
  )
  const quotesPanelMounted = useStickyPanelMount(
    isQuotesPanelOpen,
    quotesEditorFrame,
    quotesDetailQuoteId,
  )
  const reportsPanelMounted = useStickyPanelMount(
    isReportsPanelOpen,
    reportsEditorFrame,
    reportsDetailReportId,
  )
  const teamDetailMounted = useStickyPanelMount(!!teamsDetailTeamId)
  const formsPanelMounted = useStickyPanelMount(isFormsPanelOpen)
  const pathsPanelMounted = useStickyPanelMount(isPathsPanelOpen)
  const outreachPanelMounted = useStickyPanelMount(isOutreachPanelOpen)
  const settingsPanelMounted = useStickyPanelMount(isSettingsPanelOpen)
  const emailComposerMounted = useStickyPanelMount(isEmailComposerOpen)
  const hailDataMounted = useStickyPanelMount(isHailDataOpen)
  
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

  const [selectedEmailTemplate, setSelectedEmailTemplate] = useState(null)
  const [emailComposerParcelData, setEmailComposerParcelData] = useState(null)
  const [emailComposerRecipient, setEmailComposerRecipient] = useState({ email: '', name: '' })
  const [emailComposerLeadId, setEmailComposerLeadId] = useState(null)
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
  const { getHeading, subscribeHeading, requestOrientation, needsGesture } = useDeviceHeading(permissionsReady)

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
  /** Parcel captured when opening Lists to add — survives closing popup/details overlays */
  const [parcelPendingForList, setParcelPendingForList] = useState(null)
  const [skipTracingInProgress, setSkipTracingInProgress] = useState(new Set()) // Track parcels being skip traced
  const [dealPipelineDeals, setDealPipelineDeals] = useState([])
  const [leads, setLeads] = useState([])
  const [leadsLoading, setLeadsLoading] = useState(false)
  const leadsRef = useRef(leads)
  const leadPickerCreateCallbackRef = useRef(null)
  const [tagRegistry, setTagRegistry] = useState({ leads: [], deals: [], paths: [], lists: [] })
  const [editLead, setEditLead] = useState(null)
  const [closedDeals, setClosedDeals] = useState(() => loadClosedDeals())
  const [pipelines, setPipelines] = useState([])
  const [pipelinesLoading, setPipelinesLoading] = useState(false)
  const pipelinesRef = useRef(pipelines)
  const [activePipelineId, setActivePipelineId] = useState(null)
  const [createDealSaving, setCreateDealSaving] = useState(false)
  const [dealTemplatesRefreshKey, setDealTemplatesRefreshKey] = useState(0)
  const [quotesRefreshEpoch, setQuotesRefreshEpoch] = useState(0)
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false)
  const [photoPickerParcelId, setPhotoPickerParcelId] = useState(null)
  const [photoPickerAddress, setPhotoPickerAddress] = useState('')
  const [photoModeLead, setPhotoModeLead] = useState(null)
  const photoModeLeadRef = useRef(photoModeLead)
  const leadsDetailLeadIdRef = useRef(leadsDetailLeadId)
  const hydratingLeadIdsRef = useRef(new Set())
  const deletedLeadIdsRef = useRef(new Set())
  const refreshLeadsGenerationRef = useRef(0)
  const [photoModeParcelId, setPhotoModeParcelId] = useState(null)
  const [photoModeAddress, setPhotoModeAddress] = useState('')
  const [photoModeAutoCamera, setPhotoModeAutoCamera] = useState(false)
  const [quickPhotoModeOpen, setQuickPhotoModeOpen] = useState(false)
  /** When set, user is choosing a target pipeline to move a deal into. */
  const [dealPipelineAddTaskKey, setDealPipelineAddTaskKey] = useState(0)
  const [dealPipelineAddTaskParcelId, setDealPipelineAddTaskParcelId] = useState(null)
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)
  const [quickCreateTaskKey, setQuickCreateTaskKey] = useState(0)
  const [quickCreateQuoteKey, setQuickCreateQuoteKey] = useState(0)
  const [quickCreateReportKey, setQuickCreateReportKey] = useState(0)
  const [isPathTrackingActive, setIsPathTrackingActive] = useState(false)
  const [paths, setPaths] = useState([])
  const pathColorMap = useMemo(() => buildPathColorMap(paths), [paths])
  const [visiblePathIds, setVisiblePathIds] = useState([])
  const [teams, setTeams] = useState([])
  const [teamMembership, setTeamMembership] = useState(null)
  const [pendingTeamInvites, setPendingTeamInvites] = useState([])
  const activeTeamForDetail = useMemo(
    () => (teamsDetailTeamId ? teams.find((t) => t.id === teamsDetailTeamId) : null),
    [teams, teamsDetailTeamId],
  )
  const teamMembers = useMemo(() => getAllTeamMembers(teams), [teams])
  const [selectedHailEvent, setSelectedHailEvent] = useState(null)
  /** Parcel context for storm map view after hail/parcel panels are dismissed */
  const [hailStormParcel, setHailStormParcel] = useState(null)
  const [hailOpening, setHailOpening] = useState(false)
  // const [isRoofInspectorOpen, setIsRoofInspectorOpen] = useState(false) // roof inspector — restore later
  // const [roofInspectorParcel, setRoofInspectorParcel] = useState(null)
  const [settings, setSettings] = useState(() => getSettings())
  /** Parcel boundary highlight when navigating from CRM (lead map) without opening popup */
  const [mapHighlightedParcelId, setMapHighlightedParcelId] = useState(null)

  useEffect(() => {
    applyUiTheme(getUiThemeFromSettings(settings))
  }, [settings.uiTheme])
  const pathTrackerRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const mapRef = useRef(null)
  const parcelLayerRef = useRef(null)
  const currentPopupRef = useRef(null)
  const isParcelDetailsOpenRef = useRef(false)
  isParcelDetailsOpenRef.current = isParcelDetailsOpen
  const suppressParcelDetailsDataClearRef = useRef(false)
  /** Restore parcel details under hail after exiting storm map view */
  const returnToParcelDetailsAfterHailEventRef = useRef(false)
  const parcelFetchAbortRef = useRef(null)
  const parcelRecenterTimerRef = useRef(null)
  const programmaticMoveRef = useRef(false)

  const centerMapOnParcel = useCallback(({
    lat,
    lng,
    zoom,
    duration = 500,
    mode = 'ease',
    onComplete,
  } = {}) => {
    const map = mapInstanceRef.current
    if (!map || lat == null || lng == null) return
    programmaticMoveRef.current = true
    const opts = { center: [lng, lat], duration, essential: true }
    if (zoom != null) opts.zoom = zoom
    if (mode === 'fly') map.flyTo(opts)
    else map.easeTo(opts)
    const clearProgrammatic = () => { programmaticMoveRef.current = false }
    map.once('moveend', () => {
      clearProgrammatic()
      onComplete?.()
    })
    setTimeout(clearProgrammatic, duration + 150)
  }, [])

  const cancelParcelPopupWork = useCallback(() => {
    currentPopupRef.current = null
    parcelFetchAbortRef.current?.abort()
    parcelFetchAbortRef.current = null
    if (parcelRecenterTimerRef.current) {
      clearTimeout(parcelRecenterTimerRef.current)
      parcelRecenterTimerRef.current = null
    }
  }, [])

  const prevClickedParcelIdRef = useRef(clickedParcelId)
  useEffect(() => {
    if (prevClickedParcelIdRef.current != null && clickedParcelId == null && !isParcelDetailsOpen) {
      cancelParcelPopupWork()
    }
    prevClickedParcelIdRef.current = clickedParcelId
  }, [clickedParcelId, isParcelDetailsOpen, cancelParcelPopupWork])
  /** Viewport to restore after closing Hail Data / storm map (saved before storm zoom). */
  const hailViewportRestoreRef = useRef(null)
  const initialSetDoneRef = useRef(false)
  const prevFollowingRef = useRef(false)
  const lastAutoZoomRef = useRef(null)
  const [mapReady, setMapReady] = useState(false)
  const [bootSplashVisible, setBootSplashVisible] = useState(true)
  const refreshBasemapTiles = useCallback((tileUrl) => {
    const map = mapInstanceRef.current
    if (!map || !tileUrl) return
    const apply = () => {
      try {
        if (!map.isStyleLoaded()) return
        const src = map.getSource('basemap')
        if (src && typeof src.setTiles === 'function') {
          src.setTiles([tileUrl])
        }
      } catch { /* basemap source not ready */ }
    }
    if (map.isStyleLoaded()) apply()
    else map.once('style.load', apply)
  }, [])
  const { mapStyle: basemapStyle, basemapStatus, retryBasemap } = useBasemapStyle(settings.mapStyle, {
    onTileUrlRefresh: refreshBasemapTiles,
  })
  const showAppLoading = authLoading || basemapStatus === 'loading'
  /** FAB lives in #modal-root — keep it unmounted through boot splash + permission gate. */
  const showQuickCreateFab = permissionsReady && !showAppLoading && !bootSplashVisible
  useEffect(() => {
    if (!showQuickCreateFab && quickCreateOpen) setQuickCreateOpen(false)
  }, [showQuickCreateFab, quickCreateOpen])
  const appLoadingMessage = useMemo(
    () => getAppLoadingMessage({
      authLoading,
      basemapLoading: basemapStatus === 'loading',
    }),
    [authLoading, basemapStatus]
  )
  const mapInitialViewState = useMemo(() => ({
    longitude: -96.7970,
    latitude: 32.7767,
    zoom: settings.defaultZoom || 15,
    bearing: 0,
    pitch: 0,
  }), [])
  const viewStateRef = useRef(mapInitialViewState)

  useEffect(() => {
    if (basemapStatus !== 'ready') {
      setMapReady(false)
      mapInstanceRef.current = null
      mapRef.current = null
    }
  }, [basemapStatus])

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
    if (returnToParcelDetailsAfterHailEventRef.current && isParcelDetailsOpenRef.current) {
      returnToParcelDetailsAfterHailEventRef.current = false
    }
  }, [nav, restoreMapViewportAfterHail])

  const hailParcelCoords = useMemo(() => {
    const parcel = hailStormParcel ?? hailDataParcel
    if (!parcel) return null
    return resolveParcelCenter(parcel)
  }, [hailStormParcel, hailDataParcel])

  const handleSelectHailEvent = useCallback((evt) => {
    captureMapViewportForHailRestore()
    const parcel = clickedParcelData ?? hailDataParcel
    if (parcel) setHailStormParcel(parcel)
    returnToParcelDetailsAfterHailEventRef.current = isParcelDetailsOpenRef.current
    setSelectedHailEvent(evt)
    setHailOpening(false)
    setShowListSelector(false)
    nav.resetToMapFullState()
  }, [nav, clickedParcelData, hailDataParcel, captureMapViewportForHailRestore])

  const handleDismissHailEvent = useCallback(() => {
    setSelectedHailEvent(null)
    const parcel = hailStormParcel ?? clickedParcelData ?? hailDataParcel
    if (!parcel) return
    if (returnToParcelDetailsAfterHailEventRef.current) {
      nav.openParcelDetails({
        type: 'parcelDetails',
        parcelId: parcel.id,
        source: 'map',
        parcelData: parcel,
      })
    }
    nav.openHailOverlay({ type: 'hail', parcelId: parcel.id, parcelData: parcel })
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
      const lngPad = Math.max(0.035, (maxLng - minLng) * 0.25)
      const latPad = Math.max(0.035, (maxLat - minLat) * 0.25)
      map.fitBounds(
        [
          [minLng - lngPad, minLat - latPad],
          [maxLng + lngPad, maxLat + latPad],
        ],
        { padding: 64, maxZoom: 11, duration: 700 }
      )
    } else if (selectedHailEvent.lng != null && selectedHailEvent.lat != null) {
      map.easeTo({
        center: [selectedHailEvent.lng, selectedHailEvent.lat],
        zoom: 10,
        duration: 700,
      })
    }

    setTimeout(() => { programmaticMoveRef.current = false }, 800)
  }, [selectedHailEvent, hailParcelCoords])

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

  // Initial center on first GPS fix (imperative — GPS ticks don't re-render App)
  useEffect(() => {
    const applyInitialCenter = () => {
      const loc = getUserLocation()
      if (loc && !initialSetDoneRef.current && mapInstanceRef.current) {
        initialSetDoneRef.current = true
        const map = mapInstanceRef.current
        map.jumpTo({ center: [loc.lng, loc.lat], zoom: 17, pitch: 0 })
        map.fire('moveend')
      }
    }
    applyInitialCenter()
    return subscribeUserLocation(applyInitialCenter)
  }, [])

  // Follow-mode panning (imperative subscription to the location store)
  useEffect(() => {
    const justResumed = !prevFollowingRef.current && isFollowing
    prevFollowingRef.current = isFollowing
    if (!isFollowing) return undefined

    const panTo = (loc, duration) => {
      const map = mapInstanceRef.current
      if (!map || !loc || !initialSetDoneRef.current) return
      const c = map.getCenter()
      const dx = Math.abs(c.lng - loc.lng)
      const dy = Math.abs(c.lat - loc.lat)
      if (dx < 0.00002 && dy < 0.00002) return
      programmaticMoveRef.current = true
      map.easeTo({ center: [loc.lng, loc.lat], duration, easing: (t) => 1 - Math.pow(1 - t, 3) })
      setTimeout(() => { programmaticMoveRef.current = false }, duration + 100)
    }

    let raf = null
    if (justResumed) {
      raf = requestAnimationFrame(() => panTo(getUserLocation(), 500))
    }
    const unsubscribe = subscribeUserLocation((loc) => panTo(loc, 900))
    return () => {
      if (raf) cancelAnimationFrame(raf)
      unsubscribe()
    }
  }, [isFollowing])

  // Recenter map function
  const recenterMapRef = useRef(null)
  const setRecenterMap = useCallback((func) => { recenterMapRef.current = func }, [])
  useEffect(() => {
    recenterMapRef.current = () => {
      const map = mapInstanceRef.current
      const loc = getUserLocation()
      if (map && loc) {
        programmaticMoveRef.current = true
        map.easeTo({ center: [loc.lng, loc.lat], duration: 500 })
        setTimeout(() => { programmaticMoveRef.current = false }, 600)
      }
    }
  }, [])

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
        const taskName = (t.title || 'Untitled task').toString().slice(0, 80)
        const when = new Date(at).toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
        showLocalNotification('Task due soon', {
          body: when ? `${taskName} · ${when}` : taskName,
          tag: `task-${t.id}-${dayKey}`,
        })
      }
    }
    const id = setInterval(tick, 60000)
    tick()
    return () => clearInterval(id)
  }, [permissionsReady])

  // Track user's current location in real-time (only after permissions granted).
  // Fixes go to the external location store, not React state, so 1 Hz GPS
  // updates never re-render the App tree.
  useEffect(() => {
    if (!permissionsReady) return
    let watchId = null
    let cancelled = false
    let lastUpdateTime = 0
    const UPDATE_THROTTLE_MS = 1000
    const defaultLocation = { lat: 32.7767, lng: -96.7970, accuracy: null }

    const applyPosition = (position) => {
      setCurrentUserLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
      })
      lastUpdateTime = Date.now()
    }

    if (!navigator.geolocation) {
      setCurrentUserLocation(defaultLocation)
      return undefined
    }

    getCurrentPositionWithFallback()
      .then((position) => {
        if (!cancelled) applyPosition(position)
      })
      .catch((error) => {
        if (cancelled) return
        console.warn('Initial location unavailable; using default map center.', error?.code ?? error)
        setCurrentUserLocation(defaultLocation)
      })

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now()
        if (now - lastUpdateTime < UPDATE_THROTTLE_MS) return

        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }

        const prevLocation = getUserLocation()
        if (!prevLocation) {
          lastUpdateTime = now
          setCurrentUserLocation(location)
          return
        }

        const latDiff = Math.abs(location.lat - prevLocation.lat)
        const lngDiff = Math.abs(location.lng - prevLocation.lng)
        const distanceMeters = Math.sqrt(
          Math.pow(latDiff * 111000, 2) +
          Math.pow(lngDiff * 111000 * Math.cos(location.lat * Math.PI / 180), 2)
        )

        if (distanceMeters >= 2) {
          lastUpdateTime = now
          setCurrentUserLocation(location)
        }
      },
      (error) => {
        // code 2 (POSITION_UNAVAILABLE) is common on desktop Mac when Core Location has no fix.
        if (error?.code === 2) return
        console.warn('Error watching location:', error)
      },
      getWatchPositionOptions()
    )

    return () => {
      cancelled = true
      if (watchId !== null) {
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

  const leadStatuses = useMemo(
    () => resolveLeadStatuses({ settings, teams, teamMembership }),
    [settings, teams, teamMembership]
  )

  const canAccessFeature = useCallback(
    (featureId) => canAccessTeamFeature(teamMembership, teamMemberFeatures, featureId),
    [teamMembership, teamMemberFeatures]
  )

  const setTourSettingsOpen = useCallback((open) => {
    if (open) nav.openSettings()
    else nav.pop()
  }, [nav])

  const [tourExpandSettingsSection, setTourExpandSettingsSection] = useState(null)

  const handleTourStepChange = useCallback((_stepId, expandSection) => {
    setTourExpandSettingsSection(expandSection ?? null)
  }, [])

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

  const clearListAddMode = useCallback(() => {
    setShowListSelector(false)
    setParcelPendingForList(null)
    suppressParcelDetailsDataClearRef.current = false
  }, [])

  const beginAddParcelToList = useCallback((parcel) => {
    if (!parcel?.id) {
      showToast('No parcel selected', 'error')
      return
    }
    if (!requireAuth()) return
    suppressParcelDetailsDataClearRef.current = true
    setParcelPendingForList(parcel)
    setShowListSelector(true)
    guardFeature('lists', () => nav.openLists())
  }, [requireAuth, guardFeature, nav, showToast])

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

  useEffect(() => {
    leadsRef.current = leads
  }, [leads])

  useEffect(() => {
    photoModeLeadRef.current = photoModeLead
  }, [photoModeLead])

  useEffect(() => {
    leadsDetailLeadIdRef.current = leadsDetailLeadId
  }, [leadsDetailLeadId])

  useEffect(() => {
    pipelinesRef.current = pipelines
  }, [pipelines])

  useEffect(() => {
    if (pipelinesLoading && pipelines.length > 0) {
      setPipelinesLoading(false)
    }
  }, [pipelinesLoading, pipelines.length])

  const refreshTags = useCallback(async () => {
    if (!currentUser) {
      setTagRegistry({ leads: [], deals: [], paths: [], lists: [] })
      return
    }
    try {
      const registry = await fetchTagRegistry(getToken)
      setTagRegistry(registry)
    } catch (error) {
      console.error('Error loading tags:', error)
    }
  }, [currentUser, getToken])

  const hydrateSharedLeadPhotosRef = useRef(null)

  const refreshLeads = useCallback(async ({ existingLeads } = {}) => {
    if (!currentUser) return
    const requestId = ++refreshLeadsGenerationRef.current
    const baseline = Array.isArray(existingLeads) && existingLeads.length > 0
      ? existingLeads
      : (leadsRef.current.length > 0 ? leadsRef.current : loadLocalLeads())
    const showSpinner = baseline.length === 0
    if (showSpinner) setLeadsLoading(true)
    let mergedLeads = null
    try {
      const next = await fetchLeads(getToken)
      if (requestId !== refreshLeadsGenerationRef.current) return
      if (next?.notModified) {
        await hydrateSharedLeadPhotosRef.current?.()
        return
      }
      const excludeIds = deletedLeadIdsRef.current
      setLeads((prev) => {
        mergedLeads = mergeListViewLeads(
          prev.length > 0 ? prev : baseline,
          next,
          { excludeIds },
        )
        saveLocalLeads(mergedLeads)
        return mergedLeads
      })
      await refreshTags()
      if (requestId !== refreshLeadsGenerationRef.current) return
      await hydrateSharedLeadPhotosRef.current?.({ leadsSnapshot: mergedLeads })
    } catch (error) {
      console.error('Error loading leads:', error)
    } finally {
      if (showSpinner) setLeadsLoading(false)
    }
  }, [currentUser, getToken, refreshTags])

  const hydrateSharedLeadPhotos = useCallback(async ({ leadsSnapshot, priorityLeadIds, limit } = {}) => {
    if (!currentUser) return

    const snapshot = leadsSnapshot || leadsRef.current
    const priority = (priorityLeadIds || [
      leadsDetailLeadIdRef.current,
      photoModeLeadRef.current?.id,
    ]).filter(Boolean)
    const pendingUploadsByLeadId = countPendingUploadsByLeadId(photoUploadManager.getSnapshot())
    const leadIds = collectLeadsNeedingPhotoHydrate(snapshot, {
      priorityLeadIds: priority,
      pendingUploadsByLeadId,
      limit: typeof limit === 'number' ? limit : 5,
    }).filter((leadId) => !deletedLeadIdsRef.current.has(leadId))
    if (!leadIds.length) return

    await Promise.all(leadIds.map(async (leadId) => {
      if (hydratingLeadIdsRef.current.has(leadId)) return
      if (deletedLeadIdsRef.current.has(leadId)) return
      hydratingLeadIdsRef.current.add(leadId)
      try {
        const full = await fetchLeadById(getToken, leadId)
        if (!full?.id || deletedLeadIdsRef.current.has(leadId)) return
        setLeads((prev) => upsertLeadInLocalStore(prev, full, mergeLeadDetail))
        setPhotoModeLead((prev) => (
          prev?.id === full.id ? mergeLeadDetail(prev, full) : prev
        ))
      } catch (error) {
        console.warn('Lead photo hydrate failed:', leadId, error?.message)
      } finally {
        hydratingLeadIdsRef.current.delete(leadId)
      }
    }))
  }, [currentUser, getToken])

  hydrateSharedLeadPhotosRef.current = hydrateSharedLeadPhotos

  const upsertRegistryTag = useCallback((type, tag) => {
    if (!tag?.id) {
      refreshTags()
      return
    }
    setTagRegistry((prev) => upsertTagInRegistry(prev, type, tag))
  }, [refreshTags])

  const patchList = useCallback((listId, patch) => {
    setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, ...patch } : l)))
  }, [])

  const patchPath = useCallback((pathId, patch) => {
    setPaths((prev) => prev.map((p) => (p.id === pathId ? { ...p, ...patch } : p)))
  }, [])

  const localPipelineMigrationRef = useRef(null)
  const teamsRef = useRef(teams)
  useEffect(() => {
    teamsRef.current = teams
  }, [teams])

  const pickActivePipelineId = useCallback((next, prev) => {
    const teamsNow = teamsRef.current
    const editable = pipelinesUserCanWorkIn(currentUser, next, teamsNow)
    const prevPipe = prev ? next.find((p) => p.id === prev) : null
    if (prevPipe && canAddDealsToPipeline(currentUser, prevPipe, teamsNow)) return prev
    const first = editable.find((p) => p.ownerId === currentUser.uid) || editable[0]
    return first?.id ?? null
  }, [currentUser])

  const refreshPipelines = useCallback(async () => {
    if (!currentUser) return
    const showSpinner = pipelinesRef.current.length === 0
    if (showSpinner) setPipelinesLoading(true)
    const migrationKey = localPipelineMigrationKey(currentUser.uid)
    try {
      const next = await fetchPipelines(getToken)
      if (next?.notModified) return
      if (next.length > 0) {
        setPipelines(next)
        setActivePipelineId((prev) => pickActivePipelineId(next, prev))
        return
      }

      if (localPipelineMigrationRef.current) {
        try {
          const created = await localPipelineMigrationRef.current
          setPipelines([created])
          setActivePipelineId(created.id)
          setDealPipelineDeals(created.deals || [])
        } catch (e) {
          console.warn('Pipeline migration failed:', e.message)
        }
        return
      }

      let migrationDone = false
      try { migrationDone = localStorage.getItem(migrationKey) === '1' } catch { /* ignore */ }
      if (migrationDone) {
        setPipelines([])
        setActivePipelineId(null)
        return
      }

      const cols = loadColumns()
      const deals = loadDeals()
      const title = loadTitle()
      const hasLocalData = deals.length > 0 || cols.some((c) => (c?.name || '').trim())

      if (!hasLocalData) {
        try { localStorage.setItem(migrationKey, '1') } catch { /* ignore */ }
        setPipelines([])
        setActivePipelineId(null)
        return
      }

      try { localStorage.setItem(migrationKey, '1') } catch { /* ignore */ }
      const migrationPromise = createPipeline(getToken, { title, columns: cols, deals })
      localPipelineMigrationRef.current = migrationPromise
      try {
        const created = await migrationPromise
        setPipelines([created])
        setActivePipelineId(created.id)
        setDealPipelineDeals(created.deals || [])
      } catch (e) {
        try { localStorage.removeItem(migrationKey) } catch { /* ignore */ }
        console.warn('Pipeline migration failed:', e.message)
        setPipelines([])
        setActivePipelineId(null)
      } finally {
        localPipelineMigrationRef.current = null
      }
    } catch (error) {
      console.error('Error loading pipelines:', error)
      setPipelines([])
      setActivePipelineId(null)
    } finally {
      if (showSpinner) setPipelinesLoading(false)
      refreshTags()
    }
  }, [currentUser, getToken, pickActivePipelineId, refreshTags])

  const teamsReadyForPipelinesRef = useRef(false)
  useEffect(() => {
    if (!currentUser || teams.length === 0) {
      teamsReadyForPipelinesRef.current = false
      return
    }
    if (teamsReadyForPipelinesRef.current || pipelines.length === 0) return
    teamsReadyForPipelinesRef.current = true
    setActivePipelineId((prev) => pickActivePipelineId(pipelines, prev))
  }, [currentUser, teams.length, pipelines.length, pipelines, pickActivePipelineId])

  useEffect(() => {
    if (!leadsDetailLeadId) return
    const stillExists = leads.some(
      (l) => l.id === leadsDetailLeadId || l.parcelId === leadsDetailLeadId,
    )
    if (!stillExists) nav.popLeadsDetail()
  }, [leads, leadsDetailLeadId, nav])

  useEffect(() => {
    if (!leadsDetailLeadId || !currentUser) return
    const lead = leads.find(
      (l) => l.id === leadsDetailLeadId || l.parcelId === leadsDetailLeadId,
    )
    if (!lead?.id || !leadNeedsPhotoHydrate(lead)) return
    hydrateSharedLeadPhotos({ priorityLeadIds: [lead.id], limit: 1 })
  }, [leadsDetailLeadId, currentUser, leads, hydrateSharedLeadPhotos])

  useEffect(() => {
    if (currentUser) {
      const cached = loadLocalLeads()
      if (cached.length > 0) {
        setLeads(cached)
      } else {
        setLeadsLoading(true)
      }
      prefetchPanel('leads')
      prefetchPanel('deals')
      prefetchPanel('dealPipeline')
      runLeadsDealsFreshStartMigration()
      refreshPipelines()
      refreshLeads({ existingLeads: cached })
      refreshTags()
    } else {
      deletedLeadIdsRef.current.clear()
      clearAccountSessionCaches()
      setPipelines([])
      setActivePipelineId(null)
      setLeads([])
      setLeadsLoading(false)
      setPipelinesLoading(false)
      setTagRegistry({ leads: [], deals: [], paths: [], lists: [] })
    }
  }, [currentUser, refreshPipelines, refreshLeads, refreshTags])

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
    const tileHit = parcelLayerRef.current?.queryParcelFeatureAtLocation?.(lat, lng)
    return resolveLeadParcelAtLocation(lat, lng, { lrid: tileHit?.lrid || '' })
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
      if (isParcelALeadCheck(parcelData)) {
        showToast('Parcel is already a lead', 'warning')
        return
      }
      const skip = getSkipTracedParcel(parcelData.id)
      nav.pushModal({ type: 'createLead', prefill: buildLeadPrefillFromParcel(parcelData, skip) })
    })
  }, [currentUser, isParcelALeadCheck, nav, guardFeature])

  const handleViewLeadFromParcel = useCallback((parcelData) => {
    if (!currentUser?.uid) {
      nav.openLogin()
      showToast('Please sign in to view leads', 'info')
      return
    }
    guardFeature('leads', () => {
      const lead = findLeadByParcelId(leads, parcelData)
      if (!lead?.id) {
        showToast('Lead not found', 'error')
        return
      }
      nav.clearMapOverlays()
      nav.openLeadDetailFromTasks(lead.id)
    })
  }, [currentUser, leads, nav, guardFeature])

  const handleLeadCreated = useCallback(async (lead) => {
    const pickerCb = leadPickerCreateCallbackRef.current
    leadPickerCreateCallbackRef.current = null
    setLeads((prev) => [...prev.filter((l) => l.id !== lead.id), lead])
    pickerCb?.(lead)
    await refreshLeads()
    setLeads((prev) => (prev.some((l) => l.id === lead.id) ? prev : [...prev, lead]))
  }, [refreshLeads])

  const openCreateLeadForPicker = useCallback((onCreated) => {
    leadPickerCreateCallbackRef.current = typeof onCreated === 'function' ? onCreated : null
    guardFeature('leads', () => nav.pushModal({ type: 'createLead', prefill: null }))
  }, [guardFeature, nav])

  const handleLeadUpdated = useCallback((lead) => {
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? lead : l)))
    setEditLead(null)
  }, [])

  const handleEditLead = useCallback((lead) => {
    if (lead?.id) setEditLead(lead)
  }, [])

  const handleLeadDeleted = useCallback((deletedLeadId) => {
    if (!deletedLeadId) return
    deletedLeadIdsRef.current.add(deletedLeadId)
    refreshLeadsGenerationRef.current += 1
    setLeads((prev) => {
      const next = prev.filter((l) => l.id !== deletedLeadId)
      saveLocalLeads(next)
      return next
    })
    setEditLead((prev) => (prev?.id === deletedLeadId ? null : prev))
    setPhotoModeLead((prev) => (prev?.id === deletedLeadId ? null : prev))
    if (leadsDetailLeadIdRef.current === deletedLeadId) {
      nav.popLeadsDetail()
    }
    if (dealsLeadOverlayId === deletedLeadId) {
      nav.popIfTop('deals.lead')
    }
    if (pipesLeadOverlayId === deletedLeadId) {
      nav.popIfTop('pipes.lead')
    }
    void refreshLeads()
  }, [nav, dealsLeadOverlayId, pipesLeadOverlayId, refreshLeads])

  const markLeadConvertedAfterDeal = useCallback(async (lead, deal) => {
    if (!lead?.id || !deal) return
    try {
      let saved = await setLeadStatus(getToken, lead.id, 'converted', {
        fromStatus: lead.status || 'new',
        leadStatuses,
      })
      saved = await logLeadDealCreated(getToken, lead.id, deal.title || deal.leadAddress, deal.id)
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? saved : l)))
    } catch (e) {
      console.warn('Could not update lead CRM status after deal', e)
    }
  }, [getToken, leadStatuses])

  const handleLogLeadOutreach = useCallback(async (leadId, type, contact) => {
    if (!leadId) return
    const lead = leads.find((l) => l.id === leadId)
    if (!lead) return
    try {
      let saved = await logLeadOutreach(getToken, leadId, type, contact)
      const dealCount = findDealsForLead(pipelines, leadId).length
      saved = await bumpLeadStatusOnContact(
        getToken,
        saved,
        getLeadStatus(saved, dealCount, leadStatuses),
        leadStatuses,
      )
      setLeads((prev) => prev.map((l) => (l.id === leadId ? saved : l)))
    } catch (e) {
      console.warn('Lead outreach log failed', e)
    }
  }, [leads, pipelines, getToken, leadStatuses])

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
        await markLeadConvertedAfterDeal(lead, deal)
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
    await markLeadConvertedAfterDeal(lead, deal)
  }, [activePipelineId, currentUser, getToken, pipelines, refreshPipelines, teams, nav, markLeadConvertedAfterDeal])

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

  const handleQuickCreateOpenChange = useCallback((open) => {
    setQuickCreateOpen(open)
    if (open) nav.setShowMenu(false)
  }, [nav])

  useEffect(() => {
    if (selectedHailEvent) setQuickCreateOpen(false)
  }, [selectedHailEvent])

  const handleActionBarMenuChange = useCallback((valueOrFn) => {
    const next = typeof valueOrFn === 'function' ? valueOrFn(showMenu) : valueOrFn
    if (next) setQuickCreateOpen(false)
    nav.setShowMenu(next)
  }, [nav, showMenu])

  const openQuickCreateTask = useCallback(() => {
    if (!requireAuth()) return
    guardFeature('tasks', () => {
      nav.openTasks()
      setQuickCreateTaskKey((k) => k + 1)
    })
  }, [requireAuth, guardFeature, nav])

  const openQuickCreateLead = useCallback(() => {
    if (!requireAuth()) return
    guardFeature('leads', () => nav.pushModal({ type: 'createLead', prefill: null }))
  }, [requireAuth, guardFeature, nav])

  const openQuickCreateDeal = useCallback(() => {
    openCreateDealDialog()
  }, [openCreateDealDialog])

  const openQuickCreateQuote = useCallback(() => {
    if (!requireAuth()) return
    guardFeature('quotes', () => {
      nav.openQuotes()
      setQuickCreateQuoteKey((k) => k + 1)
    })
  }, [requireAuth, guardFeature, nav])

  const openQuickCreateReport = useCallback(() => {
    if (!requireAuth()) return
    guardFeature('reports', () => {
      nav.openReports()
      setQuickCreateReportKey((k) => k + 1)
    })
  }, [requireAuth, guardFeature, nav])

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
    const confirmed = await showConfirm({
      title: 'Delete deal?',
      message: 'Tasks and files on this deal will be lost.\nThis cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    })
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
      const prevDeal = (pipe.deals || []).find((d) => d.id === updatedDeal.id)
      const deals = (pipe.deals || []).map((d) => (d.id === updatedDeal.id ? updatedDeal : d))
      setPipelines((prev) => prev.map((p) => (p.id === pid ? { ...p, deals } : p)))
      if (prevDeal && isPhotosOnlyEntityChange(prevDeal, updatedDeal)) return
      try {
        await updatePipeline(getToken, pid, { deals })
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

        const result = await skipTraceParcels(parcels, getToken)
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

        if (currentUser?.uid && canAccessFeature('leads')) {
          try {
            const enriched = resultsWithParcelIds.map((r) => getSkipTracedParcel(r.parcelId) || r)
            const { leads: nextLeads } = await applySkipTraceResultsToLeads({
              results: enriched,
              leads,
              getToken,
              resolveParcelData: (parcelId) => {
                for (const listItem of lists) {
                  for (const parcel of listItem.parcels || []) {
                    const pid = parcel?.id || parcel?.properties?.PROP_ID || parcel
                    if (String(pid) === String(parcelId)) {
                      return typeof parcel === 'object'
                        ? { ...parcel, id: parcelId, properties: parcel.properties || parcel }
                        : { id: parcelId, properties: { PROP_ID: parcelId } }
                    }
                  }
                }
                return null
              },
            })
            if (nextLeads?.length) setLeads(nextLeads)
            refreshLeads()
          } catch (error) {
            console.warn('Bulk skip trace lead sync failed', error)
          }
        }

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
  }, [lists, getToken, currentUser, canAccessFeature, leads, refreshLeads])


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
    clearListAddMode()
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
    const properties = data.properties || {}
    const isLoading = data.address === 'Loading…'
    const display = isLoading
      ? { title: 'Loading…', subtitle: '', fullAddress: '', hasStreetAddress: false }
      : (data.addressDisplay || resolveParcelDisplayAddress(properties))
    const address = isLoading ? 'Loading…' : (data.address || display.title || 'No address')
    const lat = data.lat ?? data.latlng?.lat ?? properties.LATITUDE ?? properties.latitude
    const lng = data.lng ?? data.latlng?.lng ?? properties.LONGITUDE ?? properties.longitude
    if (lat == null || lng == null || !parcelId) return null
    const currentYear = new Date().getFullYear()
    const yearBuilt = properties.YEAR_BUILT ? parseInt(properties.YEAR_BUILT) : null
    const age = yearBuilt ? currentYear - yearBuilt : null
    const hasSkipTraced = isParcelSkipTraced(parcelId)
    const isSkipTracingInProgress = skipTracingInProgress.has(parcelId)
    const listsWithParcel = (lists || []).filter(l => (l.parcels || []).some(p => (p.id || p) === parcelId))
    const parcelData = { id: parcelId, properties, address: display.fullAddress || address, lat, lng }
    if (data.leadId) parcelData.leadId = data.leadId
    return {
      type: 'popup',
      parcelId,
      lat,
      lng,
      parcelData,
      popupData: {
        parcelId, lat, lng, address,
        addressSubtitle: display.subtitle || '',
        assessorDataLimited: !isLoading && !display.hasStreetAddress,
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

  /** Show popup or refresh details — stay in details when user is already there. */
  const presentParcelOnMap = useCallback((data) => {
    if (!data?.id) return
    if (isParcelDetailsOpenRef.current) {
      nav.openParcelDetails({
        type: 'parcelDetails',
        parcelId: data.id,
        source: 'map',
        parcelData: data,
      })
    } else {
      openParcelPopup(data)
    }
  }, [nav, openParcelPopup])

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

    const { latlng, properties: tileProperties = {}, parcelId: eventParcelId, geometry } = event
    const tileParcelId = eventParcelId || tileProperties.PROP_ID || `${latlng.lat.toFixed(6)}-${latlng.lng.toFixed(6)}`
    const requestId = tileParcelId
    currentPopupRef.current = requestId
    const parcelCenter = resolveParcelCenter({ latlng, properties: tileProperties, geometry })
      ?? { lat: latlng.lat, lng: latlng.lng }

    const tileDisplay = resolveParcelDisplayAddress(tileProperties)
    const hasTileData = tileDisplay.hasStreetAddress || !!(tileProperties.OWNER_NAME || '').trim()
    const buildTileParcelData = () => ({
      id: tileParcelId,
      properties: tileProperties,
      address: hasTileData ? tileDisplay.title : 'Loading…',
      addressDisplay: hasTileData ? tileDisplay : undefined,
      lat: parcelCenter.lat,
      lng: parcelCenter.lng,
    })

    const applyLandRecordsParcel = (result) => {
      if (!result) return
      const { properties: apiProperties, parcelId: apiParcelId } = result
      const resolvedId = apiParcelId || tileParcelId
      const display = resolveParcelDisplayAddress(apiProperties)
      return {
        id: resolvedId,
        properties: apiProperties,
        address: display.title,
        addressDisplay: display,
        lat: parcelCenter.lat,
        lng: parcelCenter.lng,
      }
    }

    const loadLandRecordsParcel = (onParcelReady) => {
      parcelFetchAbortRef.current?.abort()
      const controller = new AbortController()
      parcelFetchAbortRef.current = controller
      fetchLandRecordsParcel({
        lat: latlng.lat,
        lng: latlng.lng,
        lrid: event.lrid || '',
        signal: controller.signal,
      }).then((result) => {
        if (controller.signal.aborted || currentPopupRef.current !== requestId) return
        const parcelData = applyLandRecordsParcel(result)
        if (!parcelData) {
          if (!hasTileData) showToast('Could not load parcel details', 'error')
          return
        }
        if (isMultiSelectActive) {
          setSelectedParcelsData((prevData) => {
            if (!prevData.has(tileParcelId) && !prevData.has(parcelData.id)) return prevData
            const newMap = new Map(prevData)
            const key = prevData.has(tileParcelId) ? tileParcelId : parcelData.id
            newMap.set(key, {
              id: parcelData.id,
              properties: parcelData.properties,
              latlng: parcelCenter,
              address: parcelData.address,
            })
            return newMap
          })
        } else {
          onParcelReady?.(parcelData)
        }
      }).catch((err) => {
        if (err?.name === 'AbortError') return
        if (!hasTileData) showToast('Could not load parcel details', 'error')
      })
    }

    if (isMultiSelectActive) {
      // Multi-select mode: toggle selection
      setSelectedParcels(prev => {
        const newSet = new Set(prev)
        if (newSet.has(tileParcelId)) {
          newSet.delete(tileParcelId)
          setSelectedParcelsData(prevData => {
            const newMap = new Map(prevData)
            newMap.delete(tileParcelId)
            return newMap
          })
        } else {
          newSet.add(tileParcelId)
          setSelectedParcelsData(prevData => {
            const newMap = new Map(prevData)
            const initial = buildTileParcelData()
            newMap.set(tileParcelId, {
              id: tileParcelId,
              properties: initial.properties,
              latlng: parcelCenter,
              address: initial.address,
            })
            return newMap
          })
          loadLandRecordsParcel()
        }
        return newSet
      })
    } else {
      nav.clearMapOverlays()
      const featureStateId = event.lrid || tileProperties.lrid || tileParcelId
      parcelLayerRef.current?.applyClickedHighlight?.(featureStateId, tileParcelId)

      let pendingParcelData = buildTileParcelData()
      let recentered = false

      const presentWhenCentered = (data) => {
        if (currentPopupRef.current !== requestId || !data) return
        pendingParcelData = data
        if (!recentered) return
        presentParcelOnMap(data)
      }

      loadLandRecordsParcel(presentWhenCentered)

      if (parcelRecenterTimerRef.current) clearTimeout(parcelRecenterTimerRef.current)
      centerMapOnParcel({
        lat: parcelCenter.lat,
        lng: parcelCenter.lng,
        duration: 500,
        mode: 'ease',
        onComplete: () => {
          recentered = true
          parcelLayerRef.current?.reapplyClickedHighlight?.()
          presentWhenCentered(pendingParcelData)
        },
      })
    }
    
  }, [isMultiSelectActive, lists, currentUser, authLoading, mapInstanceRef, skipTracingInProgress, showToast, presentParcelOnMap, nav, centerMapOnParcel])

  // Add single parcel to list (called from popup button)
  const handleAddSingleParcelToList = useCallback(async (listId) => {
    const parcelSource = parcelPendingForList || clickedParcelData
    if (!parcelSource) {
      showToast('No parcel selected', 'error')
      return
    }
    const list = lists.find(l => l.id === listId)
    if (!list) {
      showToast('List not found', 'error')
      return
    }
    const parcelToAdd = {
      id: parcelSource.id,
      properties: parcelSource.properties,
      address: parcelSource.address,
      lat: parcelSource.lat,
      lng: parcelSource.lng,
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
      clearListAddMode()
      nav.pop()
    } catch (error) {
      showToast(error.message || 'Failed to add parcel', 'error')
    }
  }, [parcelPendingForList, clickedParcelData, lists, getToken, refreshLists, nav, clearListAddMode])

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
    clearListAddMode()
    nav.resetToMapFullState()
  }, [nav, clearListAddMode])

  const scheduleParcelHighlight = useCallback((lat, lng, preferredId = null) => {
    const attempt = () => {
      const hit = parcelLayerRef.current?.queryParcelFeatureAtLocation?.(lat, lng)
      const paintId = preferredId || hit?.id
      const featureId = hit?.lrid || hit?.id || paintId
      if (paintId) {
        setMapHighlightedParcelId(paintId)
        if (featureId) {
          parcelLayerRef.current?.applyClickedHighlight?.(featureId, paintId)
        }
        return true
      }
      return false
    }

    if (attempt()) return

    const map = mapInstanceRef.current
    if (!map) return

    let tries = 0
    const maxTries = 10
    const retry = () => {
      tries += 1
      if (attempt() || tries >= maxTries) return
      setTimeout(retry, 350)
    }
    map.once('idle', retry)
    setTimeout(retry, 800)
  }, [])

  const handleGoToParcelOnMap = useCallback((raw) => {
    if (!raw) return
    const parcelCenter = resolveParcelCenter(raw)
    if (!parcelCenter) {
      showToast('No map location for this lead', 'error')
      return
    }
    const { lat, lng } = parcelCenter

    const parcelId = raw.parcelId || raw.id || resolveParcelId(raw) || ''

    cancelParcelPopupWork()
    closeAllPanelsForMap()
    nav.clearMapOverlays()
    setMapHighlightedParcelId(null)

    if (parcelId) {
      setMapHighlightedParcelId(parcelId)
    }

    const flyZoom = 18
    centerMapOnParcel({
      lat,
      lng,
      zoom: flyZoom,
      duration: 700,
      mode: 'fly',
      onComplete: () => scheduleParcelHighlight(lat, lng, parcelId || null),
    })
    if (!mapInstanceRef.current) {
      scheduleParcelHighlight(lat, lng, parcelId || null)
    }

    parcelFetchAbortRef.current?.abort()
    const controller = new AbortController()
    parcelFetchAbortRef.current = controller

    fetchLandRecordsParcel({
      lat,
      lng,
      lrid: parcelId,
      signal: controller.signal,
    })
      .then((result) => {
        if (controller.signal.aborted) return
        const parcelData = parcelDataFromLandRecords(result, lat, lng)
        if (parcelData?.id) {
          setMapHighlightedParcelId(parcelData.id)
        }
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return
      })
  }, [cancelParcelPopupWork, closeAllPanelsForMap, nav, scheduleParcelHighlight, showToast, centerMapOnParcel])

  const handleOpenParcelDetails = useCallback((parcelData = null) => {
    if (authLoading) return
    if (!currentUser || !currentUser.uid) {
      nav.openLogin()
      showToast('Please sign in to view parcel details', 'info')
      return
    }
    const source = parcelData ? 'list' : 'map'
    const target = parcelData || clickedParcelData
    const resolvedId = resolveParcelId(target)
    if (!resolvedId) return
    const normalizedParcel = {
      ...target,
      id: resolvedId,
      properties: {
        ...(target.properties || {}),
        PROP_ID: target.properties?.PROP_ID || resolvedId,
      },
    }
    suppressPopupCloseRef.current = true
    nav.openParcelDetails({
      type: 'parcelDetails',
      parcelId: resolvedId,
      source,
      parcelData: normalizedParcel,
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

  const handlePhoneClick = useCallback((phone, parcelData, leadId = null) => {
    nav.showPhoneOverlay({ type: 'phone', phone, parcelData: parcelData || null, leadId: leadId || null, initialStep: 1 })
  }, [nav])

  const handleTextClick = useCallback((phone, parcelData, leadId = null) => {
    nav.showPhoneOverlay({ type: 'phone', phone, parcelData: parcelData || null, leadId: leadId || null, initialStep: 2 })
  }, [nav])

  const suppressPopupCloseRef = useRef(false)
  const wasParcelDetailsOpenRef = useRef(false)
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
      cancelParcelPopupWork()
      setMapHighlightedParcelId(null)
      parcelLayerRef.current?.clearClickedHighlight?.()
      nav.clearMapOverlays()
    } else {
      nav.patchTopOverlay({ popupData: null })
    }
  }, [nav, cancelParcelPopupWork])

  const handleParcelDetailsClose = useCallback((options = {}) => {
    setHailOpening(false)
    if (selectedHailEvent) {
      nav.popMapOverlay()
      return
    }
    returnToParcelDetailsAfterHailEventRef.current = false
    if (!isParcelDetailsOpenRef.current) return
    if (suppressParcelDetailsDataClearRef.current) {
      clearListAddMode()
      suppressParcelDetailsDataClearRef.current = false
    }
    if (isHailDataOpen) nav.popMapOverlay()
    nav.popMapOverlay()
    const openedFromMap = parcelDetailsSource === 'map'
    if (options.reopenPopup && openedFromMap && clickedParcelData) {
      openParcelPopup(clickedParcelData)
    } else {
      nav.clearMapOverlays()
    }
  }, [clickedParcelData, openParcelPopup, nav, parcelDetailsSource, isHailDataOpen, selectedHailEvent, clearListAddMode])

  const handleEmailClick = useCallback((email, parcelData, leadId = null) => {
    if (authLoading) return
    if (!currentUser || !currentUser.uid) {
      nav.openLogin()
      showToast('Please sign in to send emails', 'info')
      return
    }
    guardFeature('outreach', () => {
      prefetchPanel('emailComposer')
      setEmailComposerParcelData(parcelData)
      setEmailComposerRecipient({ email, name: parcelData?.properties?.OWNER_NAME || '' })
      setEmailComposerLeadId(leadId || null)
      nav.showEmailOverlay({ type: 'email', email, parcelData: parcelData || null, leadId: leadId || null })
    })
  }, [currentUser, authLoading, nav, guardFeature])

  const handleOpenEmailComposer = useCallback((template) => {
    setSelectedEmailTemplate(template ?? null)
    nav.popMapOverlay()
    nav.push({ type: 'emailComposer' })
  }, [nav])

  const handleOpenOutreach = useCallback(() => {
    if (authLoading) return
    if (!currentUser || !currentUser.uid) {
      nav.openLogin()
      return
    }
    guardFeature('outreach', () => {
      prefetchPanel('outreach')
      setEmailComposerParcelData(null)
      setEmailComposerRecipient({ email: '', name: '' })
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

  const openPhotoModeForLead = useCallback((lead, { parcelId = null, addressLabel = '', autoCamera = false } = {}) => {
    if (!lead?.id) return
    setPhotoModeLead(lead)
    setPhotoModeParcelId(parcelId || lead.parcelId || null)
    setPhotoModeAddress(addressLabel || '')
    setPhotoModeAutoCamera(autoCamera)
  }, [])

  const closePhotoMode = useCallback(() => {
    setPhotoModeLead(null)
    setPhotoModeParcelId(null)
    setPhotoModeAddress('')
    setPhotoModeAutoCamera(false)
  }, [])

  const handlePhotoEntityUpdated = useCallback((entityRef, entity) => {
    if (!entity?.id) return
    if (entityRef.entityType === 'deal') {
      setPipelines((prev) => prev.map((p) => {
        if (p.id !== entityRef.pipelineId) return p
        return {
          ...p,
          deals: (p.deals || []).map((d) => {
            if (d.id !== entity.id) return d
            return mergeLeadDetail(d, entity)
          }),
        }
      }))
      return
    }
    setLeads((prev) => upsertLeadInLocalStore(prev, entity, mergeLeadDetailFromPhotoApi))
    setPhotoModeLead((prev) => (
      prev?.id === entity.id ? mergeLeadDetailFromPhotoApi(prev, entity) : prev
    ))
  }, [])

  const openPhotoModeForDraftParcel = useCallback((parcelData, { autoCamera = false } = {}) => {
    if (!parcelData) return
    const pid = resolveParcelId(parcelData) || parcelData.id || null
    // Quick Photo Mode can land on a point with no assessor parcel record — still
    // allow starting a lead as long as we have a usable address (manual entry or
    // reverse-geocoded fallback set on parcelData.address).
    const skip = pid ? getSkipTracedParcel(pid) : null
    const prefill = buildLeadPrefillFromParcel(parcelData, skip)
    if (!pid && !prefill.address) return
    setPhotoModeLead({ ...prefill, photos: [] })
    setPhotoModeParcelId(pid)
    setPhotoModeAddress(parcelData.address || popupData?.address || prefill.address || '')
    setPhotoModeAutoCamera(autoCamera)
  }, [popupData])

  const beginPhotoCapture = useCallback((opts = {}) => {
    if (!requireAuth()) return
    guardFeature('photos', () => {
      const { parcelData, lead, autoCamera = false, forceNewLead = false } = opts
      const leadLookupOptions = forceNewLead ? { matchCoords: false } : undefined
      if (lead?.id && !forceNewLead) {
        openPhotoModeForLead(lead, {
          parcelId: parcelData ? (resolveParcelId(parcelData) || parcelData.id) : lead.parcelId,
          addressLabel: parcelData?.address || popupData?.address || '',
          autoCamera,
        })
        return
      }
      if (parcelData) {
        const existing = forceNewLead
          ? null
          : findLeadByParcelId(leads, parcelData, leadLookupOptions)
        if (existing) {
          openPhotoModeForLead(existing, {
            parcelId: resolveParcelId(parcelData) || parcelData.id,
            addressLabel: parcelData.address || popupData?.address || '',
            autoCamera,
          })
          return
        }
        guardFeature('leads', () => openPhotoModeForDraftParcel(parcelData, { autoCamera }))
        return
      }
      const parcelId = opts.parcelId || null
      if (parcelId) {
        const existing = forceNewLead
          ? null
          : findLeadByParcelId(leads, parcelId, leadLookupOptions)
        if (existing) {
          openPhotoModeForLead(existing, {
            parcelId,
            addressLabel: popupData?.address || '',
            autoCamera,
          })
          return
        }
      }
      setPhotoPickerParcelId(parcelId)
      setPhotoPickerAddress(popupData?.address || '')
      setPhotoPickerOpen(true)
    })
  }, [requireAuth, guardFeature, leads, openPhotoModeForLead, openPhotoModeForDraftParcel, popupData])

  const handleParcelPhotos = useCallback(() => {
    if (!clickedParcelData) return
    beginPhotoCapture({ parcelData: clickedParcelData })
  }, [clickedParcelData, beginPhotoCapture])

  const beginQuickPhotoCapture = useCallback(() => {
    if (!requireAuth()) return
    guardFeature('photos', () => setQuickPhotoModeOpen(true))
  }, [requireAuth, guardFeature])

  const handleQuickPhotoModeConfirm = useCallback(({ parcelData, lead, forceNewLead = false } = {}) => {
    setQuickPhotoModeOpen(false)
    if (lead?.id && !forceNewLead) {
      beginPhotoCapture({ lead, autoCamera: true })
      return
    }
    if (parcelData) {
      beginPhotoCapture({ parcelData, autoCamera: true, forceNewLead: forceNewLead || !lead?.id })
    }
  }, [beginPhotoCapture])

  const openReportsPanel = useCallback(() => {
    if (!requireAuth()) return
    guardFeature('reports', () => nav.openReports())
  }, [requireAuth, guardFeature, nav])

  const handleCloseReportsEditor = useCallback(() => {
    nav.pop()
    if (reportsEditorReturnToLead) {
      nav.pop()
    }
  }, [nav, reportsEditorReturnToLead])

  const handleCloseReportsDetail = useCallback(() => {
    nav.pop()
    if (reportsDetailReturnToLead) {
      nav.pop()
    }
  }, [nav, reportsDetailReturnToLead])

  const handleCreatePhotoReport = useCallback((leadId) => {
    if (!leadId) return
    guardFeature('reports', () => {
      nav.pushReportsEditor({ mode: 'report', leadId, awaitingTemplate: true })
    })
  }, [guardFeature, nav])

  const handleOpenPhotoReport = useCallback((reportId) => {
    if (!reportId) return
    guardFeature('reports', () => {
      nav.pushReportsDetail(reportId)
    })
  }, [guardFeature, nav])

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
    if (result?.pathId) handleCenterOnPath(result.pathId)
  }, [nav, feedCtx, canAccessFeature, handleCenterOnPath])

  const handlePanelBack = useCallback(() => {
    const stack = nav.state.navStack
    if (fromActivity) {
      const tasksTrailing = stack.length > 1 && stack[stack.length - 1]?.type === 'tasks'
      const coreLength = tasksTrailing ? stack.length - 1 : stack.length
      if (coreLength === 2 && stack[0]?.type === 'activity') {
        nav.returnToActivity()
        return
      }
      // Ignore spurious panel dismiss after activity-origin detail already returned to feed
      if (coreLength === 1 && stack[0]?.type === 'activity') return
    }
    nav.pop()
  }, [fromActivity, nav])

  const handleTasksPanelClose = useCallback(() => {
    nav.closeTasksPanel()
  }, [nav])

  const handleListPanelBack = useCallback(() => {
    const parcel = parcelPendingForList
    const detailsStillOpen = isParcelDetailsOpen
    clearListAddMode()
    handlePanelBack()
    if (parcel && !detailsStillOpen) {
      nav.openParcelDetails({
        type: 'parcelDetails',
        parcelId: parcel.id,
        source: parcelDetailsSource || 'map',
        parcelData: parcel,
      })
    }
  }, [parcelPendingForList, isParcelDetailsOpen, parcelDetailsSource, clearListAddMode, handlePanelBack, nav])

  const sharedAssetSyncEnabled = useMemo(() => {
    if (!currentUser?.uid) return false
    if (leadsDetailLeadId || photoModeLead?.id) return true
    return shouldEnableSharedAssetSync({
      teams,
      leads,
      pipelines,
      currentUserId: currentUser.uid,
    })
  }, [currentUser?.uid, teams, leads, pipelines, leadsDetailLeadId, photoModeLead?.id])

  useTeamDataSync({
    enabled: sharedAssetSyncEnabled,
    refreshPipelines,
    refreshLeads,
    hydrateSharedAssets: hydrateSharedLeadPhotos,
  })

  const notificationInbox = useNotificationInbox({
    isOpen: isActivityPanelOpen,
    isFeedActive: isActivityPanelFocused,
    topLayer: isActivityPanelTopLayer,
    panelDockSlot: panelDockSlot('activity', isActivityPanelFocused),
    onOpenChange: (open) => {
      if (open) guardFeature('activity', () => nav.setActivityOpen(true))
      else nav.closeActivity()
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
    if (leadNeedsPhotoHydrate(lead)) {
      hydrateSharedLeadPhotos({ priorityLeadIds: [lead.id], limit: 1 })
    }
  }, [nav, guardFeature, hydrateSharedLeadPhotos])

  const openSettingsPanel = useCallback(() => nav.openSettings(), [nav])
  const openLogin = useCallback(() => nav.openLogin(), [nav])

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

    try {
      const csvContent = listToCsv(list)
      const token = getToken ? await getToken() : null
      const res = await fetch('/api/export-list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          listName: list.name,
          csvContent,
        })
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.message || data.error || `Export failed (${res.status})`)
      }

      showToast(data.message || 'Export sent to your account email', 'success')
    } catch (err) {
      console.error('Export list error:', err)
      showToast(err.message || 'Failed to export list', 'error')
    }
  }, [lists, currentUser, getToken])

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

  const resolveParcelDataForSkipTrace = useCallback((parcelId) => {
    for (const list of lists) {
      for (const parcel of list.parcels || []) {
        const pid = parcel?.id || parcel?.properties?.PROP_ID || parcel
        if (String(pid) === String(parcelId)) {
          return typeof parcel === 'object'
            ? { ...parcel, id: parcelId, properties: parcel.properties || parcel }
            : { id: parcelId, properties: { PROP_ID: parcelId } }
        }
      }
    }
    return null
  }, [lists])

  const syncSkipTraceToLeads = useCallback(async ({ parcelId, parcelData = null, skipTraceData }) => {
    if (!currentUser?.uid || !canAccessFeature('leads')) return null
    try {
      const outcome = await applySkipTraceContactsToLead({
        parcelId,
        parcelData,
        skipTraceData,
        leads,
        getToken,
      })
      if (outcome.lead) {
        setLeads((prev) => [...prev.filter((l) => l.id !== outcome.lead.id), outcome.lead])
        refreshLeads()
      }
      return outcome
    } catch (error) {
      console.warn('Skip trace lead sync failed', error)
      return null
    }
  }, [currentUser?.uid, canAccessFeature, leads, getToken, refreshLeads])

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

    const parcelId = resolveParcelId(parcelData) || parcelData.id
    const previousFullAddress = getSkipTracedParcel(parcelData)?.address || ''

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

      const result = await skipTraceParcels([requestParcel], getToken)
      
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
                            (contactInfo.emails?.length || 0) > 0 ||
                            (contactInfo.phoneDetails?.length || 0) > 0 ||
                            (contactInfo.emailDetails?.length || 0) > 0 ||
                            contactInfo.phone ||
                            contactInfo.email
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

      const leadOutcome = await syncSkipTraceToLeads({
        parcelId,
        parcelData,
        skipTraceData: saved,
      })

      let successMessage = isRefresh ? 'Contact info refreshed!' : 'Skip trace completed successfully!'
      if (leadOutcome?.action === 'created') {
        successMessage = 'Skip trace complete — lead created with contact info'
      } else if (leadOutcome?.action === 'updated') {
        successMessage = 'Skip trace complete — contacts added to lead'
      }
      showToast(successMessage, 'success')
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
  }, [clickedParcelData, clickedParcelId, skipTracingInProgress, lists, isParcelALeadCheck, openParcelPopup, isParcelDetailsOpen, nav, authLoading, currentUser, getToken, syncSkipTraceToLeads])

  return (
    <UserDataSyncProvider getToken={getToken}>
    <PhotoUploadProvider getToken={getToken} onEntityUpdated={handlePhotoEntityUpdated}>
    <AppLoadingScreen
      active={showAppLoading}
      message={appLoadingMessage}
      onVisibleChange={setBootSplashVisible}
    />
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
      {permissionsReady && (!currentUser || settings.tourCompleted) && (
        <NotificationPrompt getToken={getToken} />
      )}
      {currentUser && permissionsReady && !settings.tourCompleted && (
        <WelcomeTour
          onComplete={() => handleSettingsChange({ tourCompleted: true })}
          onStepChange={handleTourStepChange}
          setShowMenu={nav.setShowMenu}
          setSettingsOpen={setTourSettingsOpen}
          canAccessFeature={canAccessFeature}
          showMenu={showMenu}
        />
      )}
      {basemapStatus === 'error' && (
        <BasemapErrorBanner onRetry={retryBasemap} />
      )}
      {/* Map layer - explicitly at z-index 0 so dialogs/panels appear above */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        {basemapStatus === 'ready' && basemapStyle ? (
        <MapGL
          initialViewState={mapInitialViewState}
          maxTileCacheSize={80}
          onMove={(evt) => {
            viewStateRef.current = evt.viewState
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
            const loc = getUserLocation()
            if (loc && !initialSetDoneRef.current) {
              initialSetDoneRef.current = true
              const initZoom = 17
              map.jumpTo({
                center: [loc.lng, loc.lat],
                zoom: initZoom,
                pitch: 0,
              })
              map.fire('moveend')
            }
          }}
          style={{ width: '100%', height: '100%', minHeight: 'var(--vw-height, 100vh)' }}
          mapStyle={basemapStyle}
          minZoom={1}
          maxZoom={20.5}
          maxPitch={0}
          attributionControl={false}
          dragRotate={true}
          touchZoomRotate={true}
          pitchWithRotate={false}
          touchPitch={false}
        >
          <CompassOrientation
            isActive={isCompassActive}
            mapRef={mapInstanceRef}
            getHeading={getHeading}
            subscribeHeading={subscribeHeading}
          />
          {/* <NorthIndicator mapRef={mapInstanceRef} /> */}
          <StateBoundaryLayer />
          <PMTilesParcelLayer 
            mapRef={mapInstanceRef}
            mapReady={mapReady}
            onParcelClick={handleParcelClick}
            clickedParcelId={
              selectedHailEvent
                ? (hailStormParcel?.id ?? hailDataParcel?.id ?? clickedParcelId)
                : (clickedParcelId ?? mapHighlightedParcelId)
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
            savedPathsToShow={paths.filter(p => visiblePathIds.includes(p.id))}
            pathColorMap={pathColorMap}
            smoothingLevel={settings.pathSmoothing}
          />
          <LocationMarker />
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
        ) : null}
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
        onAddToList={() => beginAddParcelToList(clickedParcelData)}
        onConvertToLead={() => { if (clickedParcelData) handleConvertToLead(clickedParcelData) }}
        onOpenPhotos={handleParcelPhotos}
        isLead={popupData ? isParcelALeadCheck(clickedParcelData || popupData) : false}
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
        onTogglePathTracking={() => {
          if (authLoading) return
          if (!currentUser || !currentUser.uid) {
            nav.openLogin()
            return
          }
          handleTogglePathTracking()
        }}
        isPathTrackingActive={isPathTrackingActive}
        currentUser={currentUser}
        onCloseParcelPopup={() => nav.clearMapOverlays()}
        onQuickPhotoMode={beginQuickPhotoCapture}
      />

      <MobileActionBar
        activeId={
          isDealPipelineOpen ? 'pipes'
          : isTasksPanelOpen ? 'tasks'
          : isSchedulePanelOpen ? 'schedule'
          : isLeadsPanelOpen ? 'leads'
          : isDealsPanelOpen ? 'deals'
          : isQuotesPanelOpen ? 'quotes'
          : isFormsPanelOpen ? 'forms'
          : isReportsPanelOpen ? 'reports'
          : isListPanelOpen ? 'lists'
          : isActivityPanelOpen ? 'activity'
          : isPathsPanelOpen ? 'paths'
          : isOutreachPanelOpen ? 'outreach'
          : isSettingsPanelOpen ? 'settings'
          : null
        }
        onOpenPipes={openDealPipeline}
        onOpenTasks={openTasks}
        onOpenSchedule={openSchedule}
        onOpenLeads={openLeadsPanel}
        onOpenDeals={openDealsPanel}
        onOpenQuotes={openQuotesPanel}
        onOpenReports={openReportsPanel}
        onOpenActivity={() => guardFeature('activity', () => nav.toggleActivityFromActionBar())}
        activityUnreadCount={notificationInbox.unreadCount}
        showMenu={showMenu}
        setShowMenu={handleActionBarMenuChange}
        onOpenListPanel={openListPanel}
        selectedListIds={selectedListIds}
        onOpenPathsPanel={openPathsPanel}
        isPathTrackingActive={isPathTrackingActive}
        onOpenOutreach={handleOpenOutreach}
        onOpenForms={openFormsPanel}
        onOpenSettings={openSettingsPanel}
        onOpenPhotoMode={beginQuickPhotoCapture}
        currentUser={currentUser}
        onLogin={openLogin}
      />

      {showQuickCreateFab ? (
        <QuickCreateFab
          open={quickCreateOpen}
          onOpenChange={handleQuickCreateOpenChange}
          onCreateTask={openQuickCreateTask}
          onCreateLead={openQuickCreateLead}
          onCreateDeal={openQuickCreateDeal}
          onCreateQuote={openQuickCreateQuote}
          onCreateReport={openQuickCreateReport}
          canAccessFeature={canAccessFeature}
          accentColor={settings.parcelBoundaryColor || '#2563eb'}
          actionBarMenuOpen={showMenu}
          stormViewActive={!!selectedHailEvent}
        />
      ) : null}

      <ListPanel
        currentUser={currentUser}
        isOpen={isListPanelOpen && !isParcelListPanelOpen}
        panelDockSlot={panelDockSlot('lists', isListPanelOpen && !isParcelListPanelOpen)}
        onClose={handleListPanelBack}
        onBack={handleListPanelBack}
        selectedListIds={selectedListIds}
        onToggleListHighlight={(listId) => {
          setSelectedListIds(prev => {
            if (prev.includes(listId)) return prev.filter(id => id !== listId)
            if (prev.length >= 20) return prev
            return [...prev, listId]
          })
        }}
        onAddParcelsToList={showListSelector && parcelPendingForList
          ? handleAddSingleParcelToList
          : handleAddParcelsToList}
        selectedParcelsCount={showListSelector && parcelPendingForList ? 1 : selectedParcels.size}
        lists={lists}
        onListsChange={refreshLists}
        onListPatch={patchList}
        onDeleteList={handleDeleteList}
        onRenameList={handleRenameList}
        onShareList={handleShareList}
        onShareListWithTeams={handleShareListWithTeams}
        teams={teams}
        teamMembership={teamMembership}
        onValidateShareEmail={(email) => validateShareEmail(getToken, email)}
        onViewListContents={(listId) => nav.viewListContents(listId)}
        onExportList={handleExportList}
        isAddingSingleParcel={showListSelector && !!parcelPendingForList}
        parcelBoundaryColor={settings.parcelBoundaryColor}
        getToken={getToken}
        tagRegistry={tagRegistry}
        onRefreshTags={(tag) => upsertRegistryTag('lists', tag)}
      />

      <ParcelListPanel
        isOpen={isParcelListPanelOpen}
        panelDockSlot={panelDockSlot('lists', isParcelListPanelOpen)}
        onClose={handlePanelBack}
        selectedListId={viewingListId}
        lists={lists}
        onCenterParcel={handleGoToParcelOnMap}
        onBack={handlePanelBack}
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
          obscuredByPanel={(isListPanelOpen || showListSelector) && !!parcelPendingForList}
          suspendClose={isHailDataOpen || hailOpening || (!!parcelPendingForList && showListSelector)}
          onClose={handleParcelDetailsClose}
          parcelData={clickedParcelData}
          onEmailClick={handleEmailClick}
          onPhoneClick={handlePhoneClick}
          lists={lists}
          enableAutoClose={false}
          popupData={clickedParcelData ? {
            ...(popupData || {}),
            parcelId: clickedParcelData.id,
            isSkipTracing: skipTracingInProgress.has(resolveParcelId(clickedParcelData) || clickedParcelData.id),
            hasSkipTraced: isParcelSkipTraced(clickedParcelData),
          } : popupData}
          isLead={clickedParcelData ? isParcelALeadCheck(clickedParcelData) : false}
          onSkipTrace={() => { if (clickedParcelData) handleSkipTraceParcel(clickedParcelData) }}
          onAddToList={() => beginAddParcelToList(clickedParcelData)}
          onConvertToLead={() => { if (clickedParcelData) handleConvertToLead(clickedParcelData) }}
          onViewLead={() => { if (clickedParcelData) handleViewLeadFromParcel(clickedParcelData) }}
          onOpenPhotos={handleParcelPhotos}
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
        getModalPortalContainer() || document.body
      )}

      <SkipTracedListPanel
        isOpen={isSkipTracedListPanelOpen}
        onClose={() => nav.pop()}
        onOpenParcelDetails={handleOpenParcelDetails}
      />

      {dealPipelineMounted && (
      <Suspense fallback={
        <PanelListLoadingShell open={isDealPipelineOpen} title="Pipes" onBack={handlePanelBack} className="deal-pipeline-panel" />
      }>
      <DealPipeline
        isOpen={isDealPipelineOpen}
        panelDockSlot={panelDockSlot('pipes', isDealPipelineOpen && !pipesPromotedDealId)}
        promotedDealPanelDockSlot={panelDockSlot('deals', !!pipesPromotedDealId)}
        onClose={handlePanelBack}
        onBack={handlePanelBack}
        pipelines={pipelines}
        activePipelineId={activePipelineId}
        promotedDealId={pipesPromotedDealId}
        promotedDealPipelineId={pipesPromotedDealId ? dealsDetailPipelineId : null}
        pipesLeadOverlayId={pipesLeadOverlayId}
        onOpenDeal={(dealId) => nav.pushPipesDeal(dealId)}
        onOpenLeadOverlay={(leadId) => nav.pushPipesLead(leadId)}
        onCloseDeal={() => nav.popDealsDetail()}
        onCloseLeadOverlay={() => nav.popIfTop('pipes.lead')}
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
          const pipe = pipelines.find((p) => p.id === activePipelineId)
          if (!pipe || !canAddDealsToPipeline(currentUser, pipe, teams)) {
            showToast('You cannot update deals on this pipeline', 'error')
            return
          }
          try {
            await updatePipeline(getToken, activePipelineId, { deals: newDeals })
            setPipelines((prev) => prev.map((p) => (p.id === activePipelineId
              ? { ...p, deals: newDeals }
              : p)))
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
        onTextClick={handleTextClick}
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
        canAccessPhotos={canAccessFeature('photos')}
        onEditLead={handleEditLead}
        onLeadDeleted={handleLeadDeleted}
        editLeadId={editLead?.id ?? null}
        onCreateLead={openCreateLeadForPicker}
        tagRegistry={tagRegistry}
        onRefreshTags={(tag) => upsertRegistryTag('deals', tag)}
        leadStatuses={leadStatuses}
      />
      </Suspense>
      )}

      {schedulePanelMounted && (
      <Suspense fallback={
        <PanelListLoadingShell open={isSchedulePanelOpen} title="Schedule" onBack={handlePanelBack} className="schedule-panel deal-pipeline-panel" />
      }>
      <SchedulePanel
        isOpen={isSchedulePanelOpen}
        panelDockSlot={panelDockSlot('schedule', isSchedulePanelOpen)}
        stacked={scheduleStacked}
        onClose={closeSchedulePanel}
        onBack={handlePanelBack}
        hasScheduleOpener={hasScheduleOpener}
        initialDate={scheduleInitialDate}
        onInitialDateConsumed={() => nav.consumeScheduleInitialDate()}
        obscuredByLeadDetail={isSchedulePanelOpen && isLeadsDetailStandalone && !!leadsDetailLeadId}
        onOpenScheduleLead={(leadId) => {
          guardFeature('leads', () => nav.openLeadDetailFromSchedule(leadId))
        }}
        leads={leads}
        pipelines={pipelines}
        activePipelineId={activePipelineId}
        deals={activePipelineDeals}
        onLeadsChange={() => refreshLeads()}
        onDealsChange={() => refreshPipelines()}
        onOpenParcelDetails={handleOpenParcelDetails}
        onEmailClick={handleEmailClick}
        onPhoneClick={handlePhoneClick}
        onTextClick={handleTextClick}
        onSkipTraceParcel={handleSkipTraceParcel}
        skipTracingInProgress={skipTracingInProgress}
        onGoToParcelOnMap={handleGoToParcelOnMap}
        getToken={getToken}
        currentUser={currentUser}
        onPipelinesChange={refreshPipelines}
        teams={teams}
        teamMembership={teamMembership}
        onEditLead={handleEditLead}
        onCreateLead={openCreateLeadForPicker}
      />
      </Suspense>
      )}

      {tasksPanelMounted && (
      <Suspense fallback={
        <PanelListLoadingShell
          open={isTasksPanelOpen}
          title="Tasks"
          onBack={handleTasksPanelClose}
          className="tasks-panel"
          panelDockSlot={panelDockSlot('tasks', isTasksPanelOpen)}
        />
      }>
      <TasksPanel
        isOpen={isTasksPanelOpen}
        topLayer={isTasksPanelTopLayer}
        panelDockSlot={panelDockSlot('tasks', isTasksPanelOpen)}
        instantDismiss={false}
        onClose={handleTasksPanelClose}
        onBack={handleTasksPanelClose}
        pipelines={pipelines}
        activePipelineId={activePipelineId}
        leads={leads}
        deals={activePipelineDeals}
        onLeadsChange={() => refreshLeads()}
        onDealsChange={() => refreshPipelines()}
        onOpenTaskInDealPipeline={handleOpenTaskInDealPipeline}
        onOpenDeal={(dealId, pipelineId) => {
          guardFeature('deals', () => nav.openDealDetailFromTasks(dealId, pipelineId))
        }}
        getToken={getToken}
        currentUser={currentUser}
        onPipelinesChange={refreshPipelines}
        teams={teams}
        onOpenScheduleAtDate={(ts) => openScheduleAtDate(ts)}
        onOpenLead={(lead) => {
          if (!lead?.id) return
          guardFeature('leads', () => nav.openLeadDetailFromTasks(lead.id))
        }}
        onCreateLead={openCreateLeadForPicker}
        quickCreateRequestKey={quickCreateTaskKey}
      />
      </Suspense>
      )}

      <PhoneActionPanel
        isOpen={!!phoneActionPanel}
        onClose={() => nav.popMapOverlay()}
        phone={phoneActionPanel?.phone}
        parcelData={phoneActionPanel?.parcelData}
        leadId={phoneActionPanel?.leadId}
        initialStep={phoneActionPanel?.initialStep ?? 1}
        onOutreach={(type) => handleLogLeadOutreach(phoneActionPanel?.leadId, type, phoneActionPanel?.phone)}
      />

      <EmailActionPanel
        isOpen={!!emailActionPanel}
        onClose={() => nav.popMapOverlay()}
        email={emailActionPanel?.email}
        parcelData={emailActionPanel?.parcelData}
        onSelectTemplate={handleOpenEmailComposer}
        onNoTemplate={() => handleOpenEmailComposer(null)}
      />

      {outreachPanelMounted && (
      <Suspense fallback={null}>
      <OutreachPanel
        isOpen={isOutreachPanelOpen}
        panelDockSlot={panelDockSlot('outreach', isOutreachPanelOpen)}
        onClose={() => {
          nav.pop()
          setSelectedEmailTemplate(null)
        }}
        initialTab={outreachInitialTab}
      />
      </Suspense>
      )}

      {emailComposerMounted && (
      <Suspense fallback={null}>
      <EmailComposer
        isOpen={isEmailComposerOpen}
        onClose={() => {
          nav.pop()
          setSelectedEmailTemplate(null)
          setEmailComposerParcelData(null)
          setEmailComposerRecipient({ email: '', name: '' })
          setEmailComposerLeadId(null)
        }}
        template={selectedEmailTemplate}
        parcelData={emailComposerParcelData}
        recipientEmail={emailComposerRecipient.email}
        recipientName={emailComposerRecipient.name}
        leadId={emailComposerLeadId}
        onOutreach={() => handleLogLeadOutreach(emailComposerLeadId, 'email', emailComposerRecipient.email)}
        getToken={getToken}
        currentUser={currentUser}
        teamMembers={teamMembers}
        emailTestMode={settings.emailTestMode}
        testEmail={settings.defaultEmail}
      />
      </Suspense>
      )}

      {formsPanelMounted && (
        <Suspense fallback={
          <PanelListLoadingShell open={isFormsPanelOpen} title="Forms" onBack={handlePanelBack} className="forms-panel lists-panel" />
        }>
          <FormsPanel
            isOpen={isFormsPanelOpen}
            panelDockSlot={panelDockSlot('forms', isFormsPanelOpen)}
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

      {quotesPanelMounted && (
        <Suspense fallback={
          <PanelListLoadingShell open={isQuotesListOpen} title="Quotes" onBack={handlePanelBack} className="quotes-panel lists-panel" />
        }>
          <QuotesPanel
            isOpen={isQuotesListOpen || !!quotesDetailQuoteId}
            panelDockSlot={panelDockSlot('quotes', isQuotesListOpen || !!quotesDetailQuoteId)}
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
            quickCreateRequestKey={quickCreateQuoteKey}
          />
        </Suspense>
      )}

      {reportsPanelMounted && (
        <Suspense fallback={
          <PanelListLoadingShell open={isReportsPanelOpen} title="Reports" onBack={handlePanelBack} className="reports-panel lists-panel" />
        }>
          <ReportsPanel
            isOpen={isReportsPanelOpen}
            panelDockSlot={panelDockSlot('reports', isReportsPanelOpen || !!reportsDetailReportId)}
            onClose={handlePanelBack}
            onBack={handlePanelBack}
            leads={leads}
            editorFrame={reportsEditorFrame}
            detailReportId={reportsDetailReportId}
            onOpenEditor={(frame) => nav.pushReportsEditor(frame)}
            onPatchEditor={(patch) => nav.patchReportsEditor(patch)}
            onOpenDetail={(reportId) => nav.pushReportsDetail(reportId)}
            onCloseEditor={handleCloseReportsEditor}
            onCloseDetail={handleCloseReportsDetail}
            teams={teams}
            teamMembership={teamMembership}
            quickCreateRequestKey={quickCreateReportKey}
            onLeadUpdate={(full) => {
              setLeads((prev) => upsertLeadInLocalStore(prev, full, mergeLeadDetail))
            }}
          />
        </Suspense>
      )}

      <LeadPickerDialog
        open={photoPickerOpen}
        onClose={() => {
          setPhotoPickerOpen(false)
          setPhotoPickerParcelId(null)
          setPhotoPickerAddress('')
        }}
        leads={leads}
        parcelId={photoPickerParcelId}
        onSelectLead={(lead) => {
          setPhotoPickerOpen(false)
          setPhotoPickerParcelId(null)
          setPhotoPickerAddress('')
          openPhotoModeForLead(lead, {
            parcelId: photoPickerParcelId || lead.parcelId,
            addressLabel: photoPickerAddress,
          })
        }}
        onCreateLead={() => {
          setPhotoPickerOpen(false)
          const parcel = photoPickerParcelId && clickedParcelData?.id === photoPickerParcelId
            ? clickedParcelData
            : null
          if (parcel) {
            guardFeature('leads', () => openPhotoModeForDraftParcel(parcel))
            setPhotoPickerParcelId(null)
            setPhotoPickerAddress('')
            return
          }
          setPhotoPickerParcelId(null)
          setPhotoPickerAddress('')
          guardFeature('leads', () => nav.pushModal({ type: 'createLead', prefill: null }))
        }}
      />

      {photoModeLead && (
        <PhotoCaptureModal
          open
          entityType="lead"
          entity={photoModeLead}
          parcelId={photoModeParcelId}
          addressLabel={photoModeAddress}
          autoOpenCamera={photoModeAutoCamera}
          getToken={getToken}
          currentUser={currentUser}
          onClose={closePhotoMode}
          onEntityUpdate={(updatedLead) => {
            setLeads((prev) => upsertLeadInLocalStore(prev, updatedLead))
            setPhotoModeLead((prev) => (
              prev?.id === updatedLead.id ? mergeLeadDetail(prev, updatedLead) : prev
            ))
          }}
          onLeadCreated={(lead, options = {}) => {
            setLeads((prev) => upsertLeadInLocalStore(prev, lead))
            setPhotoModeLead((prev) => (
              prev && !prev?.id ? { ...lead, photos: lead.photos || prev.photos || [] } : lead
            ))
            if (!options?.keepOpen) closePhotoMode()
          }}
          teams={teams}
          teamMembership={teamMembership}
          existingLeads={leads}
        />
      )}

      <QuickPhotoModeDialog
        open={quickPhotoModeOpen}
        onClose={() => setQuickPhotoModeOpen(false)}
        leads={leads}
        onConfirm={handleQuickPhotoModeConfirm}
      />

      {pathsPanelMounted && (
      <Suspense fallback={
        <PanelListLoadingShell open={isPathsPanelOpen} title="Paths" onBack={handlePanelBack} className="paths-panel lists-panel" />
      }>
      <PathsPanel
        isOpen={isPathsPanelOpen}
        panelDockSlot={panelDockSlot('paths', isPathsPanelOpen)}
        onClose={handlePanelBack}
        onBack={handlePanelBack}
        currentUser={currentUser}
        paths={paths}
        onPathsChange={refreshPaths}
        onPathPatch={patchPath}
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
        getToken={getToken}
        tagRegistry={tagRegistry}
        onRefreshTags={(tag) => upsertRegistryTag('paths', tag)}
        pathColorMap={pathColorMap}
      />
      </Suspense>
      )}

      {teamDetailMounted && activeTeamForDetail && (
      <Suspense fallback={null}>
      <TeamDetails
        team={activeTeamForDetail}
        currentUser={currentUser}
        getToken={getToken}
        onClose={() => nav.popIfTop('teams.detail')}
        onTeamsChange={refreshTeams}
        pendingInvites={pendingTeamInvites}
      />
      </Suspense>
      )}

      {settingsPanelMounted && (
      <Suspense fallback={
        <PanelListLoadingShell open={isSettingsPanelOpen} title="Settings" onBack={() => nav.pop()} className="settings-panel" />
      }>
      <SettingsPanel
        isOpen={isSettingsPanelOpen}
        topLayer={isSettingsPanelTopLayer}
        onClose={() => nav.pop()}
        settings={settings}
        onSettingsChange={handleSettingsChange}
        getToken={getToken}
        teams={teams}
        teamMembership={teamMembership}
        pendingTeamInvites={pendingTeamInvites}
        onTeamsChange={refreshTeams}
        onOpenTeamDetail={(teamId) => nav.pushTeamsDetail(teamId)}
        settingsTeamSectionOpen={!!teamsDetailTeamId || tourExpandSettingsSection === 'team'}
        onRestartTour={() => {
          nav.pop()
          nav.setShowMenu(false)
          setTourExpandSettingsSection(null)
          handleSettingsChange({ tourCompleted: false })
        }}
        onLogout={currentUser ? handleLogout : undefined}
      />
      </Suspense>
      )}

      {notificationInbox.panel}

      {leadsPanelMounted && (
      <Suspense fallback={
        <PanelListLoadingShell open={isLeadsPanelOpen} title="Leads" onBack={handlePanelBack} className="leads-panel" />
      }>
      <LeadsPanel
        isOpen={isLeadsPanelOpen}
        panelDockSlot={panelDockSlot('leads', isLeadsPanelOpen || isLeadsDetailStandalone)}
        loading={leadsLoading}
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
        onTextClick={handleTextClick}
        onGoToParcelOnMap={handleGoToParcelOnMap}
        createDealPipelines={pipelines.filter((p) => canAddDealsToPipeline(currentUser, p, teams))}
        createDealSaving={createDealSaving}
        onCreateDealSubmit={handleCreateDealSubmit}
        pipelinesCount={pipelines.length}
        onOpenDeal={(deal, pipelineId) => {
          guardFeature('deals', () => {
            nav.openDealFromLead(deal.id, pipelineId || deal.__pipelineId)
          })
        }}
        onOpenScheduleAtDate={(ts) => openScheduleAtDate(ts)}
        onPipelinesChange={refreshPipelines}
        teams={teams}
        teamMembership={teamMembership}
        detailLeadId={leadsDetailLeadId}
        dealsDetailDealId={dealsDetailDealId}
        dealsLeadOverlayId={dealsLeadOverlayId}
        onOpenLeadDetail={(leadId) => guardFeature('leads', () => nav.pushLeadsDetail(leadId))}
        onCloseLeadDetail={() => nav.popLeadsDetail()}
        currentUserId={currentUser?.uid}
        currentUser={currentUser}
        canSeeDealAmounts={showDealAmounts}
        canAccessPhotos={canAccessFeature('photos')}
        canAccessReports={canAccessFeature('reports')}
        onEditLead={handleEditLead}
        onLeadDeleted={handleLeadDeleted}
        onCreatePhotoReport={handleCreatePhotoReport}
        onOpenPhotoReport={handleOpenPhotoReport}
        tagRegistry={tagRegistry}
        onRefreshTags={(tag) => upsertRegistryTag('leads', tag)}
        leadStatuses={leadStatuses}
        leadsDetailTopLayer={isLeadsDetailTopLayer}
        isLeadsDetailStandalone={isLeadsDetailStandalone}
        editLeadId={editLead?.id ?? null}
      />
      </Suspense>
      )}

      {dealsPanelMounted && (
      <Suspense fallback={
        <PanelListLoadingShell open={isDealsPanelOpen} title="Deals" onBack={handlePanelBack} className="deals-panel" />
      }>
      <DealsPanel
        isOpen={isDealsPanelOpen}
        panelDockSlot={panelDockSlot('deals', isDealsPanelOpen || isDealsDetailStandalone)}
        loading={pipelinesLoading}
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
        onTextClick={handleTextClick}
        onGoToParcelOnMap={handleGoToParcelOnMap}
        currentUserId={currentUser?.uid}
        onCreateQuoteForDeal={handleCreateQuoteForDeal}
        onOpenQuoteFromDeal={handleOpenQuoteFromDeal}
        quotesRefreshKey={quotesRefreshEpoch}
        dealsDetailDealId={dealsDetailDealId}
        dealsDetailPipelineId={dealsDetailPipelineId}
        dealsDetailReturnToPipes={dealsDetailReturnToPipes}
        dealsClosedRecordId={dealsClosedRecordId}
        dealsLeadOverlayId={dealsLeadOverlayId}
        leadsDetailLeadId={leadsDetailLeadId}
        onOpenDealDetail={(dealId, pipelineId) => nav.pushDealsDetail(dealId, pipelineId)}
        onOpenDealFromLead={(dealId, pipelineId) => nav.openDealFromLead(dealId, pipelineId)}
        onOpenClosedDeal={(closedRecordId) => nav.pushDealsClosed(closedRecordId)}
        onOpenLeadOverlay={(leadId) => nav.pushDealsLead(leadId)}
        onCloseDealDetail={() => nav.popDealsDetail()}
        onCloseLeadOverlay={() => nav.popIfTop('deals.lead')}
        onCloseClosedDeal={() => nav.closeDealsClosed()}
        createDealPipelines={pipelines.filter((p) => canAddDealsToPipeline(currentUser, p, teams))}
        createDealSaving={createDealSaving}
        onCreateDealSubmit={handleCreateDealSubmit}
        pipelinesCount={pipelines.length}
        canSeeDealAmounts={showDealAmounts}
        canAccessPhotos={canAccessFeature('photos')}
        currentUser={currentUser}
        onEditLead={handleEditLead}
        onLeadDeleted={handleLeadDeleted}
        tagRegistry={tagRegistry}
        onRefreshTags={(tag) => upsertRegistryTag('deals', tag)}
        leadOverlayPanelDockSlot={leadOverlayPanelDockSlot}
        leadStatuses={leadStatuses}
        isDealsDetailStandalone={isDealsDetailStandalone}
        editLeadId={editLead?.id ?? null}
      />
      </Suspense>
      )}

      <CreateLeadDialog
        open={createLeadOpen || !!editLead}
        onOpenChange={(v) => {
          if (!v) {
            setEditLead(null)
            leadPickerCreateCallbackRef.current = null
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
        currentUser={currentUser}
        nestedOverlay={!!editLead || createLeadOpen}
        topLayer={createLeadOpen || !!editLead}
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

      {hailDataMounted && (
      <Suspense fallback={null}>
      <HailDataPanel
        isOpen={isHailDataOpen}
        onClose={handleCloseHailData}
        parcelData={hailDataParcel}
        onSelectEvent={handleSelectHailEvent}
      />
      </Suspense>
      )}

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
    </PhotoUploadProvider>
    </UserDataSyncProvider>
  )
}

export default App

export function AppWithPublicFormRoute() {
  const publicRoute = typeof window !== 'undefined' ? getPublicRouteFromWindow() : null
  const formToken = publicRoute?.type === 'form' ? publicRoute.token : null
  const quoteToken = publicRoute?.type === 'quote' ? publicRoute.token : null
  const reportToken = publicRoute?.type === 'report' ? publicRoute.token : null
  const isResetPassword = publicRoute?.type === 'reset-password'
  if (isResetPassword) {
    return (
      <div className="h-[100dvh] overflow-hidden">
        <ResetPasswordPage />
        <ToastContainer />
      </div>
    )
  }
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
  if (reportToken) {
    return (
      <div className="h-[100dvh] overflow-hidden">
        <PublicReportPage token={reportToken} />
        <ToastContainer />
      </div>
    )
  }
  return <App />
}
