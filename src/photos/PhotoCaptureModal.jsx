import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, ChevronLeft, RotateCw, Zap, ZapOff, Image as ImageIcon, Camera } from 'lucide-react'
import { sumPhotoBytes, LEAD_STORAGE_LIMIT_BYTES, DEAL_STORAGE_LIMIT_BYTES, getCurrentPosition } from '@/photos/photosClient'
import { usePhotoUpload, useEntityUploadJobs } from './PhotoUploadProvider'
import { draftSessionId, entityKey } from './entityRef'
import { getBlobs } from './photoStoreIdb'
import { VISIBILITY } from '@/utils/access'
import { getTeamForMembership } from '@/utils/profile'
import { showToast } from '../components/ui/toast'
import { createLead, findLeadByParcelId, formatLeadAddress, loadLocalLeads } from '@/utils/leads'
import { FilePreviewOverlay } from '../components/ui/FilePreviewOverlay'
import { cn } from '@/lib/utils'
import { getModalPortalContainer } from '@/utils/modalPortal'
import { logLeadPhotosAdded } from '@/utils/leadActivity'
import { photoLog, photoLogError, photoLogCameraEnvironment, photoLogWarn } from './photoDebug'
import {
  isNativeCameraPreviewAvailable,
  startNativeCameraPreview,
  stopNativeCameraPreview,
  captureNativeStill,
  flipNativeCamera,
  setNativeFlashMode,
  resizeNativeCameraPreview,
  isNativeCameraPreviewStarted,
} from './nativeCameraPreview'

function canUseWebCamera() {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

function canUseCamera() {
  return isNativeCameraPreviewAvailable() || canUseWebCamera()
}

function isCameraNotFoundError(err) {
  const name = err?.name || ''
  const msg = String(err?.message || '')
  return name === 'NotFoundError'
    || name === 'DevicesNotFoundError'
    || /device not found/i.test(msg)
}

function isCameraPermissionError(err) {
  const name = err?.name || ''
  const msg = String(err?.message || '')
  return name === 'NotAllowedError'
    || name === 'PermissionDeniedError'
    || /permission|denied|not authorized|access/i.test(msg)
}

async function hasVideoInputDevice() {
  if (!navigator.mediaDevices?.enumerateDevices) return true
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.some((d) => d.kind === 'videoinput')
  } catch {
    return true
  }
}

async function requestCameraStream(facingMode = 'environment') {
  const portrait = typeof window !== 'undefined' && window.innerHeight > window.innerWidth
  const idealW = portrait ? 1080 : 1920
  const idealH = portrait ? 1920 : 1080
  const attempts = [
    { video: { facingMode: { ideal: facingMode }, width: { ideal: idealW }, height: { ideal: idealH } }, audio: false },
    { video: { facingMode: facingMode === 'environment' ? 'user' : 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
    { video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
    { video: true, audio: false },
  ]
  let lastErr
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch (e) {
      lastErr = e
      if (isCameraNotFoundError(e)) break
    }
  }
  throw lastErr || new Error('Camera unavailable')
}

async function bindStreamToVideo(video, stream) {
  video.srcObject = stream
  await video.play()
}

/**
 * Crop the video frame to match object-fit: cover for the rendered element,
 * then apply digital zoom (center crop).
 */
function captureCoverFrame(video, zoomScale = 1) {
  if (!video?.videoWidth) return null
  const vw = video.videoWidth
  const vh = video.videoHeight
  const rect = video.getBoundingClientRect?.()
  const elW = rect?.width || video.clientWidth || vw
  const elH = rect?.height || video.clientHeight || vh
  if (!(elW > 0 && elH > 0)) return null

  const videoAspect = vw / vh
  const elAspect = elW / elH
  let sx = 0
  let sy = 0
  let sw = vw
  let sh = vh
  if (videoAspect > elAspect) {
    sw = vh * elAspect
    sx = (vw - sw) / 2
  } else if (videoAspect < elAspect) {
    sh = vw / elAspect
    sy = (vh - sh) / 2
  }

  const scale = Math.max(1, zoomScale)
  if (scale > 1) {
    const zw = sw / scale
    const zh = sh / scale
    sx += (sw - zw) / 2
    sy += (sh - zh) / 2
    sw = zw
    sh = zh
  }

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(sw))
  canvas.height = Math.max(1, Math.round(sh))
  const ctx = canvas.getContext('2d')
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.92)
}

