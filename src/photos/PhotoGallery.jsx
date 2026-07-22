import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Camera, Loader2, PenLine, Trash2 } from 'lucide-react'
import { Button } from '../components/ui/button'
import { StorageUsageBar } from '../components/ui/StorageUsageBar'
import { FilePreviewOverlay } from '../components/ui/FilePreviewOverlay'
import { PhotoCaptureModal } from './PhotoCaptureModal'
import { PhotoTile } from './PhotoTile'
import { usePhotoUpload } from './PhotoUploadProvider'
import {
  deletePhoto,
  fetchPhotoBlob,
  fetchPhotoPreviewBlob,
  invalidatePhotoBlobCache,
  sumPhotoBytes,
  LEAD_STORAGE_LIMIT_BYTES,
  DEAL_STORAGE_LIMIT_BYTES,
} from './photosClient'
import { entityRefFromLead, entityRefFromDeal, updatePhotoInList, savePhotoAnnotations } from './annotationSave'
import { entityKey } from './entityRef'
import { displayLeadName, formatLeadAddress, leadNeedsPhotoHydrate } from '@/utils/leads'
import { showToast } from '../components/ui/toast'
import { stripClientPhotoFields, dedupePhotosById } from '@/utils/photoDisplay'
import { logLeadPhotosAdded } from '@/utils/leadActivity'
import { PhotoAnnotator } from '../components/photos/PhotoAnnotator'
import { DealPhotoAnnotator } from '../components/photos/DealPhotoAnnotator'
import { getBlobs } from './photoStoreIdb'
import { JOB_STATUS } from './PhotoUploadManager'

function PhotoSkeletonTile() {
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-md bg-white/5 animate-pulse">
      <div className="absolute inset-0 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-white/25" aria-hidden />
      </div>
    </div>
  )
}
function SectionTitle({ children, action }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2.5">
      <h3 className="lead-detail-section-title">{children}</h3>
      {action}
    </div>
  )
}

function photoPreviewCaption(photo, photoNumber) {
  if (photo.capturedAt) {
    try {
      return new Date(photo.capturedAt).toLocaleString()
    } catch { /* ignore */ }
  }
  if (photoNumber) return `Photo ${photoNumber}`
  return ''
}

