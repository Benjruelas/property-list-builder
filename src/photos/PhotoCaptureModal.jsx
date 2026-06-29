import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Camera, Upload, Loader2, Check } from 'lucide-react'
import { PanelBackButton } from '../components/ui/panel-header'
import { Button } from '../components/ui/button'
import { AddressAutocompleteField } from '../components/AddressAutocompleteField'
import { ResourceSharePicker } from '../components/ResourceSharePicker'
import { displayLeadName, formatLeadAddress, createLead } from '@/utils/leads'
import { sumPhotoBytes, LEAD_STORAGE_LIMIT_BYTES, DEAL_STORAGE_LIMIT_BYTES, getCurrentPosition } from '@/photos/photosClient'
import { usePhotoUpload } from './PhotoUploadProvider'
import { draftSessionId, entityKey } from './entityRef'
import { getBlobs } from './photoStoreIdb'
import { VISIBILITY } from '@/utils/access'
import { getTeamForMembership } from '@/utils/profile'
import { showToast } from '../components/ui/toast'
import { formatPhoneAsYouType, formatPhoneDisplay } from '@/utils/phoneFormat'
import { StorageUsageBar } from '../components/ui/StorageUsageBar'
import { FilePreviewOverlay } from '../components/ui/FilePreviewOverlay'
import { cn } from '@/lib/utils'
import { getModalPortalContainer } from '@/utils/modalPortal'
import { logLeadPhotosAdded } from '@/utils/leadActivity'

