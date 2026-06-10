import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Camera, Upload, Loader2, Check } from 'lucide-react'
import { PanelBackButton } from '../ui/panel-header'
import { Button } from '../ui/button'
import { displayLeadName, formatLeadAddress } from '@/utils/leads'
import { uploadLeadPhoto, getCurrentPosition } from '@/utils/leadPhotos'
import { logLeadPhotosAdded } from '@/utils/leadActivity'
import { showToast } from '../ui/toast'
import { cn } from '@/lib/utils'

function isMobileDevice() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(max-width: 767px)').matches
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

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setCameraReady(false)
  }, [])

  useEffect(() => {
    if (!open) {
      stopCamera()
      setSessionThumbs([])
      return undefined
    }

    const mobile = isMobileDevice()
    setUseCamera(mobile)

    if (!mobile) return undefined

    let cancelled = false
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        setCameraReady(true)
      } catch {
        setUseCamera(false)
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

  const uploadOne = useCallback(async (dataUrl) => {
    const pos = await getCurrentPosition()
    const name = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User'
    const result = await uploadLeadPhoto(getToken, {
      leadId: lead.id,
      dataUrl,
      metadata: {
        capturedByName: name,
        lat: pos?.lat ?? lead.lat ?? null,
        lng: pos?.lng ?? lead.lng ?? null,
        addressLabel: addressLabel || formatLeadAddress(lead) || lead.address || '',
        parcelId: parcelId || lead.parcelId || null,
      },
    })
    return result
  }, [getToken, lead, parcelId, addressLabel, currentUser])

  const handleCapture = async () => {
    const dataUrl = captureFromVideo()
    if (!dataUrl) return
    setSessionThumbs((prev) => [...prev, dataUrl])
  }

  const handleFilePick = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setUploading(true)
    try {
      let lastLead = lead
      for (const file of files) {
        const pos = await getCurrentPosition()
        const name = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User'
        const result = await uploadLeadPhoto(getToken, {
          leadId: lead.id,
          file,
          metadata: {
            capturedByName: name,
            lat: pos?.lat ?? lead.lat ?? null,
            lng: pos?.lng ?? lead.lng ?? null,
            addressLabel: addressLabel || formatLeadAddress(lead) || lead.address || '',
            parcelId: parcelId || lead.parcelId || null,
          },
        })
        lastLead = result.lead
        setSessionThumbs((prev) => [...prev, URL.createObjectURL(file)])
      }
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
      let count = 0
      for (const dataUrl of sessionThumbs) {
        if (dataUrl.startsWith('blob:')) continue
        const result = await uploadOne(dataUrl)
        lastLead = result.lead
        count += 1
      }
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

  return createPortal(
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
        {useCamera && cameraReady ? (
          <video ref={videoRef} className="photo-mode-video" playsInline muted autoPlay />
        ) : (
          <div className="photo-mode-upload-zone">
            <Upload className="h-10 w-10 opacity-40 mb-3" />
            <p className="text-sm opacity-70 mb-4">Upload photos from your device</p>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFilePick} />
            <Button
              type="button"
              className="photo-mode-btn min-h-[44px]"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              Choose photos
            </Button>
          </div>
        )}
      </div>

      <div className="photo-mode-footer">
        {sessionThumbs.length > 0 && (
          <div className="photo-mode-thumbs">
            {sessionThumbs.map((src, i) => (
              <img key={i} src={src} alt="" className="photo-mode-thumb" />
            ))}
          </div>
        )}
        {useCamera && cameraReady && (
          <button type="button" className="photo-mode-shutter" onClick={handleCapture} aria-label="Take photo">
            <Camera className="h-7 w-7" />
          </button>
        )}
        {!useCamera && (
          <Button
            type="button"
            className="photo-mode-btn photo-mode-btn--primary min-h-[44px]"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="h-4 w-4 mr-2" />
            Add photos
          </Button>
        )}
      </div>
    </div>,
    document.body
  )
}
