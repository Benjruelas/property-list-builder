import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Camera, Upload, Loader2, Check } from 'lucide-react'
import { PanelBackButton } from '../ui/panel-header'
import { Button } from '../ui/button'
import { AddressAutocompleteField } from '../AddressAutocompleteField'
import { ResourceSharePicker } from '../ResourceSharePicker'
import { displayLeadName, formatLeadAddress, createLead } from '@/utils/leads'
import { uploadLeadPhoto, getCurrentPosition, sumLeadPhotoBytes, LEAD_STORAGE_LIMIT_BYTES } from '@/utils/leadPhotos'
import { estimateDataUrlBytes } from '@/utils/uploadLimits'
import { logLeadPhotosAdded } from '@/utils/leadActivity'
import { VISIBILITY } from '@/utils/access'
import { getTeamForMembership } from '@/utils/profile'
import { showToast } from '../ui/toast'
import { formatPhoneAsYouType, formatPhoneDisplay } from '@/utils/phoneFormat'
import { StorageUsageBar } from '../ui/StorageUsageBar'
import { FilePreviewOverlay } from '../ui/FilePreviewOverlay'
import { cn } from '@/lib/utils'
import { getModalPortalContainer } from '@/utils/modalPortal'

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

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
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

export function PhotoMode({
  open,
  lead,
  parcelId = null,
  addressLabel = '',
  getToken,
  currentUser,
  onClose,
  onPhotosUploaded,
  onLeadCreated,
  teams = [],
  teamMembership = null,
  existingLeads = [],
}) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const fileInputRef = useRef(null)
  const [sessionThumbs, setSessionThumbs] = useState([])
  const [uploading, setUploading] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [useCamera, setUseCamera] = useState(false)
  const [cameraStarting, setCameraStarting] = useState(false)
  const [viewerIndex, setViewerIndex] = useState(null)
  const [currentPhotos, setCurrentPhotos] = useState(() => (Array.isArray(lead?.photos) ? lead.photos : []))
  const [phase, setPhase] = useState('capture')
  const [draftForm, setDraftForm] = useState(() => normalizeDraftForm(lead))
  const [shareState, setShareState] = useState({ visibility: VISIBILITY.PRIVATE, sharedMemberUids: [] })

  const isDraft = !lead?.id
  const activeTeam = getTeamForMembership(teams, teamMembership) || teams?.[0] || null
  const allowExternalSharing = teamMembership?.allowExternalSharing === true

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCameraReady(false)
    setCameraStarting(false)
  }, [])

  useEffect(() => {
    if (open) {
      setCurrentPhotos(Array.isArray(lead?.photos) ? lead.photos : [])
      setPhase('capture')
      setDraftForm(normalizeDraftForm(lead))
      setShareState({ visibility: VISIBILITY.PRIVATE, sharedMemberUids: [] })
    }
  }, [open, lead])

  useEffect(() => {
    if (!open) {
      stopCamera()
      setSessionThumbs((prev) => {
        prev.forEach((src) => {
          if (src?.startsWith('blob:')) URL.revokeObjectURL(src)
        })
        return []
      })
      setViewerIndex(null)
      setUseCamera(false)
      setPhase('capture')
      return undefined
    }

    if (phase !== 'capture' || !canUseCamera()) {
      if (phase !== 'capture') stopCamera()
      if (!canUseCamera()) setUseCamera(false)
      return undefined
    }

    let cancelled = false
    setCameraStarting(true)
    setUseCamera(true)

    ;(async () => {
      try {
        const stream = await requestCameraStream()
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          await bindStreamToVideo(video, stream)
          if (!cancelled) setCameraReady(true)
        }
      } catch {
        if (!cancelled) {
          setUseCamera(false)
          setCameraReady(false)
        }
      } finally {
        if (!cancelled) setCameraStarting(false)
      }
    })()

    return () => {
      cancelled = true
      stopCamera()
    }
  }, [open, phase, stopCamera])

  useEffect(() => {
    if (!open || phase !== 'capture' || !useCamera || cameraReady || !streamRef.current || !videoRef.current) return undefined
    let cancelled = false
    ;(async () => {
      try {
        await bindStreamToVideo(videoRef.current, streamRef.current)
        if (!cancelled) setCameraReady(true)
      } catch {
        if (!cancelled) setUseCamera(false)
      } finally {
        if (!cancelled) setCameraStarting(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, phase, useCamera, cameraReady])

  const captureFromVideo = useCallback(() => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return null
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.92)
  }, [])

  const uploadOne = useCallback(async (dataUrl, existingPhotos, leadId) => {
    const pos = await getCurrentPosition()
    const name = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User'
    return uploadLeadPhoto(getToken, {
      leadId,
      dataUrl,
      existingPhotos,
      metadata: {
        capturedByName: name,
        lat: pos?.lat ?? lead.lat ?? null,
        lng: pos?.lng ?? lead.lng ?? null,
        addressLabel: addressLabel || formatLeadAddress(lead) || lead.address || '',
        parcelId: parcelId || lead.parcelId || null,
      },
    })
  }, [getToken, lead, parcelId, addressLabel, currentUser])

  const pendingSessionBytes = useMemo(
    () => sessionThumbs.reduce((sum, src) => {
      if (src.startsWith('blob:')) return sum
      return sum + estimateDataUrlBytes(src)
    }, 0),
    [sessionThumbs],
  )

  const photosUsed = sumLeadPhotoBytes(currentPhotos) + pendingSessionBytes
  const photosStorageFull = photosUsed >= LEAD_STORAGE_LIMIT_BYTES

  const sessionPreviewItems = useMemo(
    () => sessionThumbs.map((src, i) => ({
      id: `session-${i}`,
      name: `Photo ${i + 1}`,
      contentType: 'image/jpeg',
      loadBlob: async () => {
        if (src.startsWith('blob:')) {
          const res = await fetch(src)
          return res.blob()
        }
        return src
      },
    })),
    [sessionThumbs],
  )

  const addSessionDataUrl = useCallback((dataUrl) => {
    const nextPending = pendingSessionBytes + estimateDataUrlBytes(dataUrl)
    if (sumLeadPhotoBytes(currentPhotos) + nextPending > LEAD_STORAGE_LIMIT_BYTES) {
      showToast('Lead photo storage limit reached', 'error')
      return false
    }
    setSessionThumbs((prev) => [...prev, dataUrl])
    return true
  }, [currentPhotos, pendingSessionBytes])

  const handleCapture = async () => {
    const dataUrl = captureFromVideo()
    if (!dataUrl) return
    addSessionDataUrl(dataUrl)
  }

  const handleFilePick = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return

    if (isDraft) {
      setUploading(true)
      try {
        for (const file of files) {
          const dataUrl = await fileToDataUrl(file)
          if (!addSessionDataUrl(dataUrl)) break
        }
      } catch (err) {
        showToast(err.message || 'Could not read photo', 'error')
      } finally {
        setUploading(false)
      }
      return
    }

    setUploading(true)
    try {
      let lastLead = lead
      let runningPhotos = currentPhotos
      for (const file of files) {
        const pos = await getCurrentPosition()
        const name = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User'
        const result = await uploadLeadPhoto(getToken, {
          leadId: lead.id,
          file,
          existingPhotos: runningPhotos,
          metadata: {
            capturedByName: name,
            lat: pos?.lat ?? lead.lat ?? null,
            lng: pos?.lng ?? lead.lng ?? null,
            addressLabel: addressLabel || formatLeadAddress(lead) || lead.address || '',
            parcelId: parcelId || lead.parcelId || null,
          },
        })
        lastLead = result.lead
        runningPhotos = result.lead?.photos || runningPhotos
        setSessionThumbs((prev) => [...prev, URL.createObjectURL(file)])
      }
      setCurrentPhotos(runningPhotos)
      await logLeadPhotosAdded(getToken, lead.id, files.length)
      onPhotosUploaded?.(lastLead)
      showToast(files.length === 1 ? 'Photo uploaded' : `${files.length} photos uploaded`, 'success')
    } catch (err) {
      showToast(err.message || 'Upload failed', 'error')
    } finally {
      setUploading(false)
    }
  }

  const uploadSessionPhotos = useCallback(async (leadId, basePhotos = []) => {
    let lastLead = { ...lead, id: leadId, photos: basePhotos }
    let runningPhotos = basePhotos
    let count = 0
    for (const dataUrl of sessionThumbs) {
      if (dataUrl.startsWith('blob:')) continue
      const result = await uploadOne(dataUrl, runningPhotos, leadId)
      lastLead = result.lead
      runningPhotos = result.lead?.photos || runningPhotos
      count += 1
    }
    if (count > 0) {
      await logLeadPhotosAdded(getToken, leadId, count)
    }
    return { lead: lastLead, count }
  }, [sessionThumbs, uploadOne, getToken, lead])

  const handleSaveDraftLead = async () => {
    let firstName = (draftForm.firstName ?? '').trim()
    let lastName = (draftForm.lastName ?? '').trim()
    const address = (draftForm.address ?? '').trim()
    if (!address) {
      showToast('Property address is required', 'error')
      return
    }
    if (!firstName && !lastName) lastName = 'Property'
    if (draftForm.parcelId && existingLeads.some((l) => l.parcelId === draftForm.parcelId)) {
      showToast('A lead already exists for this parcel', 'warning')
      return
    }

    setUploading(true)
    try {
      const payload = {
        firstName,
        lastName,
        address,
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
      }
      const created = await createLead(getToken, payload)
      const { lead: withPhotos, count } = await uploadSessionPhotos(created.id, created.photos || [])
      onLeadCreated?.(withPhotos)
      onPhotosUploaded?.(withPhotos)
      showToast(count > 0 ? 'Lead saved with photos' : 'Lead saved', 'success')
      onClose?.()
    } catch (err) {
      showToast(err.message || 'Could not save lead', 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleDone = async () => {
    if (isDraft) {
      if (sessionThumbs.length === 0) {
        onClose?.()
        return
      }
      stopCamera()
      setPhase('save')
      return
    }

    if (sessionThumbs.length === 0) {
      onClose?.()
      return
    }
    setUploading(true)
    try {
      let lastLead = lead
      let runningPhotos = currentPhotos
      let count = 0
      for (const dataUrl of sessionThumbs) {
        if (dataUrl.startsWith('blob:')) continue
        const result = await uploadOne(dataUrl, runningPhotos, lead.id)
        lastLead = result.lead
        runningPhotos = result.lead?.photos || runningPhotos
        count += 1
      }
      setCurrentPhotos(runningPhotos)
      if (count > 0) {
        await logLeadPhotosAdded(getToken, lead.id, count)
        onPhotosUploaded?.(lastLead)
        showToast(count === 1 ? 'Photo uploaded' : `${count} photos uploaded`, 'success')
      }
      onClose?.()
    } catch (err) {
      showToast(err.message || 'Upload failed', 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleBack = () => {
    if (phase === 'save') {
      setPhase('capture')
      return
    }
    onClose?.()
  }

  const setDraftField = (key, val) => {
    setDraftForm((f) => ({ ...f, [key]: val ?? '' }))
  }

  if (!open || !lead) return null

  const headerTitle = isDraft
    ? (phase === 'save' ? 'Save lead' : (formatLeadAddress(lead) || lead.address || 'New lead'))
    : displayLeadName(lead)

  const headerSubtitle = isDraft
    ? (phase === 'save' ? `${sessionThumbs.length} photo${sessionThumbs.length === 1 ? '' : 's'}` : 'Take photos, then save the lead')
    : (formatLeadAddress(lead) || lead.address)

  if (phase === 'save' && isDraft) {
    return createPortal(
      <>
        <div
          className="photo-mode-overlay map-panel list-panel photos-panel fullscreen-panel flex flex-col min-h-0"
          role="dialog"
          aria-label="Save lead with photos"
        >
          <div className="photo-mode-header flex-shrink-0">
            <PanelBackButton onClick={handleBack} title="Back to photos" />
            <div className="min-w-0 flex-1 px-2">
              <div className="text-sm font-semibold truncate">{headerTitle}</div>
              <div className="text-xs opacity-50 truncate">{headerSubtitle}</div>
            </div>
          </div>

          <div
            className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-5 py-4 space-y-4"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <section>
              <p className="text-xs opacity-60 mb-2">Photos</p>
              <div className="photo-mode-save-grid">
                {sessionThumbs.map((src, i) => (
                  <button
                    key={i}
                    type="button"
                    className="photo-mode-save-thumb-btn"
                    onClick={() => setViewerIndex(i)}
                    aria-label={`View photo ${i + 1}`}
                  >
                    <img src={src} alt="" className="photo-mode-save-thumb" />
                  </button>
                ))}
              </div>
            </section>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs opacity-60 mb-1 block">First Name</label>
                <input
                  type="text"
                  value={draftForm.firstName ?? ''}
                  onChange={(e) => setDraftField('firstName', e.target.value)}
                  className="w-full text-sm rounded-lg px-3 py-2 bg-white/5 border border-white/15"
                  autoComplete="given-name"
                />
              </div>
              <div>
                <label className="text-xs opacity-60 mb-1 block">Last Name</label>
                <input
                  type="text"
                  value={draftForm.lastName ?? ''}
                  onChange={(e) => setDraftField('lastName', e.target.value)}
                  className="w-full text-sm rounded-lg px-3 py-2 bg-white/5 border border-white/15"
                  autoComplete="family-name"
                />
              </div>
            </div>

            <div>
              <label className="text-xs opacity-60 mb-1 block">Property Address</label>
              <AddressAutocompleteField
                value={draftForm.address ?? ''}
                onChange={(v) => setDraftField('address', v)}
                onSelectResult={({ address, latParsed, lngParsed }) => {
                  setDraftField('address', address ?? '')
                  if (latParsed != null && lngParsed != null) {
                    setDraftForm((f) => ({ ...f, lat: latParsed, lng: lngParsed }))
                  }
                }}
              />
              {draftForm.parcelId && (
                <p className="text-[11px] text-emerald-400/80 mt-1">Linked to parcel on map</p>
              )}
            </div>

            <div>
              <label className="text-xs opacity-60 mb-1 block">Phone</label>
              <input
                type="tel"
                value={draftForm.phone ?? ''}
                onChange={(e) => setDraftField('phone', formatPhoneAsYouType(e.target.value))}
                className="w-full text-sm rounded-lg px-3 py-2 bg-white/5 border border-white/15"
              />
            </div>

            <div>
              <label className="text-xs opacity-60 mb-1 block">Email</label>
              <input
                type="email"
                value={draftForm.email ?? ''}
                onChange={(e) => setDraftField('email', e.target.value)}
                className="w-full text-sm rounded-lg px-3 py-2 bg-white/5 border border-white/15"
              />
            </div>

            <ResourceSharePicker
              team={activeTeam}
              visibility={shareState.visibility}
              sharedMemberUids={shareState.sharedMemberUids}
              onChange={setShareState}
              disabled={uploading}
              allowExternalSharing={allowExternalSharing}
              defaultExpanded
            />
          </div>

          <div
            className="flex justify-end gap-2 px-5 py-4 border-t border-white/20 flex-shrink-0"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <Button type="button" variant="ghost" onClick={handleBack} disabled={uploading}>
              Back
            </Button>
            <Button type="button" onClick={handleSaveDraftLead} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save lead'}
            </Button>
          </div>
        </div>

        <FilePreviewOverlay
          open={viewerIndex != null}
          onClose={() => setViewerIndex(null)}
          items={sessionPreviewItems}
          initialIndex={viewerIndex ?? 0}
        />
      </>,
      getModalPortalContainer(),
    )
  }

  const showUploadFallback = !useCamera || (!cameraReady && !cameraStarting)

  return (
    <>
    {createPortal(
    <div
      className="photo-mode-overlay map-panel list-panel photos-panel fullscreen-panel"
      role="dialog"
      aria-label="Photo mode"
    >
      <div className="photo-mode-header">
        <PanelBackButton onClick={handleBack} title="Exit photo mode" />
        <div className="min-w-0 flex-1 px-2">
          <div className="text-sm font-semibold truncate">{headerTitle}</div>
          <div className="text-xs opacity-50 truncate">{headerSubtitle}</div>
        </div>
        <Button
          type="button"
          size="sm"
          className="photo-mode-btn photo-mode-btn--primary shrink-0 min-h-[36px]"
          onClick={handleDone}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
          {isDraft && sessionThumbs.length > 0 ? 'Next' : 'Done'}
        </Button>
      </div>

      <div className="photo-mode-viewport">
        {useCamera && (
          <video
            ref={videoRef}
            className={cn('photo-mode-video', !cameraReady && 'photo-mode-video--hidden')}
            playsInline
            muted
            autoPlay
          />
        )}
        {cameraStarting && (
          <div className="photo-mode-camera-loading">
            <Loader2 className="h-8 w-8 animate-spin opacity-60" />
            <p className="text-sm opacity-60 mt-2">Starting camera…</p>
          </div>
        )}
        {showUploadFallback && !cameraStarting && (
          <div className="photo-mode-upload-zone">
            <Upload className="h-10 w-10 opacity-40 mb-3" />
            <p className="text-sm opacity-70 mb-4">Upload photos from your device</p>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handleFilePick} />
            <Button
              type="button"
              className="photo-mode-btn min-h-[44px]"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || photosStorageFull}
            >
              Choose photos
            </Button>
          </div>
        )}
      </div>

      <div className="photo-mode-footer">
        <StorageUsageBar
          usedBytes={photosUsed}
          limitBytes={LEAD_STORAGE_LIMIT_BYTES}
          className="w-full"
          label="Photo storage"
        />
        {sessionThumbs.length > 0 && (
          <div className="photo-mode-thumbs">
            {sessionThumbs.map((src, i) => (
              <button
                key={i}
                type="button"
                className={cn(
                  'photo-mode-thumb-btn',
                  viewerIndex === i && 'photo-mode-thumb-btn--active'
                )}
                onClick={() => setViewerIndex(i)}
                aria-label={`View photo ${i + 1} of ${sessionThumbs.length}`}
                aria-pressed={viewerIndex === i}
              >
                <img src={src} alt="" className="photo-mode-thumb" />
              </button>
            ))}
          </div>
        )}
        {useCamera && cameraReady && (
          <button
            type="button"
            className="photo-mode-shutter"
            onClick={handleCapture}
            disabled={photosStorageFull}
            aria-label="Take photo"
          >
            <Camera className="h-7 w-7" />
          </button>
        )}
        {showUploadFallback && !cameraStarting && (
          <Button
            type="button"
            className="photo-mode-btn photo-mode-btn--primary min-h-[44px]"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || photosStorageFull}
          >
            <Upload className="h-4 w-4 mr-2" />
            Add photos
          </Button>
        )}
      </div>
    </div>,
    getModalPortalContainer()
    )}

    <FilePreviewOverlay
      open={viewerIndex != null}
      onClose={() => setViewerIndex(null)}
      items={sessionPreviewItems}
      initialIndex={viewerIndex ?? 0}
    />
    </>
  )
}
