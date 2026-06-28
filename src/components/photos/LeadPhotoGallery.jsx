import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Camera, Loader2, Trash2, PenLine, RotateCcw } from 'lucide-react'
import { Button } from '../ui/button'
import { leadPhotoUrl, deleteLeadPhoto, fetchLeadPhotoBlob, uploadLeadPhoto, getCurrentPosition, sumLeadPhotoBytes, LEAD_STORAGE_LIMIT_BYTES } from '@/utils/leadPhotos'
import { formatLeadAddress } from '@/utils/leads'
import { logLeadPhotosAdded } from '@/utils/leadActivity'
import { isPendingPhoto, UPLOAD_STATUS } from '@/utils/optimisticPhotoUpload'
import { useBackgroundPhotoUploadQueue } from '@/hooks/useBackgroundPhotoUploadQueue'
import { StorageUsageBar } from '../ui/StorageUsageBar'
import { FilePreviewOverlay } from '../ui/FilePreviewOverlay'
import { PhotoMode } from './PhotoMode'
import { PhotoAnnotator } from './PhotoAnnotator'
import { cn } from '@/lib/utils'
import { usePhotoThumbnailLoader } from '@/hooks/usePhotoThumbnailLoader'
import {
  getPhotoPreviewKey,
  getPhotoThumbSourceToken,
  shouldUseLocalPhotoPreview,
} from '@/utils/photoDisplay'

function LeadDetailSectionTitle({ children, action }) {
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
  return fetchLeadPhotoBlob(getToken, key, getPhotoThumbSourceToken(photo))
}

export function LeadPhotoGallery({
  lead,
  getToken,
  currentUser,
  readOnly = false,
  onLeadUpdate,
}) {
  const [photoModeOpen, setPhotoModeOpen] = useState(false)
  const [annotating, setAnnotating] = useState(null)
  const [previewPhotoIndex, setPreviewPhotoIndex] = useState(null)
  const annotatingPhotoIdRef = useRef(null)

  const uploadOne = useCallback(async (source, existingPhotos, entity) => {
    const pos = await getCurrentPosition()
    const name = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User'
    const result = await uploadLeadPhoto(getToken, {
      leadId: entity.id,
      file: typeof source === 'string' ? undefined : source,
      dataUrl: typeof source === 'string' ? source : undefined,
      existingPhotos,
      metadata: {
        capturedByName: name,
        lat: pos?.lat ?? entity.lat ?? null,
        lng: pos?.lng ?? entity.lng ?? null,
        addressLabel: formatLeadAddress(entity) || entity.address || '',
        parcelId: entity.parcelId || null,
      },
    })
    return { entity: result.lead, photo: result.photo, thumbnailBlob: result.thumbnailBlob }
  }, [getToken, currentUser])

  const { enqueue, retry, optimisticDelete, setEntity, uploadingCount, pendingDeleteIds } = useBackgroundPhotoUploadQueue({
    getToken,
    uploadOne,
    onEntityUpdated: onLeadUpdate,
    logActivity: async (entity) => {
      if (entity?.id) await logLeadPhotosAdded(getToken, entity.id, 1)
    },
  })

  useEffect(() => {
    if (lead) setEntity(lead)
  }, [lead, setEntity])

  const photos = useMemo(() => {
    const all = Array.isArray(lead?.photos) ? lead.photos : []
    return pendingDeleteIds.size ? all.filter((p) => !pendingDeleteIds.has(p.id)) : all
  }, [lead?.photos, pendingDeleteIds])
  const photosUsed = sumLeadPhotoBytes(photos)
  const photosStorageFull = photosUsed >= LEAD_STORAGE_LIMIT_BYTES

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
    if (annotating?.id) annotatingPhotoIdRef.current = annotating.id
  }, [annotating])

  const {
    thumbUrls,
    reloadThumb,
    invalidatePhotoThumb,
    handleThumbLoadError,
    setPendingAnnotatedPreview,
  } = usePhotoThumbnailLoader({
    photos,
    getToken,
    buildUrl: leadPhotoUrl,
    resetKey: lead?.id,
  })

  const handleEnqueueUpload = useCallback((source, meta = {}, entityOverride) => {
    const target = entityOverride || lead
    if (!target?.id) return null
    return enqueue(source, target, meta)
  }, [enqueue, lead])

  const handleDelete = (photo) => {
    setPreviewPhotoIndex(null)
    optimisticDelete(photo, async () => {
      const result = await deleteLeadPhoto(getToken, { leadId: lead.id, photoId: photo.id })
      return { entity: result.lead }
    })
  }

  const handleAnnotatorSave = (updatedLead, { complete = true } = {}) => {
    const photoId = annotatingPhotoIdRef.current
    const savedPhoto = photoId ? updatedLead?.photos?.find((p) => p.id === photoId) : null

    if (!complete && savedPhoto?._annotatedPreviewUrl) {
      setPendingAnnotatedPreview(photoId, savedPhoto._annotatedPreviewUrl)
    }

    onLeadUpdate?.(updatedLead)

    if (!complete) return

    setAnnotating(null)
    annotatingPhotoIdRef.current = null

    if (!savedPhoto?.id) return

    const savedSuccessfully = Boolean(savedPhoto.annotatedKey && savedPhoto.annotatedKey !== '__pending__')
    if (!savedSuccessfully) {
      invalidatePhotoThumb(savedPhoto.id)
      return
    }

    reloadThumb(savedPhoto)
  }

  const openAnnotate = (photo) => {
    if (isPendingPhoto(photo) || !photo.key) return
    setPreviewPhotoIndex(null)
    setAnnotating(photo)
  }

  return (
    <>
      <section className="lead-detail-section">
        <LeadDetailSectionTitle
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
        </LeadDetailSectionTitle>
        <StorageUsageBar
          usedBytes={photosUsed}
          limitBytes={LEAD_STORAGE_LIMIT_BYTES}
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

      <PhotoMode
        open={photoModeOpen}
        lead={lead}
        getToken={getToken}
        currentUser={currentUser}
        onClose={() => setPhotoModeOpen(false)}
        onEnqueueUpload={handleEnqueueUpload}
        uploadingCount={uploadingCount}
      />

      {annotating && (
        <PhotoAnnotator
          open
          lead={lead}
          photo={annotating}
          getToken={getToken}
          onClose={() => setAnnotating(null)}
          onSaved={handleAnnotatorSave}
        />
      )}
    </>
  )
}
