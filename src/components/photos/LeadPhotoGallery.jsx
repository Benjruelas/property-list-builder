import { useState, useEffect, useCallback, useMemo } from 'react'
import { Camera, Loader2, Trash2, PenLine } from 'lucide-react'
import { Button } from '../ui/button'
import { leadPhotoUrl, deleteLeadPhoto, fetchLeadPhotoBlob, sumLeadPhotoBytes, LEAD_STORAGE_LIMIT_BYTES } from '@/utils/leadPhotos'
import { StorageUsageBar } from '../ui/StorageUsageBar'
import { FilePreviewOverlay } from '../ui/FilePreviewOverlay'
import { showToast } from '../ui/toast'
import { showConfirm } from '../ui/confirm-dialog'
import { PhotoMode } from './PhotoMode'
import { PhotoAnnotator } from './PhotoAnnotator'
import { cn } from '@/lib/utils'

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
  const [thumbUrls, setThumbUrls] = useState({})
  const [deletingId, setDeletingId] = useState(null)

  const photos = Array.isArray(lead?.photos) ? lead.photos : []
  const photosUsed = sumLeadPhotoBytes(photos)
  const photosStorageFull = photosUsed >= LEAD_STORAGE_LIMIT_BYTES

  const photoPreviewItems = useMemo(
    () => photos.map((photo, index) => ({
      id: photo.id,
      name: photoPreviewName(photo, index),
      contentType: photo.contentType || 'image/jpeg',
      photo,
      loadBlob: () => fetchLeadPhotoBlob(getToken, photo.key),
    })),
    [photos, getToken],
  )

  const loadThumb = useCallback(async (photo) => {
    const key = photo.thumbnailKey || photo.key
    if (!key || thumbUrls[photo.id]) return
    try {
      const token = await getToken()
      if (!token) return
      const res = await fetch(leadPhotoUrl(key), { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setThumbUrls((prev) => ({ ...prev, [photo.id]: url }))
    } catch { /* ignore */ }
  }, [getToken, thumbUrls])

  useEffect(() => {
    photos.forEach((p) => loadThumb(p))
  }, [photos, loadThumb])

  useEffect(() => () => {
    Object.values(thumbUrls).forEach((url) => {
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
    })
  }, [thumbUrls])

  const handlePhotosUploaded = (updatedLead) => {
    onLeadUpdate?.(updatedLead)
  }

  const handleDelete = async (photo) => {
    const ok = await showConfirm({
      title: 'Delete photo?',
      description: 'This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    setDeletingId(photo.id)
    try {
      const { lead: updated } = await deleteLeadPhoto(getToken, { leadId: lead.id, photoId: photo.id })
      onLeadUpdate?.(updated)
      setPreviewPhotoIndex(null)
      showToast('Photo deleted', 'success')
    } catch (e) {
      showToast(e.message || 'Delete failed', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  const handleAnnotatorSave = (updatedLead) => {
    onLeadUpdate?.(updatedLead)
    setAnnotating(null)
  }

  const openAnnotate = (photo) => {
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
            {photos.map((photo, photoIndex) => (
              <div key={photo.id} className="lead-photo-grid-item group relative">
                <button
                  type="button"
                  className="w-full aspect-square rounded-lg border border-white/10 overflow-hidden bg-white/[0.04]"
                  onClick={() => setPreviewPhotoIndex(photoIndex)}
                  title="Preview photo"
                >
                  {thumbUrls[photo.id] ? (
                    <img src={thumbUrls[photo.id]} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin opacity-40" />
                    </div>
                  )}
                </button>
                {photo.annotatedKey && (
                  <span className="absolute top-1 left-1 text-[9px] px-1.5 py-0.5 rounded bg-black/50 text-white/90">
                    Annotated
                  </span>
                )}
                {!readOnly && (
                  <>
                    <button
                      type="button"
                      className="absolute bottom-1 left-1 p-1 rounded bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => openAnnotate(photo)}
                      title="Annotate"
                    >
                      <PenLine className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className={cn(
                        'absolute top-1 right-1 p-1 rounded bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity',
                        deletingId === photo.id && 'opacity-100'
                      )}
                      onClick={() => handleDelete(photo)}
                      title="Delete"
                    >
                      {deletingId === photo.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <FilePreviewOverlay
        open={previewPhotoIndex != null}
        onClose={() => setPreviewPhotoIndex(null)}
        items={photoPreviewItems}
        initialIndex={previewPhotoIndex ?? 0}
        renderActions={!readOnly ? ({ item }) => (
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
        ) : undefined}
      />

      <PhotoMode
        open={photoModeOpen}
        lead={lead}
        getToken={getToken}
        currentUser={currentUser}
        onClose={() => setPhotoModeOpen(false)}
        onPhotosUploaded={handlePhotosUploaded}
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
