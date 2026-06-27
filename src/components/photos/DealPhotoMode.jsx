import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Camera, Upload, Loader2, Check } from 'lucide-react'
import { PanelBackButton } from '../ui/panel-header'
import { Button } from '../ui/button'
import { formatLeadAddress } from '@/utils/leads'
import {
  getCurrentPosition,
  sumDealPhotoBytes,
  DEAL_PHOTO_STORAGE_LIMIT_BYTES,
} from '@/utils/dealPhotos'
import { estimateDataUrlBytes } from '@/utils/uploadLimits'
import { estimatePhotoBytes } from '@/utils/optimisticPhotoUpload'
import { showToast } from '../ui/toast'
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

export function DealPhotoMode({
  open,
  deal,
  pipelineId,
  lead = null,
  getToken,
  currentUser,
  onClose,
  onPhotosUploaded,
  onEnqueueUpload,
  uploadingCount = 0,
}) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const fileInputRef = useRef(null)
  const [sessionThumbs, setSessionThumbs] = useState([])
  const [cameraReady, setCameraReady] = useState(false)
  const [useCamera, setUseCamera] = useState(false)
  const [cameraStarting, setCameraStarting] = useState(false)
  const [viewerIndex, setViewerIndex] = useState(null)
  const [currentPhotos, setCurrentPhotos] = useState(() => (Array.isArray(deal?.photos) ? deal.photos : []))

  const canOptimisticUpload = typeof onEnqueueUpload === 'function'

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
      setCurrentPhotos(Array.isArray(deal?.photos) ? deal.photos : [])
    }
  }, [open, deal])

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
        if (videoRef.current) {
          await bindStreamToVideo(videoRef.current, stream)
          setCameraReady(true)
        }
      } catch {
        setUseCamera(false)
      } finally {
        if (!cancelled) setCameraStarting(false)
      }
    })()

    return () => {
      cancelled = true
      stopCamera()
    }
  }, [open, stopCamera])

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

  const buildUploadMeta = useCallback(async () => {
    const pos = await getCurrentPosition()
    const name = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User'
    const addressLabel = deal?.leadAddress || (lead ? formatLeadAddress(lead) : '') || ''
    return {
      capturedByUid: currentUser?.uid ?? null,
      capturedByName: name,
      lat: pos?.lat ?? lead?.lat ?? null,
      lng: pos?.lng ?? lead?.lng ?? null,
      addressLabel,
      parcelId: deal?.parcelId || lead?.parcelId || null,
    }
  }, [currentUser, deal, lead])

  const basePhotos = canOptimisticUpload ? (deal?.photos || []) : currentPhotos
  const pendingSessionBytes = useMemo(
    () => (canOptimisticUpload ? 0 : sessionThumbs.reduce((sum, src) => {
      if (src.startsWith('blob:')) return sum
      return sum + estimateDataUrlBytes(src)
    }, 0)),
    [sessionThumbs, canOptimisticUpload],
  )

  const photosUsed = sumDealPhotoBytes(basePhotos) + pendingSessionBytes
  const photosStorageFull = photosUsed >= DEAL_PHOTO_STORAGE_LIMIT_BYTES

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
    const usedPhotos = canOptimisticUpload ? (deal?.photos || []) : currentPhotos
    if (sumDealPhotoBytes(usedPhotos) + nextPending > DEAL_PHOTO_STORAGE_LIMIT_BYTES) {
      showToast('Deal photo storage limit reached', 'error')
      return false
    }
    setSessionThumbs((prev) => [...prev, dataUrl])
    return true
  }, [currentPhotos, deal?.photos, pendingSessionBytes, canOptimisticUpload])

  const enqueueSource = useCallback(async (source, entityOverride = null, extraMeta = {}) => {
    if (!onEnqueueUpload) return false
    const target = entityOverride || deal
    const usedPhotos = target?.photos || currentPhotos
    const bytes = estimatePhotoBytes(source)
    if (sumDealPhotoBytes(usedPhotos) + bytes > DEAL_PHOTO_STORAGE_LIMIT_BYTES) {
      showToast('Deal photo storage limit reached', 'error')
      return false
    }
    const meta = { ...(await buildUploadMeta()), ...extraMeta, estimatedBytes: bytes }
    if (!meta.localPreviewUrl && typeof source !== 'string' && typeof File !== 'undefined' && source instanceof File) {
      meta.localPreviewUrl = URL.createObjectURL(source)
    }
    onEnqueueUpload(source, meta, target)
    return true
  }, [onEnqueueUpload, buildUploadMeta, deal, currentPhotos])

  const handleCapture = async () => {
    const dataUrl = captureFromVideo()
    if (!dataUrl) return
    if (canOptimisticUpload) {
      if (!addSessionDataUrl(dataUrl)) return
      await enqueueSource(dataUrl)
      return
    }
    addSessionDataUrl(dataUrl)
  }

  const handleFilePick = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return

    if (canOptimisticUpload) {
      try {
        for (const file of files) {
          const preview = URL.createObjectURL(file)
          if (!addSessionDataUrl(preview)) {
            URL.revokeObjectURL(preview)
            break
          }
          await enqueueSource(file, null, { localPreviewUrl: preview })
        }
      } catch (err) {
        showToast(err.message || 'Could not add photo', 'error')
      }
      return
    }
  }

  const handleDone = () => {
    onClose?.()
  }

  const handleBack = () => {
    onClose?.()
  }

  if (!open || !deal?.id || !pipelineId) return null

  const headerTitle = deal.title || deal.leadAddress || 'Deal'
  const headerSubtitle = deal.leadAddress || (lead ? formatLeadAddress(lead) : '')

  const showUploadFallback = !useCamera || (!cameraReady && !cameraStarting)
  const isUploadLayout = showUploadFallback && !cameraStarting

  return (
    <>
      {createPortal(
        <div
          className={cn(
            'photo-mode-overlay flex flex-col min-h-0',
            isUploadLayout
              ? 'photo-mode-overlay--upload'
              : 'map-panel list-panel photos-panel fullscreen-panel',
          )}
          role="dialog"
          aria-label="Deal photo mode"
        >
          {isUploadLayout && (
            <button type="button" className="photo-mode-scrim" onClick={handleBack} aria-label="Close" />
          )}
          <div
            className={cn(
              'flex flex-col min-h-0 min-w-0',
              isUploadLayout
                ? 'map-panel list-panel photos-panel photo-mode-upload-box'
                : 'flex-1',
            )}
          >
            <div className="photo-mode-header">
              <PanelBackButton onClick={handleBack} title="Exit photo mode" />
              <div className="min-w-0 flex-1 px-2">
                <div className="text-sm font-semibold truncate">{headerTitle}</div>
                <div className="text-xs opacity-50 truncate">
                  {headerSubtitle}
                  {uploadingCount > 0 && ` · ${uploadingCount} uploading`}
                </div>
              </div>
              <Button
                type="button"
                className="photo-overlay-header-btn photo-mode-btn photo-mode-btn--primary shrink-0"
                onClick={handleDone}
              >
                <Check className="h-4 w-4 mr-1" />
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
                    disabled={photosStorageFull}
                  >
                    Choose photos
                  </Button>
                </div>
              )}
            </div>

            <div className="photo-mode-footer">
              <StorageUsageBar
                usedBytes={photosUsed}
                limitBytes={DEAL_PHOTO_STORAGE_LIMIT_BYTES}
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
            </div>
          </div>
        </div>,
        getModalPortalContainer(),
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