async function captureStillFromTrack(stream) {
  const track = stream?.getVideoTracks?.()?.[0]
  if (!track || typeof ImageCapture === 'undefined') return null
  try {
    const imageCapture = new ImageCapture(track)
    if (typeof imageCapture.takePhoto !== 'function') return null
    const blob = await imageCapture.takePhoto()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

const ZOOM_PRESETS = [0.5, 1, 3]
const MAX_ZOOM = 5

function touchDistance(t1, t2) {
  const dx = t1.clientX - t2.clientX
  const dy = t1.clientY - t2.clientY
  return Math.hypot(dx, dy)
}

function clampZoom(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function getTrackZoomRange(stream) {
  const track = stream?.getVideoTracks?.()?.[0]
  const caps = track?.getCapabilities?.()
  if (!caps?.zoom) return null
  return {
    min: caps.zoom.min ?? 1,
    max: caps.zoom.max ?? 1,
    step: caps.zoom.step ?? 0.1,
  }
}

async function applyTrackZoom(stream, zoom) {
  const track = stream?.getVideoTracks?.()?.[0]
  if (!track?.applyConstraints) return false
  const range = getTrackZoomRange(stream)
  if (!range) return false
  const z = clampZoom(zoom, range.min, range.max)
  try {
    await track.applyConstraints({ advanced: [{ zoom: z }] })
    return true
  } catch {
    return false
  }
}

/** CSS scale is always >= 1 so object-fit: cover keeps the preview full screen. */
function displayScaleForZoom(zoomFactor) {
  return Math.max(1, zoomFactor)
}

function nearestPresetLabel(zoomFactor) {
  let best = ZOOM_PRESETS[1]
  let bestDist = Infinity
  for (const p of ZOOM_PRESETS) {
    const dist = Math.abs(zoomFactor - p)
    if (dist < bestDist) {
      bestDist = dist
      best = p
    }
  }
  return String(best)
}

function facingToNativePosition(facingMode) {
  return facingMode === 'user' ? 'front' : 'rear'
}

function PhotoCaptureModalInner({
  open,
  entityType = 'lead',
  entity,
  pipelineId = null,
  parcelId = null,
  addressLabel = '',
  getToken,
  currentUser,
  onClose,
  onEntityUpdate,
  onPhotosAdded,
  onLeadCreated,
  teams = [],
  teamMembership = null,
  existingLeads = [],
  /** Skip the Upload/Camera chooser and jump straight into the camera (Quick Photo Mode). */
  autoOpenCamera = false,
}) {
  const { enqueueCapture, reassignDraftJobs } = usePhotoUpload()
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const libraryInputRef = useRef(null)
  const draftIdRef = useRef(null)
  const cameraFallbackNotifiedRef = useRef(false)
  const promotingLeadRef = useRef(false)
  const savedLeadRef = useRef(null)
  const galleryLongPressRef = useRef(null)
  const pinchRef = useRef({ active: false, startDist: 0, startZoom: 1 })
  const zoomFactorRef = useRef(1)
  const useNativePreviewRef = useRef(false)
  const resizeTimerRef = useRef(null)
  const flashEnabledRef = useRef(false)
  const startCameraRef = useRef(null)

  const [mode, setMode] = useState('chooser')
  const [sessionItems, setSessionItems] = useState([])
  const [flash, setFlash] = useState(false)
  const [promotingLead, setPromotingLead] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [useCamera, setUseCamera] = useState(false)
  const [useNativePreview, setUseNativePreview] = useState(false)
  const [cameraStarting, setCameraStarting] = useState(false)
  const [viewerIndex, setViewerIndex] = useState(null)
  const [facingMode, setFacingMode] = useState('environment')
  const [flashEnabled, setFlashEnabled] = useState(false)
  const [zoomFactor, setZoomFactor] = useState(1)
  const [pinching, setPinching] = useState(false)
  const [trackZoomRange, setTrackZoomRange] = useState(null)

  const minZoom = trackZoomRange?.min ?? 1
  const maxZoom = Math.max(MAX_ZOOM, trackZoomRange?.max ?? MAX_ZOOM)
  const displayScale = displayScaleForZoom(zoomFactor)
  const activePreset = nearestPresetLabel(zoomFactor)
  const wideZoomAvailable = !useNativePreview && trackZoomRange != null && trackZoomRange.min < 1

  const syncTrackZoom = useCallback((stream, factor, range) => {
    if (!stream || !range) return
    if (factor < 1) {
      void applyTrackZoom(stream, range.min)
    } else {
      void applyTrackZoom(stream, 1)
    }
  }, [])

  const setZoom = useCallback((next, range = trackZoomRange) => {
    if (useNativePreviewRef.current) {
      // Native pinch zoom is handled by the camera-preview plugin (enableZoom).
      const clamped = clampZoom(next, 1, MAX_ZOOM)
      zoomFactorRef.current = clamped
      setZoomFactor(clamped)
      return
    }
    const lo = range?.min ?? 1
    const hi = Math.max(MAX_ZOOM, range?.max ?? MAX_ZOOM)
    const clamped = clampZoom(next, lo, hi)
    zoomFactorRef.current = clamped
    setZoomFactor(clamped)
    syncTrackZoom(streamRef.current, clamped, range)
  }, [trackZoomRange, syncTrackZoom])

  useEffect(() => {
    zoomFactorRef.current = zoomFactor
  }, [zoomFactor])

  useEffect(() => {
    useNativePreviewRef.current = useNativePreview
  }, [useNativePreview])

  useEffect(() => {
    flashEnabledRef.current = flashEnabled
  }, [flashEnabled])

  // Revoke session preview blob URLs when the modal closes or unmounts so each
  // capture session doesn't leak thumbnail bitmaps.
  const sessionItemsRef = useRef(sessionItems)
  sessionItemsRef.current = sessionItems
  const revokeSessionPreviews = useCallback(() => {
    for (const item of sessionItemsRef.current) {
      if (item?.previewUrl?.startsWith?.('blob:')) URL.revokeObjectURL(item.previewUrl)
    }
    sessionItemsRef.current = []
    setSessionItems([])
  }, [])
  useEffect(() => {
    if (!open && sessionItemsRef.current.length > 0) revokeSessionPreviews()
  }, [open, revokeSessionPreviews])
  useEffect(() => () => {
    for (const item of sessionItemsRef.current) {
      if (item?.previewUrl?.startsWith?.('blob:')) URL.revokeObjectURL(item.previewUrl)
    }
  }, [])

  const activeTeam = getTeamForMembership(teams, teamMembership) || teams?.[0] || null

  const resolvedEntity = savedLeadRef.current?.id ? savedLeadRef.current : entity
  const isLead = entityType === 'lead'
  const isDraft = isLead && !resolvedEntity?.id

  const entityRef = useMemo(() => {
    if (entityType === 'deal') {
      const dealId = resolvedEntity?.id
      if (!dealId) return null
      return { entityType: 'deal', pipelineId, dealId, entityId: dealId }
    }
    if (isDraft) {
      if (!draftIdRef.current) draftIdRef.current = draftSessionId()
      return { entityType: 'lead', leadId: draftIdRef.current, entityId: draftIdRef.current }
    }
    const leadId = resolvedEntity?.id
    if (!leadId) return null
    return { entityType: 'lead', leadId, entityId: leadId }
  }, [entityType, resolvedEntity?.id, pipelineId, isDraft])

  const entityUploadJobs = useEntityUploadJobs(entityRef || { entityType: 'lead', leadId: '', entityId: '' })

  const limitBytes = entityType === 'deal' ? DEAL_STORAGE_LIMIT_BYTES : LEAD_STORAGE_LIMIT_BYTES
  const photosUsed = sumPhotoBytes(resolvedEntity?.photos || [])
  const storageFull = photosUsed >= limitBytes

  const activeUploadCount = useMemo(
    () => entityUploadJobs.filter((j) => j.status !== 'done').length,
    [entityUploadJobs],
  )

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    if (useNativePreviewRef.current || isNativeCameraPreviewStarted()) {
      void stopNativeCameraPreview()
    }
    useNativePreviewRef.current = false
    setUseNativePreview(false)
    setCameraReady(false)
    setCameraStarting(false)
    setUseCamera(false)
  }, [])

  const showLibraryFallback = useCallback((message) => {
    setUseCamera(false)
    setCameraStarting(false)
    setUseNativePreview(false)
    useNativePreviewRef.current = false
    if (!cameraFallbackNotifiedRef.current) {
      cameraFallbackNotifiedRef.current = true
      showToast(message, 'info')
    }
  }, [])

  const startWebCamera = useCallback(async (facing) => {
    if (!canUseWebCamera()) {
      showLibraryFallback('Camera not supported here — use Upload photos instead')
      return
    }

    const hasCamera = await hasVideoInputDevice()
    if (!hasCamera) {
      photoLogWarn('capture.camera', 'No video input devices detected')
      showLibraryFallback('No camera on this device — use Upload photos instead')
      return
    }

    const stream = await requestCameraStream(facing)
    streamRef.current = stream
    const range = getTrackZoomRange(stream)
    setTrackZoomRange(range)
    zoomFactorRef.current = 1
    setZoomFactor(1)
    if (videoRef.current) await bindStreamToVideo(videoRef.current, stream)
    if (range) void applyTrackZoom(stream, 1)
    setUseNativePreview(false)
    useNativePreviewRef.current = false
    setCameraReady(true)
    setCameraStarting(false)
    photoLog('capture.camera', 'Web camera ready', { trackZoom: range })
  }, [showLibraryFallback])

  const startCamera = useCallback(async (facing = facingMode) => {
    if (!canUseCamera()) {
      showLibraryFallback('Camera not supported here — use Upload photos instead')
      return
    }
    stopCamera()
    setUseCamera(true)
    setCameraStarting(true)
    photoLog('capture.camera', 'Requesting camera', {
      facing,
      native: isNativeCameraPreviewAvailable(),
    })

    try {
      if (isNativeCameraPreviewAvailable()) {
        try {
          const ok = await startNativeCameraPreview({
            position: facingToNativePosition(facing),
            enableHighResolution: true,
          })
          if (ok) {
            setUseNativePreview(true)
            useNativePreviewRef.current = true
            setTrackZoomRange(null)
            zoomFactorRef.current = 1
            setZoomFactor(1)
            setCameraReady(true)
            setCameraStarting(false)
            if (flashEnabledRef.current) {
              void setNativeFlashMode('on')
            }
            photoLog('capture.camera', 'Native camera preview ready')
            return
          }
        } catch (nativeErr) {
          photoLogWarn('capture.camera', 'Native preview failed — falling back to web', {
            message: String(nativeErr?.message || nativeErr),
          })
          await stopNativeCameraPreview()
        }
      }

      await startWebCamera(facing)
    } catch (err) {
      if (isCameraNotFoundError(err)) {
        showLibraryFallback('No camera on this device — use Upload photos instead')
      } else if (isCameraPermissionError(err)) {
        showLibraryFallback('Camera permission denied — use Upload photos instead')
      } else {
        photoLogError('capture.camera', 'Camera failed', err)
        showLibraryFallback('Camera unavailable — use Upload photos instead')
      }
    }
  }, [facingMode, showLibraryFallback, startWebCamera, stopCamera])

  startCameraRef.current = startCamera

  useEffect(() => {
    if (!open) {
      stopCamera()
      setMode('chooser')
      setSessionItems([])
      draftIdRef.current = null
      savedLeadRef.current = null
      cameraFallbackNotifiedRef.current = false
      promotingLeadRef.current = false
      setFacingMode('environment')
      setFlashEnabled(false)
      setZoomFactor(1)
      setTrackZoomRange(null)
      zoomFactorRef.current = 1
      return undefined
    }
    photoLog('capture.open', 'Photo capture modal opened', {
      entityType,
      entityId: entity?.id || 'draft',
      isDraft: isLead && !entity?.id,
      autoOpenCamera,
    })
    photoLogCameraEnvironment()

    if (!window.isSecureContext && !isNativeCameraPreviewAvailable()) {
      photoLogWarn('capture.camera', 'Insecure context — camera blocked on mobile LAN. Use: npm run dev:mobile')
    }

    if (autoOpenCamera) {
      setMode('camera')
      void startCameraRef.current?.('environment')
    }

    return () => {
      stopCamera()
    }
  }, [open, entityType, entity?.id, isLead, stopCamera, autoOpenCamera])

  // Remeasure native preview after rotate / resize.
  useEffect(() => {
    if (!open || !useNativePreview || !cameraReady) return undefined
    const onResize = () => {
      if (resizeTimerRef.current) window.clearTimeout(resizeTimerRef.current)
      resizeTimerRef.current = window.setTimeout(() => {
        void resizeNativeCameraPreview().catch((err) => {
          photoLogWarn('capture.camera', 'Native resize failed', { message: String(err?.message || err) })
        })
      }, 250)
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      if (resizeTimerRef.current) window.clearTimeout(resizeTimerRef.current)
    }
  }, [open, useNativePreview, cameraReady])

  // Stop camera when the native app backgrounds.
  useEffect(() => {
    if (!open || !isNativeCameraPreviewAvailable()) return undefined
    let remove = null
    let cancelled = false
    ;(async () => {
      try {
        const { App } = await import('@capacitor/app')
        if (cancelled) return
        remove = await App.addListener('appStateChange', ({ isActive }) => {
          if (!isActive && (useNativePreviewRef.current || streamRef.current)) {
            stopCamera()
            setMode('chooser')
          }
        })
      } catch {
        /* web / plugin missing */
      }
    })()
    return () => {
      cancelled = true
      remove?.remove?.()
    }
  }, [open, stopCamera])

  const triggerFlash = (kind = 'white') => {
    setFlash(kind)
    window.setTimeout(() => setFlash(false), kind === 'black' ? 120 : 300)
  }

  const buildMetadata = useCallback(async () => {
    const pos = await getCurrentPosition()
    const name = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User'
    return {
      capturedByUid: currentUser?.uid ?? null,
      capturedByName: name,
      lat: pos?.lat ?? resolvedEntity?.lat ?? null,
      lng: pos?.lng ?? resolvedEntity?.lng ?? null,
      addressLabel: addressLabel || formatLeadAddress(resolvedEntity) || resolvedEntity?.address || '',
      parcelId: parcelId || resolvedEntity?.parcelId || null,
    }
  }, [currentUser, resolvedEntity, parcelId, addressLabel])

  /** Create a real lead from draft prefill so uploads can start immediately. */
  const ensureLeadSaved = useCallback(async () => {
    if (!isDraft || savedLeadRef.current?.id) return savedLeadRef.current
    if (promotingLeadRef.current) {
      while (promotingLeadRef.current) {
        await new Promise((r) => setTimeout(r, 50))
      }
      return savedLeadRef.current
    }

    const source = entity || {}
    const findExistingForSource = () => (
      findLeadByParcelId(existingLeads, source, { matchCoords: false })
      || (source.parcelId
        ? existingLeads.find((l) => l?.parcelId != null && String(l.parcelId) === String(source.parcelId))
        : null)
    )

    const adoptExistingLead = async (lead) => {
      if (!lead?.id) return null
      photoLog('capture.promote', 'Reusing existing lead for parcel', { leadId: lead.id })
      savedLeadRef.current = lead
      if (draftIdRef.current) {
        const newRef = { entityType: 'lead', leadId: lead.id, entityId: lead.id }
        await reassignDraftJobs(draftIdRef.current, newRef)
      }
      onLeadCreated?.(lead, { keepOpen: true })
      onEntityUpdate?.(lead)
      return lead
    }

    // If this parcel is already linked, reuse that lead instead of failing.
    // Photo mode must never error just because a lead already exists.
    const existing = findExistingForSource()
    if (existing?.id) return adoptExistingLead(existing)

    let firstName = (source.firstName ?? '').trim()
    let lastName = (source.lastName ?? '').trim()
    if (!firstName && !lastName) lastName = 'Property'

    promotingLeadRef.current = true
    setPromotingLead(true)
    try {
      photoLog('capture.promote', 'Auto-creating lead for immediate upload')
      const created = await createLead(getToken, {
        firstName,
        lastName,
        address: (source.address ?? '').trim(),
        phone: (source.phone ?? '').trim() || null,
        email: (source.email ?? '').trim() || null,
        notes: (source.notes ?? '').trim(),
        parcelId: source.parcelId,
        lat: source.lat,
        lng: source.lng,
        properties: source.properties,
        visibility: VISIBILITY.PRIVATE,
        sharedMemberUids: [],
        teamId: activeTeam?.id || null,
        teamShares: [],
      })
      savedLeadRef.current = created
      if (draftIdRef.current) {
        const newRef = { entityType: 'lead', leadId: created.id, entityId: created.id }
        await reassignDraftJobs(draftIdRef.current, newRef)
      }
      onLeadCreated?.(created, { keepOpen: true })
      onEntityUpdate?.(created)
      photoLog('capture.promote', 'Lead auto-created', { leadId: created.id })
      return created
    } catch (e) {
      const msg = String(e?.message || '')
      if (/lead already exists/i.test(msg)) {
        const fallback = findExistingForSource()
          || findLeadByParcelId(loadLocalLeads(), source, { matchCoords: false })
        if (fallback?.id) return adoptExistingLead(fallback)
      }
      throw e
    } finally {
      promotingLeadRef.current = false
      setPromotingLead(false)
    }
  }, [isDraft, entity, existingLeads, getToken, activeTeam, reassignDraftJobs, onLeadCreated, onEntityUpdate])

  const resolveCaptureRef = useCallback(async () => {
    if (entityType === 'deal') {
      return {
        ref: { entityType: 'deal', pipelineId, dealId: resolvedEntity.id, entityId: resolvedEntity.id },
        photos: resolvedEntity?.photos || [],
        leadId: null,
      }
    }
    if (isDraft) {
      const saved = await ensureLeadSaved()
      return {
        ref: { entityType: 'lead', leadId: saved.id, entityId: saved.id },
        photos: saved?.photos || [],
        leadId: saved.id,
      }
    }
    return {
      ref: { entityType: 'lead', leadId: resolvedEntity.id, entityId: resolvedEntity.id },
      photos: resolvedEntity?.photos || [],
      leadId: resolvedEntity.id,
    }
  }, [entityType, pipelineId, resolvedEntity, isDraft, ensureLeadSaved])

  const addCapture = useCallback(async (source, { withFlash = false, flashKind = 'white' } = {}) => {
    if (storageFull) {
      photoLogWarn('capture.add', 'Storage full — capture blocked')
      showToast('Photo storage is full', 'error')
      return
    }
    try {
      const { ref, photos, leadId } = await resolveCaptureRef()
      const metadata = await buildMetadata()
      photoLog('capture.add', 'Enqueueing capture', { entityKey: entityKey(ref) })
      const job = await enqueueCapture(source, ref, metadata, photos)
      const blobs = await getBlobs(job.jobId)
      const previewUrl = blobs?.thumb ? URL.createObjectURL(blobs.thumb) : null
      setSessionItems((prev) => [{ jobId: job.jobId, previewUrl, createdAt: Date.now() }, ...prev])
      if (withFlash) triggerFlash(flashKind)
      if (leadId) {
        onPhotosAdded?.()
        void logLeadPhotosAdded(getToken, leadId, 1).catch(() => {})
      }
    } catch (e) {
      photoLogError('capture.add', 'Capture failed', e)
      showToast(e.message || 'Could not add photo', 'error')
    }
  }, [storageFull, resolveCaptureRef, buildMetadata, enqueueCapture, onPhotosAdded, getToken])

  const captureFromVideo = useCallback(async () => {
    const still = await captureStillFromTrack(streamRef.current)
    if (still) return still
    return captureCoverFrame(videoRef.current, displayScaleForZoom(zoomFactorRef.current))
  }, [])

  const handleViewportTouchStart = (e) => {
    if (useNativePreviewRef.current) return
    if (e.touches.length === 2) {
      pinchRef.current = {
        active: true,
        startDist: touchDistance(e.touches[0], e.touches[1]),
        startZoom: zoomFactorRef.current,
      }
      setPinching(true)
    }
  }

  const handleViewportTouchMove = (e) => {
    if (useNativePreviewRef.current) return
    if (!pinchRef.current.active || e.touches.length !== 2) return
    e.preventDefault()
    const dist = touchDistance(e.touches[0], e.touches[1])
    if (!pinchRef.current.startDist) return
    const ratio = dist / pinchRef.current.startDist
    setZoom(pinchRef.current.startZoom * ratio)
  }

  const handleViewportTouchEnd = (e) => {
    if (useNativePreviewRef.current) return
    if (e.touches.length < 2) {
      pinchRef.current.active = false
      setPinching(false)
    }
  }

  const handlePresetZoom = (preset) => {
    if (useNativePreview) {
      // Native optical/digital zoom is pinch-driven via the plugin.
      setZoom(preset)
      return
    }
    if (preset === 0.5 && !wideZoomAvailable) {
      setZoom(1)
      return
    }
    setZoom(preset)
  }

  const handleCapture = async () => {
    if (promotingLead) return
    try {
      if (useNativePreviewRef.current) {
        const dataUrl = await captureNativeStill({ quality: 92 })
        if (!dataUrl) return
        // System shutter + blackout already ran; light black flash is optional polish only.
        await addCapture(dataUrl, { withFlash: false })
        return
      }
      const dataUrl = await captureFromVideo()
      if (!dataUrl) return
      await addCapture(dataUrl, { withFlash: true, flashKind: 'white' })
    } catch (e) {
      photoLogError('capture.shutter', 'Shutter failed', e)
      showToast(e.message || 'Could not take photo', 'error')
    }
  }

  const handleFilePick = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length === 0) return

    for (const file of files) {
      await addCapture(file)
    }
    showToast(
      files.length === 1 ? '1 photo uploading' : `${files.length} photos uploading`,
      'success',
    )
    handleDone()
  }

  const handleDone = () => {
    photoLog('capture.done', 'Closing capture modal', { sessionCount: sessionItems.length })
    stopCamera()
    onClose?.()
  }

  const handleBackToChooser = () => {
    stopCamera()
    cameraFallbackNotifiedRef.current = false
    setMode('chooser')
  }

  const handleChooseUpload = () => {
    libraryInputRef.current?.click()
  }

  const handleChooseCamera = () => {
    setMode('camera')
    startCamera('environment')
  }

  const handleFlipCamera = async () => {
    const next = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(next)
    setZoomFactor(1)
    zoomFactorRef.current = 1
    if (useNativePreviewRef.current) {
      try {
        await flipNativeCamera()
        return
      } catch (err) {
        photoLogWarn('capture.camera', 'Native flip failed — restarting', {
          message: String(err?.message || err),
        })
      }
    }
    startCamera(next)
  }

  const handleToggleFlash = async () => {
    const next = !flashEnabled
    setFlashEnabled(next)
    if (useNativePreviewRef.current) {
      await setNativeFlashMode(next ? 'on' : 'off')
    }
  }

  const sessionPreviewItems = useMemo(
    () => sessionItems.map((item, i) => ({
      id: item.jobId,
      name: `Photo ${sessionItems.length - i}`,
      contentType: 'image/jpeg',
      loadBlob: async () => {
        const blobs = await getBlobs(item.jobId)
        return blobs?.full || blobs?.thumb
      },
    })),
    [sessionItems],
  )

  const openLibrary = () => libraryInputRef.current?.click()

  const handleGalleryPointerDown = () => {
    galleryLongPressRef.current = window.setTimeout(() => {
      galleryLongPressRef.current = null
      openLibrary()
    }, 500)
  }

  const handleGalleryPointerUp = () => {
    if (galleryLongPressRef.current) {
      window.clearTimeout(galleryLongPressRef.current)
      galleryLongPressRef.current = null
    }
  }

  const handleGalleryClick = () => {
    if (sessionItems.length > 0) setViewerIndex(0)
    else openLibrary()
  }
  const lastThumb = sessionItems[0]?.previewUrl ?? null

  if (!open || !entity || !entityRef) return null

  return createPortal(
    <>
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFilePick}
      />

      {mode === 'chooser' && (
        <div className="photo-add-popover-layer">
          <button
            type="button"
            className="photo-add-popover-backdrop"
            onClick={handleDone}
            aria-label="Close add photos menu"
          />
          <div className="photo-add-popover" role="dialog" aria-label="Add photos">
            <button
              type="button"
              className="photo-add-popover-option"
              onClick={handleChooseUpload}
              disabled={storageFull || promotingLead}
            >
              <ImageIcon className="photo-add-popover-icon" strokeWidth={1.75} />
              <span className="photo-add-popover-label">Upload</span>
            </button>
            <button
              type="button"
              className="photo-add-popover-option"
              onClick={handleChooseCamera}
              disabled={storageFull || promotingLead}
            >
              <Camera className="photo-add-popover-icon" strokeWidth={1.75} />
              <span className="photo-add-popover-label">Camera</span>
            </button>
          </div>
        </div>
      )}

      {mode === 'camera' && (
        <div
          className={cn(
            'photo-mode-overlay photo-mode-overlay--camera',
            useNativePreview && 'photo-mode-overlay--native-preview',
          )}
          role="dialog"
          aria-label="Photo mode"
        >
          <div
            className={cn(
              'photo-mode-viewport photo-mode-viewport--immersive',
              useCamera && cameraReady && !useNativePreview && 'photo-mode-viewport--pinchable',
            )}
            onTouchStart={handleViewportTouchStart}
            onTouchMove={handleViewportTouchMove}
            onTouchEnd={handleViewportTouchEnd}
            onTouchCancel={handleViewportTouchEnd}
          >
            {flash === 'white' && (
              <div className="photo-mode-flash photo-mode-flash--white absolute inset-0 z-20 pointer-events-none" />
            )}
            {flash === 'black' && (
              <div className="photo-mode-flash photo-mode-flash--black absolute inset-0 z-20 pointer-events-none" />
            )}
            {useCamera && !useNativePreview && (
              <div className="photo-mode-video-stage">
                <video
                  ref={videoRef}
                  className={cn(
                    'photo-mode-video photo-mode-video--immersive',
                    !cameraReady && 'photo-mode-video--hidden',
                    pinching && 'photo-mode-video--pinching',
                  )}
                  style={{
                    transform: facingMode === 'user'
                      ? `scale(${displayScale}) scaleX(-1)`
                      : `scale(${displayScale})`,
                  }}
                  playsInline
                  muted
                  autoPlay
                />
              </div>
            )}
            {cameraStarting && (
              <div className="photo-mode-camera-loading">
                <Loader2 className="h-8 w-8 animate-spin opacity-60" />
              </div>
            )}
            {!useCamera && !cameraStarting && (
              <div className="photo-mode-upload-zone">
                <ImageIcon className="h-10 w-10 opacity-40 mb-3" />
                <p className="text-sm opacity-70 mb-4">No camera — use Upload photos instead</p>
                <button type="button" className="photo-mode-btn" onClick={handleBackToChooser}>
                  Back to options
                </button>
              </div>
            )}

            <div className="photo-mode-top-bar">
              <button type="button" className="photo-mode-icon-btn" onClick={handleBackToChooser} aria-label="Back">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="photo-mode-top-bar-right">
                <button
                  type="button"
                  className="photo-mode-icon-btn"
                  onClick={handleFlipCamera}
                  disabled={!useCamera || cameraStarting}
                  aria-label="Flip camera"
                >
                  <RotateCw className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  className="photo-mode-icon-btn"
                  onClick={handleToggleFlash}
                  aria-label={flashEnabled ? 'Flash on' : 'Flash off'}
                >
                  {flashEnabled ? <Zap className="h-5 w-5" /> : <ZapOff className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {useCamera && cameraReady && !useNativePreview && (
              <div className="photo-mode-zoom-bar">
                {ZOOM_PRESETS.filter((level) => level !== 0.5 || wideZoomAvailable).map((level) => (
                  <button
                    key={level}
                    type="button"
                    className={cn('photo-mode-zoom-btn', activePreset === String(level) && 'photo-mode-zoom-btn--active')}
                    onClick={() => handlePresetZoom(level)}
                  >
                    {level === 0.5 ? '.5x' : `${level}x`}
                  </button>
                ))}
              </div>
            )}
            {useCamera && cameraReady && useNativePreview && (
              <div className="photo-mode-zoom-bar photo-mode-zoom-bar--hint" aria-hidden="true">
                <span className="photo-mode-zoom-hint">Pinch to zoom</span>
              </div>
            )}

            <div className="photo-mode-bottom-bar">
              <button
                type="button"
                className="photo-mode-gallery-btn"
                onClick={handleGalleryClick}
                onPointerDown={handleGalleryPointerDown}
                onPointerUp={handleGalleryPointerUp}
                onPointerLeave={handleGalleryPointerUp}
                disabled={storageFull || promotingLead}
                aria-label={sessionItems.length ? 'View captured photos (hold for library)' : 'Choose from library'}
              >
                {lastThumb ? (
                  <img src={lastThumb} alt="" className="photo-mode-gallery-thumb" />
                ) : (
                  <ImageIcon className="h-6 w-6" />
                )}
                {sessionItems.length > 1 && (
                  <span className="photo-mode-gallery-count">{sessionItems.length}</span>
                )}
              </button>

              {useCamera && cameraReady ? (
                <button
                  type="button"
                  className="photo-mode-shutter photo-mode-shutter--camera"
                  onClick={handleCapture}
                  disabled={storageFull || promotingLead}
                  aria-label="Take photo"
                >
                  <span className="photo-mode-shutter-inner" />
                </button>
              ) : (
                <button
                  type="button"
                  className="photo-mode-shutter photo-mode-shutter--camera photo-mode-shutter--disabled"
                  onClick={openLibrary}
                  disabled={storageFull}
                  aria-label="Choose from library"
                >
                  <ImageIcon className="h-7 w-7" />
                </button>
              )}

              <button
                type="button"
                className="photo-mode-done-btn"
                onClick={handleDone}
                disabled={promotingLead}
              >
                {promotingLead ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Done'}
              </button>
            </div>

            {activeUploadCount > 0 && (
              <div className="photo-mode-upload-badge" role="status">
                {activeUploadCount} uploading
              </div>
            )}
          </div>
        </div>
      )}

      <FilePreviewOverlay open={viewerIndex != null} onClose={() => setViewerIndex(null)} items={sessionPreviewItems} initialIndex={viewerIndex ?? 0} />
    </>,
    getModalPortalContainer(),
  )
}

/** Guard invalid entity ids before running capture hooks (shared/list-view leads). */
export function PhotoCaptureModal(props) {
  const { open, entity, entityType = 'lead' } = props
  if (!open || !entity) return null
  const isDraftLead = entityType === 'lead' && !entity.id
  const hasEntityId = !!entity.id
  if (!hasEntityId && !isDraftLead) return null
  return <PhotoCaptureModalInner {...props} />
}
