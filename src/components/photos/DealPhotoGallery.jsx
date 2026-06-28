import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Camera, Loader2, Trash2, PenLine, RotateCcw } from 'lucide-react'
import { Button } from '../ui/button'
import {
  dealPhotoUrl,
  deleteDealPhoto,
  fetchDealPhotoBlob,
  uploadDealPhoto,
  getCurrentPosition,
  sumDealPhotoBytes,
  DEAL_PHOTO_STORAGE_LIMIT_BYTES,
} from '@/utils/dealPhotos'
import { formatLeadAddress } from '@/utils/leads'
import { isPendingPhoto, UPLOAD_STATUS } from '@/utils/optimisticPhotoUpload'
import { useBackgroundPhotoUploadQueue } from '@/hooks/useBackgroundPhotoUploadQueue'
import { StorageUsageBar } from '../ui/StorageUsageBar'
import { FilePreviewOverlay } from '../ui/FilePreviewOverlay'
import { DealPhotoMode } from './DealPhotoMode'
import { DealPhotoAnnotator } from './DealPhotoAnnotator'
import { cn } from '@/lib/utils'
import { deferRevokeObjectURL, isRevocableBlobUrl } from '@/utils/blobUrl'
import {
  getPhotoPreviewKey,
  getPhotoThumbnailFetchKeys,
  getPhotoThumbSourceToken,
  getAnnotatedDataPreviewUrl,
  shouldUseLocalPhotoPreview,
} from '@/utils/photoDisplay'

function DealDetailSectionTitle({ children, action }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2.5">
      <h3 className="lead-detail-section-title">{children}</h3>
      {action}
    </div>
  )
}

function photoPreviewName(photo, index) {
  if (photo.addressLabel) return photo.addressLabel
  if (photo.capturedAt) {
    try {
      return `Photo ${new Date(photo.capturedAt).toLocaleString()}`
    } catch { /* ignore */ }
  }
  return `Photo ${index + 1}`
}

async function loadPhotoPreviewBlob(getToken, photo) {
  if (photo._annotatedPreviewUrl?.startsWith('data:')) {
    const res = await fetch(photo._annotatedPreviewUrl)
    return res.blob()
  }
  if (shouldUseLocalPhotoPreview(photo)) {
    const res = await fetch(photo._localPreviewUrl)
    return res.blob()
  }
  const key = getPhotoPreviewKey(photo)
  if (!key) throw new Error('Photo not available')
  return fetchDealPhotoBlob(getToken, key, getPhotoThumbSourceToken(photo))
}