function canUseCamera() {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

async function requestCameraStream() {
  const attempts = [
    { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
    { video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
    { video: true, audio: false },
  ]
  let lastErr
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr || new Error('Camera unavailable')
}

async function bindStreamToVideo(video, stream) {
  video.srcObject = stream
  await video.play()
}

function normalizeDraftForm(data = {}) {
  return {
    firstName: data.firstName ?? '',
    lastName: data.lastName ?? '',
    address: data.address ?? '',
    phone: formatPhoneDisplay(data.phone ?? '') || '',
    email: data.email ?? '',
    notes: data.notes ?? '',
    parcelId: data.parcelId ?? null,
    lat: data.lat ?? null,
    lng: data.lng ?? null,
    properties: data.properties ?? null,
  }
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
  const fileInputRef = useRef(null)
  const libraryInputRef = useRef(null)
  const draftIdRef = useRef(null)

  const [sessionItems, setSessionItems] = useState([])
  const [flash, setFlash] = useState(false)
  const [savingLead, setSavingLead] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [useCamera, setUseCamera] = useState(false)
  const [cameraStarting, setCameraStarting] = useState(false)
  const [viewerIndex, setViewerIndex] = useState(null)
  const [phase, setPhase] = useState('capture')
  const [draftForm, setDraftForm] = useState(() => normalizeDraftForm(entity))
  const [shareState, setShareState] = useState({ visibility: VISIBILITY.PRIVATE, sharedMemberUids: [] })

  const isLead = entityType === 'lead'
  const isDraft = isLead && !entity?.id
  const activeTeam = getTeamForMembership(teams, teamMembership) || teams?.[0] || null
  const allowExternalSharing = teamMembership?.allowExternalSharing === true

  const entityRef = useMemo(() => {
    if (entityType === 'deal') {
      return { entityType: 'deal', pipelineId, dealId: entity.id, entityId: entity.id }
    }
    if (isDraft) {
      if (!draftIdRef.current) draftIdRef.current = draftSessionId()
      return { entityType: 'lead', leadId: draftIdRef.current, entityId: draftIdRef.current }
    }
    return { entityType: 'lead', leadId: entity.id, entityId: entity.id }
  }, [entityType, entity?.id, pipelineId, isDraft])

  const limitBytes = entityType === 'deal' ? DEAL_STORAGE_LIMIT_BYTES : LEAD_STORAGE_LIMIT_BYTES
  const photosUsed = sumPhotoBytes(entity?.photos || [])
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
  }, [])

  useEffect(() => {
    if (!open) {
      stopCamera()
      setSessionItems([])
      setPhase('capture')
      draftIdRef.current = null
      return undefined
    }
    setDraftForm(normalizeDraftForm(entity))
    setPhase('capture')

    if (!canUseCamera()) {
      setUseCamera(false)
      return undefined
    }

    setUseCamera(true)
    setCameraStarting(true)
    let cancelled = false
    requestCameraStream()
      .then(async (stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) await bindStreamToVideo(videoRef.current, stream)
        setCameraReady(true)
        setCameraStarting(false)
      })
      .catch(() => {
        setUseCamera(false)
        setCameraStarting(false)
      })

    return () => {
      cancelled = true
      stopCamera()
    }
  }, [open, entity, stopCamera])

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
      lat: pos?.lat ?? entity?.lat ?? null,
      lng: pos?.lng ?? entity?.lng ?? null,
      addressLabel: addressLabel || formatLeadAddress(entity) || entity?.address || '',
      parcelId: parcelId || entity?.parcelId || null,
    }
  }, [currentUser, entity, parcelId, addressLabel])

  const addCapture = useCallback(async (source) => {
    if (storageFull) return
    try {
      const metadata = await buildMetadata()
      const job = await enqueueCapture(source, entityRef, metadata, entity?.photos || [])
      const blobs = await getBlobs(job.jobId)
      const previewUrl = blobs?.thumb ? URL.createObjectURL(blobs.thumb) : null
      setSessionItems((prev) => [{ jobId: job.jobId, previewUrl, createdAt: Date.now() }, ...prev])
      triggerFlash()
      if (!isDraft && entity?.id) onPhotosAdded?.()
    } catch (e) {
      showToast(e.message || 'Could not add photo', 'error')
    }
  }, [storageFull, buildMetadata, enqueueCapture, entityRef, entity, isDraft, onPhotosAdded])

  const captureFromVideo = useCallback(() => {
    const video = videoRef.current
    if (!video?.videoWidth) return null
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.92)
  }, [])

  const handleCapture = async () => {
    const dataUrl = captureFromVideo()
    if (!dataUrl) return
    await addCapture(dataUrl)
  }

  const handleFilePick = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    for (const file of files) {
      await addCapture(file)
    }
  }

  const handleDone = () => {
    if (isDraft && sessionItems.length > 0) {
      stopCamera()
      setPhase('save')
      return
    }
    onClose?.()
  }

  const handleBack = () => {
    if (phase === 'save') {
      setPhase('capture')
      return
    }
    onClose?.()
  }

  const handleSaveDraftLead = async () => {
    let firstName = (draftForm.firstName ?? '').trim()
    let lastName = (draftForm.lastName ?? '').trim()
    if (!firstName && !lastName) lastName = 'Property'
    if (draftForm.parcelId && existingLeads.some((l) => l.parcelId === draftForm.parcelId)) {
      showToast('A lead already exists for this parcel', 'warning')
      return
    }

    setSavingLead(true)
    try {
      const created = await createLead(getToken, {
        firstName,
        lastName,
        address: (draftForm.address ?? '').trim(),
        phone: (draftForm.phone ?? '').trim() || null,
        email: (draftForm.email ?? '').trim() || null,
        notes: (draftForm.notes ?? '').trim(),
        parcelId: draftForm.parcelId,
        lat: draftForm.lat,
        lng: draftForm.lng,
        properties: draftForm.properties,
        visibility: shareState.visibility,
        sharedMemberUids: shareState.sharedMemberUids,
        teamId: activeTeam?.id || null,
        teamShares: shareState.visibility === VISIBILITY.TEAM && activeTeam ? [activeTeam.id] : [],
      })
      const newRef = { entityType: 'lead', leadId: created.id, entityId: created.id }
      if (draftIdRef.current) {
        await reassignDraftJobs(draftIdRef.current, newRef)
      }
      if (sessionItems.length) {
        await logLeadPhotosAdded(getToken, created.id, sessionItems.length)
      }
      onLeadCreated?.(created)
      onEntityUpdate?.(created)
      onClose?.()
    } catch (err) {
      showToast(err.message || 'Could not save lead', 'error')
    } finally {
      setSavingLead(false)
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

  if (!open || !entity) return null

  const headerTitle = isDraft
    ? (phase === 'save' ? 'Save lead' : (formatLeadAddress(entity) || entity.address || 'New lead'))
    : (isLead ? displayLeadName(entity) : (entity.name || entity.address || 'Deal'))

  if (phase === 'save' && isDraft) {
    return createPortal(
      <>
        <div className="photo-mode-overlay map-panel list-panel photos-panel fullscreen-panel flex flex-col min-h-0" role="dialog">
          <div className="photo-mode-header flex-shrink-0">
            <PanelBackButton onClick={handleBack} title="Back to photos" />
            <div className="min-w-0 flex-1 px-2">
              <div className="text-sm font-semibold truncate">{headerTitle}</div>
              <div className="text-xs opacity-50 truncate">{sessionItems.length} photos</div>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-5 py-4 space-y-4">
            <div className="photo-mode-save-grid">
              {sessionItems.map((item, i) => (
                <button key={item.jobId} type="button" className="photo-mode-save-thumb-btn" onClick={() => setViewerIndex(i)}>
                  {item.previewUrl && <img src={item.previewUrl} alt="" className="photo-mode-save-thumb" />}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs opacity-60 mb-1 block">First Name</label>
                <input type="text" value={draftForm.firstName ?? ''} onChange={(e) => setDraftForm((f) => ({ ...f, firstName: e.target.value }))} className="w-full text-sm rounded-lg px-3 py-2 bg-white/5 border border-white/15" />
              </div>
              <div>
                <label className="text-xs opacity-60 mb-1 block">Last Name</label>
                <input type="text" value={draftForm.lastName ?? ''} onChange={(e) => setDraftForm((f) => ({ ...f, lastName: e.target.value }))} className="w-full text-sm rounded-lg px-3 py-2 bg-white/5 border border-white/15" />
              </div>
            </div>
            <div>
              <label className="text-xs opacity-60 mb-1 block">Property Address</label>
              <AddressAutocompleteField
                value={draftForm.address ?? ''}
                onChange={(v) => setDraftForm((f) => ({ ...f, address: v }))}
                onSelectResult={({ address, latParsed, lngParsed }) => {
                  setDraftForm((f) => ({
                    ...f,
                    address: address ?? f.address,
                    lat: latParsed ?? f.lat,
                    lng: lngParsed ?? f.lng,
                  }))
                }}
              />
            </div>
            <ResourceSharePicker
              team={activeTeam}
              visibility={shareState.visibility}
              sharedMemberUids={shareState.sharedMemberUids}
              onChange={setShareState}
              disabled={savingLead}
              allowExternalSharing={allowExternalSharing}
              defaultExpanded
            />
          </div>
          <div className="photo-mode-save-footer flex justify-end gap-2 px-5 py-4 border-t border-white/20">
            <Button type="button" variant="ghost" onClick={handleBack} disabled={savingLead}>Back</Button>
            <Button type="button" onClick={handleSaveDraftLead} disabled={savingLead}>
              {savingLead ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save lead'}
            </Button>
          </div>
        </div>
        <FilePreviewOverlay open={viewerIndex != null} onClose={() => setViewerIndex(null)} items={sessionPreviewItems} initialIndex={viewerIndex ?? 0} />
      </>,
      getModalPortalContainer(),
    )
  }

  return createPortal(
    <>
      <div className="photo-mode-overlay map-panel list-panel photos-panel fullscreen-panel flex flex-col min-h-0" role="dialog">
        <div className="photo-mode-header">
          <PanelBackButton onClick={handleBack} title="Exit photo mode" />
          <div className="min-w-0 flex-1 px-2">
            <div className="text-sm font-semibold truncate">{headerTitle}</div>
            {activeUploadCount > 0 && (
              <div className="text-xs opacity-50">{activeUploadCount} uploading</div>
            )}
          </div>
          <Button type="button" className="photo-overlay-header-btn photo-mode-btn photo-mode-btn--primary shrink-0" onClick={handleDone}>
            <Check className="h-4 w-4 mr-1" />
            {isDraft && sessionItems.length > 0 ? 'Next' : 'Done'}
          </Button>
        </div>

        <div className="photo-mode-viewport relative">
          {flash && <div className="photo-mode-flash absolute inset-0 z-10 bg-white/80 pointer-events-none animate-pulse" />}
          {useCamera && (
            <video ref={videoRef} className={cn('photo-mode-video', !cameraReady && 'photo-mode-video--hidden')} playsInline muted autoPlay />
          )}
          {cameraStarting && (
            <div className="photo-mode-camera-loading">
              <Loader2 className="h-8 w-8 animate-spin opacity-60" />
            </div>
          )}
          {!useCamera && !cameraStarting && (
            <div className="photo-mode-upload-zone">
              <Upload className="h-10 w-10 opacity-40 mb-3" />
              <p className="text-sm opacity-70 mb-4">Camera unavailable — choose from library</p>
            </div>
          )}
        </div>

        <div className="photo-mode-footer">
          <StorageUsageBar usedBytes={photosUsed} limitBytes={limitBytes} className="w-full" label="Photo storage" />
          {sessionItems.length > 0 && (
            <div className="photo-mode-thumbs">
              {sessionItems.map((item, i) => (
                <button key={item.jobId} type="button" className="photo-mode-thumb-btn" onClick={() => setViewerIndex(i)}>
                  {item.previewUrl && <img src={item.previewUrl} alt="" className="photo-mode-thumb" />}
                  <span className="photo-mode-thumb-number">{sessionItems.length - i}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-center gap-4 py-2">
            <input ref={libraryInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFilePick} />
            <Button type="button" variant="outline" className="photo-mode-btn" onClick={() => libraryInputRef.current?.click()} disabled={storageFull}>
              Choose from library
            </Button>
            {useCamera && cameraReady && (
              <button type="button" className="photo-mode-shutter" onClick={handleCapture} disabled={storageFull} aria-label="Take photo">
                <Camera className="h-7 w-7" />
              </button>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handleFilePick} />
        </div>
      </div>
      <FilePreviewOverlay open={viewerIndex != null} onClose={() => setViewerIndex(null)} items={sessionPreviewItems} initialIndex={viewerIndex ?? 0} />
    </>,
    getModalPortalContainer(),
  )
}