export function PhotoGallery({
  entityType = 'lead',
  entity,
  pipelineId = null,
  lead = null,
  getToken,
  currentUser,
  readOnly = false,
  onEntityUpdate,
  onNestedOverlayChange,
}) {
  const { getJobsForEntity, retry, kickQueue } = usePhotoUpload()
  const [captureOpen, setCaptureOpen] = useState(false)
  const [annotating, setAnnotating] = useState(null)
  const [previewIndex, setPreviewIndex] = useState(null)
  const [hiddenIds, setHiddenIds] = useState(() => new Set())
  const [expanded, setExpanded] = useState(false)
  const [wideViewport, setWideViewport] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(min-width: 480px)').matches,
  )
  const annotatingPhotoIdRef = useRef(null)
  const returnToPreviewPhotoIdRef = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const mql = window.matchMedia('(min-width: 480px)')
    const onChange = (e) => setWideViewport(e.matches)
    setWideViewport(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  const entityRef = useMemo(() => {
    if (entityType === 'deal') return entityRefFromDeal(entity, pipelineId)
    return entityRefFromLead(entity)
  }, [entityType, entity?.id, pipelineId])

  const queueEntityKey = useMemo(
    () => entityKey(entityRef),
    [entityRef],
  )

  const activeJobs = useMemo(
    () => getJobsForEntity(entityRef).filter((j) => j.status !== JOB_STATUS.done),
    [getJobsForEntity, entityRef],
  )

  const serverPhotos = useMemo(() => {
    const all = dedupePhotosById(Array.isArray(entity?.photos) ? entity.photos : [])
    return [...all].reverse()
  }, [entity?.photos])

  const displayItems = useMemo(() => {
    const visiblePhotos = serverPhotos.filter((p) => !hiddenIds.has(p.id))
    const serverPhotoIds = new Set(visiblePhotos.map((p) => p.id))
    const pendingJobs = activeJobs.filter((j) => !j.photoId || !serverPhotoIds.has(j.photoId))
    const items = [
      ...pendingJobs.map((job) => ({
        kind: 'job',
        id: job.jobId,
        job,
        photo: { id: job.jobId, blurHash: job.blurHash },
      })),
      ...visiblePhotos.map((photo) => ({
        kind: 'photo',
        id: photo.id,
        photo,
      })),
    ]
    const total = items.length
    return items.map((item, index) => ({
      ...item,
      number: total - index,
    }))
  }, [activeJobs, serverPhotos, hiddenIds])

  const columns = wideViewport ? 4 : 3
  const collapsedLimit = columns * 3
  const canCollapse = displayItems.length > collapsedLimit
  const visibleItems = expanded || !canCollapse
    ? displayItems
    : displayItems.slice(0, collapsedLimit)

  const limitBytes = entityType === 'deal' ? DEAL_STORAGE_LIMIT_BYTES : LEAD_STORAGE_LIMIT_BYTES
  const photosUsed = useMemo(() => {
    const visible = (entity?.photos || []).filter((p) => !hiddenIds.has(p.id))
    return sumPhotoBytes(visible)
  }, [entity?.photos, hiddenIds])
  const storageFull = photosUsed >= limitBytes

  const uploadingCount = activeJobs.filter(
    (j) => j.status === JOB_STATUS.uploading || j.status === JOB_STATUS.queued,
  ).length
  const failedCount = activeJobs.filter((j) => j.status === JOB_STATUS.failed).length
  const pendingUploadCount = activeJobs.length
  const photosMetadataLoading = entityType === 'lead'
    && leadNeedsPhotoHydrate(entity, { pendingUploadCount })
  const expectedPhotoCount = typeof entity?.photoCount === 'number' ? entity.photoCount : 0
  const skeletonCount = photosMetadataLoading
    ? Math.min(Math.max(expectedPhotoCount, 1), expanded ? expectedPhotoCount || collapsedLimit : collapsedLimit)
    : 0

  useEffect(() => {
    kickQueue()
  }, [queueEntityKey, kickQueue])

  useEffect(() => {
    onNestedOverlayChange?.(captureOpen || annotating != null || previewIndex != null)
  }, [captureOpen, annotating, previewIndex, onNestedOverlayChange])

  useEffect(() => {
    if (annotating?.id) annotatingPhotoIdRef.current = annotating.id
  }, [annotating])

  useEffect(() => {
    const currentIds = new Set((entity?.photos || []).map((p) => p.id))
    setHiddenIds((prev) => {
      if (prev.size === 0) return prev
      const next = new Set([...prev].filter((id) => currentIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [entity?.photos])

  const handleDelete = useCallback(async (item) => {
    if (item.kind === 'job') return
    const photo = item.photo
    setPreviewIndex(null)
    setHiddenIds((prev) => new Set(prev).add(photo.id))
    invalidatePhotoBlobCache(photo)

    const prevEntity = entity
    const prevPhotoCount = typeof entity.photoCount === 'number'
      ? entity.photoCount
      : (entity.photos || []).length
    const optimistic = {
      ...entity,
      photos: (entity.photos || []).filter((p) => p.id !== photo.id),
      photoCount: Math.max(0, prevPhotoCount - 1),
      updatedAt: new Date().toISOString(),
    }
    onEntityUpdate?.(optimistic)

    try {
      const result = await deletePhoto(getToken, entityRef, photo.id)
      if (result.notFound) return
      const updated = entityType === 'deal' ? result.deal : result.lead
      if (updated) onEntityUpdate?.(updated)
    } catch {
      invalidatePhotoBlobCache(photo)
      onEntityUpdate?.(prevEntity)
      setHiddenIds((prev) => {
        const next = new Set(prev)
        next.delete(photo.id)
        return next
      })
    }
  }, [getToken, entityRef, entityType, entity, onEntityUpdate])

  const findDisplayIndexForPhotoId = useCallback((photoId, photos) => {
    const all = dedupePhotosById(Array.isArray(photos) ? photos : [])
    const reversed = [...all].reverse()
    const visiblePhotos = reversed.filter((p) => !hiddenIds.has(p.id))
    const serverPhotoIds = new Set(visiblePhotos.map((p) => p.id))
    const pendingJobs = activeJobs.filter((j) => !j.photoId || !serverPhotoIds.has(j.photoId))
    const items = [
      ...pendingJobs.map((job) => ({ id: job.jobId })),
      ...visiblePhotos.map((photo) => ({ id: photo.id })),
    ]
    return items.findIndex((item) => item.id === photoId)
  }, [activeJobs, hiddenIds])

  const handleAnnotatorSave = useCallback((updatedEntity, { complete = true } = {}) => {
    const payload = complete
      ? {
          ...updatedEntity,
          photos: (updatedEntity.photos || []).map((p) => stripClientPhotoFields(p)),
        }
      : updatedEntity
    onEntityUpdate?.(payload)
    if (!complete) return
    const returnPhotoId = returnToPreviewPhotoIdRef.current
    setAnnotating(null)
    annotatingPhotoIdRef.current = null
    returnToPreviewPhotoIdRef.current = null
    if (returnPhotoId) {
      const idx = findDisplayIndexForPhotoId(returnPhotoId, payload.photos)
      if (idx >= 0) setPreviewIndex(idx)
    }
  }, [onEntityUpdate, findDisplayIndexForPhotoId])

  const retryAnnotation = useCallback(async (photo) => {
    if (!photo._annotationRetryPayload) return
    const { annotations, file, thumbnail } = photo._annotationRetryPayload
    try {
      const result = await savePhotoAnnotations(getToken, entityRef, {
        photo,
        annotations,
        annotatedBlob: file,
        annotatedThumbnailBlob: thumbnail,
        existingPhotos: entity.photos || [],
        onOptimistic: (optimisticPhoto) => {
          onEntityUpdate?.({
            ...entity,
            photos: updatePhotoInList(entity.photos || [], photo.id, optimisticPhoto),
          })
        },
      })
      const updated = result.entity
      onEntityUpdate?.(updated)
    } catch { /* inline retry stays */ }
  }, [getToken, entityRef, entity, onEntityUpdate])

  const galleryPreviewTitle = useMemo(() => {
    if (entityType === 'deal') return displayLeadName(lead)
    return displayLeadName(entity)
  }, [entityType, entity, lead])

  const previewItems = useMemo(
    () => displayItems.map((item) => ({
      id: item.id,
      name: galleryPreviewTitle,
      caption: photoPreviewCaption(item.photo, item.number),
      contentType: 'image/jpeg',
      photo: item.photo,
      loadBlob: async () => {
        if (item.kind === 'job') {
          const blobs = await getBlobs(item.job.jobId)
          if (blobs?.full) return blobs.full
        }
        if (item.photo._annotationSaving && item.photo._annotatedPreviewUrl?.startsWith('blob:')) {
          const res = await fetch(item.photo._annotatedPreviewUrl)
          if (res.ok) return res.blob()
        }
        return fetchPhotoPreviewBlob(
          getToken,
          item.photo,
          item.photo.updatedAt || item.photo.createdAt || '',
        )
      },
    })),
    [displayItems, galleryPreviewTitle, getToken],
  )

  const openAnnotate = (photo, { fromPreview = false } = {}) => {
    if (!photo.key || photo._annotationSaving) return
    returnToPreviewPhotoIdRef.current = fromPreview ? photo.id : null
    setPreviewIndex(null)
    const latest = (entity?.photos || []).find((p) => p.id === photo.id) || photo
    setAnnotating(latest)
  }

  const Annotator = entityType === 'deal' ? DealPhotoAnnotator : PhotoAnnotator

  const canAddPhotos = !readOnly && !!entity?.id && (entityType !== 'lead' || !photosMetadataLoading)

  return (
    <>
      <section className="lead-detail-section">
        <SectionTitle
          action={
            !readOnly ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={storageFull || !canAddPhotos}
                onClick={() => {
                  if (!entity?.id) {
                    showToast('Lead is still loading — try again in a moment', 'info')
                    return
                  }
                  setCaptureOpen(true)
                }}
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
          {failedCount > 0 && (
            <span className="text-[10px] font-normal text-red-300/80 ml-2">
              {failedCount} failed
            </span>
          )}
        </SectionTitle>
        <StorageUsageBar
          usedBytes={photosUsed}
          limitBytes={limitBytes}
          className="mb-2"
          label="Photo storage"
        />
        {photosMetadataLoading ? (
          <>
            <p className="text-xs text-white/45 py-1 mb-2">Loading photos…</p>
            <div className="lead-photo-grid" aria-busy="true" aria-label="Loading photos">
              {Array.from({ length: skeletonCount }, (_, i) => (
                <div key={`skeleton-${i}`} className="lead-photo-grid-item">
                  <PhotoSkeletonTile />
                </div>
              ))}
            </div>
          </>
        ) : displayItems.length === 0 ? (
          <p className="text-xs text-white/40 py-1">No photos yet</p>
        ) : (
          <div className="lead-photo-grid">
            {visibleItems.map((item) => (
              <div key={item.id} className="lead-photo-grid-item group relative">
                <PhotoTile
                  item={item}
                  getToken={getToken}
                  readOnly={readOnly}
                  onRetry={retry}
                  onClick={() => {
                    if (item.photo._annotationSaveFailed) {
                      retryAnnotation(item.photo)
                      return
                    }
                    const idx = displayItems.findIndex((d) => d.id === item.id)
                    setPreviewIndex(idx)
                  }}
                  onDelete={readOnly ? undefined : () => handleDelete(item)}
                />
                {item.kind === 'photo' && item.photo.annotatedKey && (
                  <span className="lead-photo-annotated-badge absolute top-1 left-1 text-[9px] px-1.5 py-0.5 rounded bg-black/50 text-white/90">
                    Annotated
                  </span>
                )}
                {!readOnly && item.kind === 'photo' && item.photo.key && (
                  <div className="lead-photo-grid-item-actions">
                    <button
                      type="button"
                      className="lead-photo-grid-action-btn lead-photo-grid-action-btn--annotate"
                      onClick={() => openAnnotate(item.photo)}
                      title="Annotate"
                      aria-label="Annotate photo"
                    >
                      <PenLine className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {canCollapse && (
          <div className="flex justify-center mt-2.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-3 text-xs"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Show fewer' : `Show all (${displayItems.length})`}
            </Button>
          </div>
        )}
      </section>

      <FilePreviewOverlay
        open={previewIndex != null}
        onClose={() => setPreviewIndex(null)}
        items={previewItems}
        initialIndex={previewIndex ?? 0}
        renderActions={!readOnly ? ({ item }) => (
          item.photo?.key ? (
            <>
              <button
                type="button"
                className="file-preview-icon-btn"
                onClick={() => openAnnotate(item.photo, { fromPreview: true })}
                aria-label="Annotate photo"
                title="Annotate"
              >
                <PenLine className="h-5 w-5" />
              </button>
              <button
                type="button"
                className="file-preview-icon-btn"
                onClick={() => handleDelete({ kind: 'photo', photo: item.photo, id: item.id })}
                aria-label="Delete photo"
                title="Delete"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </>
          ) : null
        ) : undefined}
      />

      {captureOpen && entity?.id && (
        <PhotoCaptureModal
          open
          entityType={entityType}
          entity={entity}
          pipelineId={pipelineId}
          addressLabel={entityType === 'lead' ? formatLeadAddress(entity) || entity.address || '' : ''}
          getToken={getToken}
          currentUser={currentUser}
          onClose={() => setCaptureOpen(false)}
          onEntityUpdate={onEntityUpdate}
          onPhotosAdded={async () => {
            if (entityType === 'lead' && entity?.id) {
              await logLeadPhotosAdded(getToken, entity.id, 1)
            }
          }}
        />
      )}

      {annotating && entityType === 'lead' && (
        <PhotoAnnotator
          key={annotating.id}
          open
          lead={entity}
          photo={annotating}
          getToken={getToken}
          onClose={() => setAnnotating(null)}
          onSaved={handleAnnotatorSave}
        />
      )}

      {annotating && entityType === 'deal' && (
        <DealPhotoAnnotator
          key={annotating.id}
          open
          deal={entity}
          pipelineId={pipelineId}
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
