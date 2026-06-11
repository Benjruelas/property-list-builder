import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Camera, Upload, Loader2, Check } from 'lucide-react'
import { PanelBackButton } from '../ui/panel-header'
import { Button } from '../ui/button'
import { displayLeadName, formatLeadAddress } from '@/utils/leads'
import { uploadLeadPhoto, getCurrentPosition, sumLeadPhotoBytes, LEAD_STORAGE_LIMIT_BYTES } from '@/utils/leadPhotos'
import { estimateDataUrlBytes } from '@/utils/uploadLimits'
import { logLeadPhotosAdded } from '@/utils/leadActivity'
import { showToast } from '../ui/toast'
import { StorageUsageBar } from '../ui/StorageUsageBar'
import { FilePreviewOverlay } from '../ui/FilePreviewOverlay'
import { cn } from '@/lib/utils'

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

export function PhotoMode({
  open,
  lead,
  parcelId = null,
  addressLabel = '',
  getToken,
  currentUser,
  onClose,
  onPhotosUploaded,
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
    }
  }, [open, lead?.photos])

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
      return undefined
    }

    if (!canUseCamera()) {
      setUseCamera(false)
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
  }, [open, stopCamera])

  // Video mounts before stream resolves — attach when both are ready.
  useEffect(() => {
    if (!open || !useCamera || cameraReady || !streamRef.current || !videoRef.current) return undefined
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
  }, [open, useCamera, cameraReady])

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

  const uploadOne = useCallback(async (dataUrl, existingPhotos) => {
    const pos = await getCurrentPosition()
    const name = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User'
    return uploadLeadPhoto(getToken, {
      leadId: lead.id,
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

  const handleCapture = async () => {
    const dataUrl = captureFromVideo()
    if (!dataUrl) return
    const nextPending = pendingSessionBytes + estimateDataUrlBytes(dataUrl)
    if (sumLeadPhotoBytes(currentPhotos) + nextPending > LEAD_STORAGE_LIMIT_BYTES) {
      showToast('Lead photo storage limit reached', 'error')
      return
    }
    setSessionThumbs((prev) => [...prev, dataUrl])
  }

  const handleFilePick = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
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

  const handleDone = async () => {
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
        const result = await uploadOne(dataUrl, runningPhotos)
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

  if (!open || !lead) return null

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
        <PanelBackButton onClick={onClose} title="Exit photo mode" />
        <div className="min-w-0 flex-1 px-2">
          <div className="text-sm font-semibold truncate">{displayLeadName(lead)}</div>
          <div className="text-xs opacity-50 truncate">{formatLeadAddress(lead) || lead.address}</div>
        </div>
        <Button
          type="button"
          size="sm"
          className="photo-mode-btn photo-mode-btn--primary shrink-0 min-h-[36px]"
          onClick={handleDone}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
          Done
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
    document.body
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