export function DealPhotoGallery({
  deal,
  pipelineId,
  lead = null,
  getToken,
  currentUser,
  readOnly = false,
  onDealUpdate,
  onNestedOverlayChange,
}) {
  const [photoModeOpen, setPhotoModeOpen] = useState(false)
  const [annotating, setAnnotating] = useState(null)
  const [previewPhotoIndex, setPreviewPhotoIndex] = useState(null)
  const [thumbUrls, setThumbUrls] = useState({})
  const thumbLoadedRef = useRef({})
  const thumbRequestRef = useRef({})
  const thumbInflightRef = useRef({})
  const annotatingPhotoIdRef = useRef(null)
  const pendingAnnotatedPreviewRef = useRef({})
  const thumbUrlsRef = useRef({})
  const photosRef = useRef([])
  const thumbErrorRetryRef = useRef({})

  const uploadOne = useCallback(async (source, existingPhotos, entity) => {
    const pos = await getCurrentPosition()
    const name = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User'
    const addressLabel = entity.leadAddress || (lead ? formatLeadAddress(lead) : '') || ''
    const result = await uploadDealPhoto(getToken, {
      pipelineId,
      dealId: entity.id,
      file: typeof source === 'string' ? undefined : source,
      dataUrl: typeof source === 'string' ? source : undefined,
      existingPhotos,
      metadata: {
        capturedByName: name,
        lat: pos?.lat ?? lead?.lat ?? null,
        lng: pos?.lng ?? lead?.lng ?? null,
        addressLabel,
        parcelId: entity.parcelId || lead?.parcelId || null,
      },
    })
    return { entity: result.deal, photo: result.photo }
  }, [getToken, currentUser, pipelineId, lead])

  const { enqueue, retry, optimisticDelete, setEntity, uploadingCount, pendingDeleteIds } = useBackgroundPhotoUploadQueue({
    getToken,
    uploadOne,
    onEntityUpdated: onDealUpdate,
  })

  useEffect(() => {
    if (deal) setEntity(deal)
  }, [deal, setEntity])

  const photos = useMemo(() => {
    const all = Array.isArray(deal?.photos) ? deal.photos : []
    return pendingDeleteIds.size ? all.filter((p) => !pendingDeleteIds.has(p.id)) : all
  }, [deal?.photos, pendingDeleteIds])
  const photosUsed = sumDealPhotoBytes(photos)
  const photosStorageFull = photosUsed >= DEAL_PHOTO_STORAGE_LIMIT_BYTES

  const photoPreviewItems = useMemo(
    () => photos.map((photo, index) => ({
      id: photo.id,
      name: photoPreviewName(photo, index),
      contentType: photo.contentType || 'image/jpeg',
      photo,
      loadBlob: () => loadPhotoPreviewBlob(getToken, photo),
    })),
    [photos, getToken],
  )

  useEffect(() => {
    onNestedOverlayChange?.(photoModeOpen || !!annotating || previewPhotoIndex != null)
  }, [photoModeOpen, annotating, previewPhotoIndex, onNestedOverlayChange])

  useEffect(() => {
    if (annotating?.id) annotatingPhotoIdRef.current = annotating.id
  }, [annotating])

  useEffect(() => {
    setThumbUrls({})
    thumbLoadedRef.current = {}
    thumbRequestRef.current = {}
    thumbInflightRef.current = {}
    pendingAnnotatedPreviewRef.current = {}
    thumbErrorRetryRef.current = {}
  }, [deal?.id])

  const invalidatePhotoThumb = useCallback((photoId) => {
    thumbRequestRef.current[photoId] = (thumbRequestRef.current[photoId] || 0) + 1
    delete thumbLoadedRef.current[photoId]
    delete thumbInflightRef.current[photoId]
    const pendingPreview = pendingAnnotatedPreviewRef.current[photoId]
    if (pendingPreview) {
      delete pendingAnnotatedPreviewRef.current[photoId]
    }
    setThumbUrls((prev) => {
      const previous = prev[photoId]
      if (previous?.startsWith('blob:')) deferRevokeObjectURL(previous)
      if (pendingPreview && isRevocableBlobUrl(pendingPreview) && pendingPreview !== previous) {
        deferRevokeObjectURL(pendingPreview)
      }
      const next = { ...prev }
      delete next[photoId]
      return next
    })
  }, [])

  const loadThumb = useCallback(async (photo, { skipLocalPreview = false } = {}) => {
    const pendingPreview = skipLocalPreview ? null : pendingAnnotatedPreviewRef.current[photo.id]
    const rawPreview = skipLocalPreview
      ? null
      : (photo._annotatedPreviewUrl || pendingPreview || null)
    if (isRevocableBlobUrl(rawPreview)) {
      delete pendingAnnotatedPreviewRef.current[photo.id]
    }
    const annotatedPreviewUrl = getAnnotatedDataPreviewUrl(photo, pendingPreview, { skipLocalPreview })
    if (annotatedPreviewUrl) {
      setThumbUrls((prev) => (prev[photo.id] === annotatedPreviewUrl ? prev : { ...prev, [photo.id]: annotatedPreviewUrl }))
      return
    }
    if (!skipLocalPreview && shouldUseLocalPhotoPreview(photo)) {
      const localUrl = photo._localPreviewUrl
      setThumbUrls((prev) => (prev[photo.id] === localUrl ? prev : { ...prev, [photo.id]: localUrl }))
      return
    }
    const keys = getPhotoThumbnailFetchKeys(photo).filter((key) => key && key !== '__pending__')
    if (!keys.length) return
    const sourceToken = getPhotoThumbSourceToken(photo)
    if (
      thumbLoadedRef.current[photo.id] === sourceToken
      && thumbUrlsRef.current[photo.id]
      && !annotatedPreviewUrl
    ) return
    // A fetch for this exact photo version is already running. Don't start a new
    // one — re-running on every background poll would otherwise cancel the
    // in-flight request and slow thumbnails would never finish loading.
    if (thumbInflightRef.current[photo.id] === sourceToken) return
    thumbInflightRef.current[photo.id] = sourceToken
    const requestId = (thumbRequestRef.current[photo.id] || 0) + 1
    thumbRequestRef.current[photo.id] = requestId
    try {
      const token = await getToken()
      if (!token) return
      let blob = null
      for (const key of keys) {
        const res = await fetch(dealPhotoUrl(key, sourceToken), {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        if (thumbRequestRef.current[photo.id] !== requestId) return
        if (res.ok) {
          blob = await res.blob()
          break
        }
      }
      if (!blob) return
      if (thumbRequestRef.current[photo.id] !== requestId) return
      thumbLoadedRef.current[photo.id] = sourceToken
      thumbErrorRetryRef.current[photo.id] = 0
      const url = URL.createObjectURL(blob)
      const pendingDataPreview = pendingAnnotatedPreviewRef.current[photo.id]
      if (pendingDataPreview) delete pendingAnnotatedPreviewRef.current[photo.id]
      setThumbUrls((prev) => {
        const previous = prev[photo.id]
        if (previous?.startsWith('blob:') && previous !== url) deferRevokeObjectURL(previous)
        if (pendingDataPreview && isRevocableBlobUrl(pendingDataPreview) && pendingDataPreview !== url && pendingDataPreview !== previous) {
          deferRevokeObjectURL(pendingDataPreview)
        }
        return { ...prev, [photo.id]: url }
      })
    } catch {
      // Keep local annotated preview visible; allow retry on next photos update.
    } finally {
      if (thumbInflightRef.current[photo.id] === sourceToken) {
        delete thumbInflightRef.current[photo.id]
      }
    }
  }, [getToken])

  const handleThumbLoadError = useCallback((photo) => {
    const retries = (thumbErrorRetryRef.current[photo.id] || 0) + 1
    if (retries > 5) return
    thumbErrorRetryRef.current[photo.id] = retries
    delete thumbLoadedRef.current[photo.id]
    delete thumbInflightRef.current[photo.id]
    delete pendingAnnotatedPreviewRef.current[photo.id]
    thumbRequestRef.current[photo.id] = (thumbRequestRef.current[photo.id] || 0) + 1
    setThumbUrls((prev) => {
      const bad = prev[photo.id]
      if (bad?.startsWith('blob:')) deferRevokeObjectURL(bad)
      const next = { ...prev }
      delete next[photo.id]
      return next
    })
    loadThumb({ ...photo, _annotatedPreviewUrl: undefined }, { skipLocalPreview: true })
  }, [loadThumb])

  useEffect(() => {
    photos.forEach((p) => loadThumb(p))
  }, [photos, loadThumb])

  // Keep latest values for the unmount-only cleanup below. Mirroring via refs
  // avoids revoking object URLs that are still displayed whenever photos/thumbUrls change.
  thumbUrlsRef.current = thumbUrls
  photosRef.current = photos

  useEffect(() => () => {
    Object.entries(thumbUrlsRef.current).forEach(([, url]) => {
      if (url?.startsWith('blob:')) deferRevokeObjectURL(url)
    })
    Object.values(pendingAnnotatedPreviewRef.current).forEach((url) => {
      if (url?.startsWith('blob:')) deferRevokeObjectURL(url)
    })
  }, [])

  const handleEnqueueUpload = useCallback((source, meta = {}, entityOverride) => {
    const target = entityOverride || deal
    if (!target?.id) return null
    return enqueue(source, target, meta)
  }, [enqueue, deal])

  const handleDelete = (photo) => {
    if (!pipelineId || !deal?.id) return
    setPreviewPhotoIndex(null)
    optimisticDelete(photo, async () => {
      const result = await deleteDealPhoto(getToken, {
        pipelineId,
        dealId: deal.id,
        photoId: photo.id,
      })
      return { entity: result.deal }
    })
  }

  const handleAnnotatorSave = (updatedDeal, { complete = true } = {}) => {
    const photoId = annotatingPhotoIdRef.current
    const savedPhoto = photoId ? updatedDeal?.photos?.find((p) => p.id === photoId) : null

    if (!complete && savedPhoto?._annotatedPreviewUrl) {
      pendingAnnotatedPreviewRef.current[photoId] = savedPhoto._annotatedPreviewUrl
    }

    onDealUpdate?.(updatedDeal)

    if (!complete) return

    setAnnotating(null)
    annotatingPhotoIdRef.current = null

    if (!savedPhoto?.id) return

    const savedSuccessfully = Boolean(savedPhoto.annotatedKey && savedPhoto.annotatedKey !== '__pending__')
    if (!savedSuccessfully) {
      invalidatePhotoThumb(savedPhoto.id)
      return
    }

    thumbRequestRef.current[savedPhoto.id] = (thumbRequestRef.current[savedPhoto.id] || 0) + 1
    delete thumbLoadedRef.current[savedPhoto.id]
    delete thumbInflightRef.current[savedPhoto.id]
    delete pendingAnnotatedPreviewRef.current[savedPhoto.id]
    const { _annotatedPreviewUrl, _annotationSaving, ...serverPhoto } = savedPhoto
    loadThumb(serverPhoto, { skipLocalPreview: true })
  }

  const openAnnotate = (photo) => {
    if (isPendingPhoto(photo) || !photo.key) return
    setPreviewPhotoIndex(null)
    setAnnotating(photo)
  }

  if (!deal?.id || !pipelineId) return null

  return (
    <>
      <section className="lead-detail-section">
        <DealDetailSectionTitle
          action={
            !readOnly ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={photosStorageFull}
                onClick={() => setPhotoModeOpen(true)}
              >
                <Camera className="h-3.5 w-3.5 mr-1" />
                Add photos
              </Button>
            ) : null
          }
        >
          Photos
          {uploadingCount > 0 && (
            <span className="text-[10px] font-normal text-white/45 ml-2">
              {uploadingCount} uploading
            </span>
          )}
        </DealDetailSectionTitle>
        <StorageUsageBar
          usedBytes={photosUsed}
          limitBytes={DEAL_PHOTO_STORAGE_LIMIT_BYTES}
          className="mb-2"
          label="Photo storage"
        />
        {photos.length === 0 ? (
          <p className="text-xs text-white/40 py-1">No photos yet</p>
        ) : (
          <div className="lead-photo-grid">
            {photos.map((photo, photoIndex) => {
              const isPending = isPendingPhoto(photo)
              const isUploading = photo._uploadStatus === UPLOAD_STATUS.UPLOADING
              const isFailed = photo._uploadStatus === UPLOAD_STATUS.FAILED
              return (
                <div
                  key={photo.id}
                  className={cn(
                    'lead-photo-grid-item group relative',
                    isUploading && 'lead-photo-grid-item--uploading',
                    isFailed && 'lead-photo-grid-item--failed',
                  )}
                >
                  <button
                    type="button"
                    className="w-full aspect-square rounded-lg border border-white/10 overflow-hidden bg-white/[0.04]"
                    onClick={() => {
                      if (isFailed) {
                        retry(photo.id)
                        return
                      }
                      setPreviewPhotoIndex(photoIndex)
                    }}
                    title={isFailed ? 'Tap to retry upload' : 'Preview photo'}
                  >
                    {thumbUrls[photo.id] ? (
                      <img
                        src={thumbUrls[photo.id]}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={() => handleThumbLoadError(photo)}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin opacity-40" />
                      </div>
                    )}
                    {isUploading && (
                      <div className="lead-photo-upload-overlay">
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </div>
                    )}
                    {isFailed && (
                      <div className="lead-photo-upload-overlay lead-photo-upload-overlay--failed">
                        <RotateCcw className="h-5 w-5" />
                        <span className="text-[10px] mt-1">Retry</span>
                      </div>
                    )}
                  </button>
                  {photo.annotatedKey && (
                    <span className="lead-photo-annotated-badge absolute top-1 left-1 text-[9px] px-1.5 py-0.5 rounded bg-black/50 text-white/90">
                      Annotated
                    </span>
                  )}
                  {!readOnly && (
                    <div className="lead-photo-grid-item-actions">
                      {!isPending && (
                        <button
                          type="button"
                          className="lead-photo-grid-action-btn lead-photo-grid-action-btn--annotate"
                          onClick={() => openAnnotate(photo)}
                          title="Annotate"
                          aria-label="Annotate photo"
                        >
                          <PenLine className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        className="lead-photo-grid-action-btn lead-photo-grid-action-btn--delete"
                        onClick={() => handleDelete(photo)}
                        title="Delete"
                        aria-label="Delete photo"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <FilePreviewOverlay
        open={previewPhotoIndex != null}
        onClose={() => setPreviewPhotoIndex(null)}
        items={photoPreviewItems}
        initialIndex={previewPhotoIndex ?? 0}
        renderActions={!readOnly ? ({ item }) => (
          isPendingPhoto(item.photo) ? null : (
            <>
              <button
                type="button"
                className="file-preview-icon-btn"
                onClick={() => openAnnotate(item.photo)}
                aria-label="Annotate photo"
                title="Annotate"
              >
                <PenLine className="h-5 w-5" />
              </button>
              <button
                type="button"
                className="file-preview-icon-btn"
                onClick={() => handleDelete(item.photo)}
                aria-label="Delete photo"
                title="Delete"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </>
          )
        ) : undefined}
      />

      <DealPhotoMode
        open={photoModeOpen}
        deal={deal}
        pipelineId={pipelineId}
        lead={lead}
        getToken={getToken}
        currentUser={currentUser}
        onClose={() => setPhotoModeOpen(false)}
        onEnqueueUpload={handleEnqueueUpload}
        uploadingCount={uploadingCount}
      />

      {annotating && (
        <DealPhotoAnnotator
          open
          deal={deal}
          pipelineId={pipelineId}
          photo={annotating}
          getToken={getToken}
          onClose={() => setAnnotating(null)}
          onSaved={handleAnnotatorSave}
        />
      )}
    </>
  )
}
