import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, ChevronLeft, RotateCw, Zap, ZapOff, Image as ImageIcon, Camera } from 'lucide-react'
import { sumPhotoBytes, LEAD_STORAGE_LIMIT_BYTES, DEAL_STORAGE_LIMIT_BYTES, getCurrentPosition } from '@/photos/photosClient'
import { usePhotoUpload } from './PhotoUploadProvider'
import { draftSessionId, entityKey } from './entityRef'
import { getBlobs } from './photoStoreIdb'
import { VISIBILITY } from '@/utils/access'
import { getTeamForMembership } from '@/utils/profile'
import { showToast } from '../components/ui/toast'
import { createLead, formatLeadAddress } from '@/utils/leads'
import { FilePreviewOverlay } from '../components/ui/FilePreviewOverlay'
import { cn } from '@/lib/utils'
import { getModalPortalContainer } from '@/utils/modalPortal'
import { logLeadPhotosAdded } from '@/utils/leadActivity'
import { photoLog, photoLogError, photoLogCameraEnvironment, photoLogWarn } from './photoDebug'

function canUseCamera() {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
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
  return name === 'NotAllowedError' || name === 'PermissionDeniedError'
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
  const attempts = [
    { video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
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

export function PhotoCaptureModal({
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
}) {
  const { enqueueCapture, reassignDraftJobs, jobs } = usePhotoUpload()
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

  const [mode, setMode] = useState('chooser')
  const [sessionItems, setSessionItems] = useState([])
  const [flash, setFlash] = useState(false)
  const [promotingLead, setPromotingLead] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [useCamera, setUseCamera] = useState(false)
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
  const wideZoomAvailable = trackZoomRange != null && trackZoomRange.min < 1

  const syncTrackZoom = useCallback((stream, factor, range) => {
    if (!stream || !range) return
    if (factor < 1) {
      void applyTrackZoom(stream, range.min)
    } else {
      void applyTrackZoom(stream, 1)
    }
  }, [])

  const setZoom = useCallback((next, range = trackZoomRange) => {
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

  const activeTeam = getTeamForMembership(teams, teamMembership) || teams?.[0] || null

  const resolvedEntity = savedLeadRef.current?.id ? savedLeadRef.current : entity
  const isLead = entityType === 'lead'
  const isDraft = isLead && !resolvedEntity?.id

  const entityRef = useMemo(() => {
    if (entityType === 'deal') {
      return { entityType: 'deal', pipelineId, dealId: resolvedEntity.id, entityId: resolvedEntity.id }
    }
    if (isDraft) {
      if (!draftIdRef.current) draftIdRef.current = draftSessionId()
      return { entityType: 'lead', leadId: draftIdRef.current, entityId: draftIdRef.current }
    }
    return { entityType: 'lead', leadId: resolvedEntity.id, entityId: resolvedEntity.id }
  }, [entityType, resolvedEntity?.id, pipelineId, isDraft])

  const limitBytes = entityType === 'deal' ? DEAL_STORAGE_LIMIT_BYTES : LEAD_STORAGE_LIMIT_BYTES
  const photosUsed = sumPhotoBytes(resolvedEntity?.photos || [])
  const storageFull = photosUsed >= limitBytes

  const activeUploadCount = useMemo(
    () => jobs.filter((j) => j.entityKey === entityKey(entityRef) && j.status !== 'done').length,
    [jobs, entityRef],
  )

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraReady(false)
    setCameraStarting(false)
    setUseCamera(false)
  }, [])

  const showLibraryFallback = useCallback((message) => {
    setUseCamera(false)
    setCameraStarting(false)
    if (!cameraFallbackNotifiedRef.current) {
      cameraFallbackNotifiedRef.current = true
      showToast(message, 'info')
    }
  }, [])

  const startCamera = useCallback(async (facing = facingMode) => {
    if (!canUseCamera()) {
      showLibraryFallback('Camera not supported here — use Upload photos instead')
      return
    }
    stopCamera()
    setUseCamera(true)
    setCameraStarting(true)
    photoLog('capture.camera', 'Requesting camera stream', { facing })

    const hasCamera = await hasVideoInputDevice()
    if (!hasCamera) {
      photoLogWarn('capture.camera', 'No video input devices detected')
      showLibraryFallback('No camera on this device — use Upload photos instead')
      return
    }

    try {
      const stream = await requestCameraStream(facing)
      streamRef.current = stream
      const range = getTrackZoomRange(stream)
      setTrackZoomRange(range)
      zoomFactorRef.current = 1
      setZoomFactor(1)
      if (videoRef.current) await bindStreamToVideo(videoRef.current, stream)
      if (range) void applyTrackZoom(stream, 1)
      setCameraReady(true)
      setCameraStarting(false)
      photoLog('capture.camera', 'Camera ready', { trackZoom: range })
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
  }, [facingMode, showLibraryFallback, stopCamera])

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
    })
    photoLogCameraEnvironment()

    if (!window.isSecureContext) {
      photoLogWarn('capture.camera', 'Insecure context — camera blocked on mobile LAN. Use: npm run dev:mobile')
    }

    return () => {
      stopCamera()
    }
  }, [open, entityType, entity?.id, isLead, stopCamera])

  const triggerFlash = () => {
    setFlash(true)
    window.setTimeout(() => setFlash(false), 300)
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
    const parcel = source.parcelId
    if (parcel && existingLeads.some((l) => l.parcelId === parcel)) {
      throw new Error('A lead already exists for this parcel')
    }

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

  const addCapture = useCallback(async (source, { withFlash = false } = {}) => {
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
      if (withFlash) triggerFlash()
      if (leadId) {
        onPhotosAdded?.()
        void logLeadPhotosAdded(getToken, leadId, 1).catch(() => {})
      }
    } catch (e) {
      photoLogError('capture.add', 'Capture failed', e)
      showToast(e.message || 'Could not add photo', 'error')
    }
  }, [storageFull, resolveCaptureRef, buildMetadata, enqueueCapture, onPhotosAdded, getToken])

  const captureFromVideo = useCallback(() => {
    const video = videoRef.current
    if (!video?.videoWidth) return null
    const scale = displayScaleForZoom(zoomFactorRef.current)
    const vw = video.videoWidth
    const vh = video.videoHeight
    let sx = 0
    let sy = 0
    let sw = vw
    let sh = vh
    if (scale > 1) {
      sw = vw / scale
      sh = vh / scale
      sx = (vw - sw) / 2
      sy = (vh - sh) / 2
    }
    const canvas = document.createElement('canvas')
    canvas.width = sw
    canvas.height = sh
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh)
    return canvas.toDataURL('image/jpeg', 0.92)
  }, [])

  const handleViewportTouchStart = (e) => {
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
    if (!pinchRef.current.active || e.touches.length !== 2) return
    e.preventDefault()
    const dist = touchDistance(e.touches[0], e.touches[1])
    if (!pinchRef.current.startDist) return
    const ratio = dist / pinchRef.current.startDist
    setZoom(pinchRef.current.startZoom * ratio)
  }

  const handleViewportTouchEnd = (e) => {
    if (e.touches.length < 2) {
      pinchRef.current.active = false
      setPinching(false)
    }
  }

  const handlePresetZoom = (preset) => {
    if (preset === 0.5 && !wideZoomAvailable) {
      setZoom(1)
      return
    }
    setZoom(preset)
  }

  const handleCapture = async () => {
    if (promotingLead) return
    const dataUrl = captureFromVideo()
    if (!dataUrl) return
    await addCapture(dataUrl, { withFlash: true })
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

  const handleFlipCamera = () => {
    const next = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(next)
    setZoomFactor(1)
    zoomFactorRef.current = 1
    startCamera(next)
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

  if (!open || !entity) return null

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
        <div className="photo-mode-overlay photo-mode-overlay--camera" role="dialog" aria-label="Photo mode">
          <div
            className={cn(
              'photo-mode-viewport photo-mode-viewport--immersive',
              useCamera && cameraReady && 'photo-mode-viewport--pinchable',
            )}
            onTouchStart={handleViewportTouchStart}
            onTouchMove={handleViewportTouchMove}
            onTouchEnd={handleViewportTouchEnd}
            onTouchCancel={handleViewportTouchEnd}
          >
            {flash && <div className="photo-mode-flash absolute inset-0 z-20 bg-white/80 pointer-events-none animate-pulse" />}
            {useCamera && (
              <div className="photo-mode-video-stage">
                <video
                  ref={videoRef}
                  className={cn(
                    'photo-mode-video photo-mode-video--immersive',
                    !cameraReady && 'photo-mode-video--hidden',
                    pinching && 'photo-mode-video--pinching',
                  )}
                  style={{ transform: `scale(${displayScale})` }}
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
                  onClick={() => setFlashEnabled((v) => !v)}
                  aria-label={flashEnabled ? 'Flash on' : 'Flash off'}
                >
                  {flashEnabled ? <Zap className="h-5 w-5" /> : <ZapOff className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {useCamera && cameraReady && (
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
