import { useEffect, useState } from 'react'
import { Loader2, RotateCcw, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { blurHashStyle } from './blurHashUtils'
import { fetchPhotoThumbnailBlob } from './photosClient'
import { JOB_STATUS } from './PhotoUploadManager'
import { getBlobs } from './photoStoreIdb'
import { photoLog, photoLogError } from './photoDebug'

export function PhotoTile({
  item,
  getToken,
  onRetry,
  onClick,
  onDelete,
  readOnly,
  className,
}) {
  const [displayUrl, setDisplayUrl] = useState(null)
  const [loadFailed, setLoadFailed] = useState(false)

  const isJob = item.kind === 'job'
  const photo = item.photo || item
  const job = isJob ? item.job : null
  const status = job?.status
  const failed = status === JOB_STATUS.failed
  const uploading = status === JOB_STATUS.uploading || status === JOB_STATUS.queued

  const blurHash = photo?.blurHash || job?.blurHash
  const cacheVersion = photo?.updatedAt || photo?.createdAt || ''
  const hasServerThumbKey = Boolean(
    photo?.key || photo?.thumbnailKey || photo?.annotatedThumbnailKey,
  )
  const loadingThumb = !isJob
    && !uploading
    && !displayUrl
    && !loadFailed
    && !failed
    && hasServerThumbKey

  useEffect(() => {
    let objectUrl = null
    let cancelled = false
    setLoadFailed(false)
    setDisplayUrl(null)

    async function load() {
      try {
        if (job?.jobId) {
          const blobs = await getBlobs(job.jobId)
          if (cancelled) return
          if (blobs?.thumb) {
            objectUrl = URL.createObjectURL(blobs.thumb)
            setDisplayUrl(objectUrl)
            photoLog('tile.load', 'Job thumb from IDB', { jobId: job.jobId })
            return
          }
        }
        if (photo?._localThumbUrl) {
          setDisplayUrl(photo._localThumbUrl)
          return
        }
        if (photo?._annotationSaving) {
          if (photo?._annotatedPreviewUrl?.startsWith('blob:') || photo?._annotatedPreviewUrl?.startsWith('data:')) {
            setDisplayUrl(photo._annotatedPreviewUrl)
            return
          }
        }
        if (!getToken || isJob) return
        const blob = await fetchPhotoThumbnailBlob(getToken, photo, cacheVersion)
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setDisplayUrl(objectUrl)
        photoLog('tile.load', 'Server thumb loaded', { photoId: photo.id })
      } catch (e) {
        if (!cancelled) {
          setLoadFailed(true)
          photoLogError('tile.load', 'Thumb load failed', e, { photoId: photo?.id })
        }
      }
    }

    load()
    return () => {
      cancelled = true
      if (objectUrl?.startsWith?.('blob:')) URL.revokeObjectURL(objectUrl)
    }
  }, [job?.jobId, isJob, getToken, cacheVersion, photo?.id, photo?.key, photo?.annotatedKey, photo?.annotatedThumbnailKey, photo?._annotationSaving, photo?._localThumbUrl, photo?._annotatedPreviewUrl])

  return (
    <div
      className={cn(
        'relative aspect-square w-full overflow-hidden rounded-md bg-muted',
        className,
      )}
    >
      <button
        type="button"
        className="absolute inset-0 h-full w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onClick?.(item)}
        aria-label={item.label || 'Photo'}
      >
        <div
          className={cn(
            'absolute inset-0 z-0 scale-110 blur-xl transition-opacity duration-200',
            displayUrl ? 'opacity-0' : 'opacity-80',
          )}
          style={blurHash ? blurHashStyle(blurHash) : undefined}
        />
        {displayUrl && (
          <img
            src={displayUrl}
            alt=""
            className="absolute inset-0 z-[1] h-full w-full object-cover"
            onError={() => setLoadFailed(true)}
            draggable={false}
          />
        )}
        {loadingThumb && (
          <div className="absolute inset-0 z-[2] flex items-center justify-center bg-black/25">
            <Loader2 className="h-5 w-5 animate-spin text-white/80" aria-hidden />
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 z-[2] flex items-center justify-center bg-black/20">
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          </div>
        )}
        {(failed || loadFailed) && (
          <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-1 bg-black/50 p-1">
            {failed ? (
              <span
                role="presentation"
                className="flex items-center gap-1 rounded bg-white/90 px-2 py-1 text-[10px] font-medium text-foreground"
                onClick={(e) => {
                  e.stopPropagation()
                  onRetry?.(job.jobId)
                }}
              >
                <RotateCcw className="h-3 w-3" />
                Retry
              </span>
            ) : (
              <span className="text-[10px] text-white/80 text-center px-1">Missing — delete &amp; re-add</span>
            )}
          </div>
        )}
        {item.number != null && (
          <span className="absolute bottom-1 left-1 z-[3] rounded bg-black/60 px-1.5 text-[10px] font-medium text-white">
            {item.number}
          </span>
        )}
      </button>
      {!readOnly && onDelete && !isJob && (
        <button
          type="button"
          className="lead-photo-grid-action-btn lead-photo-grid-action-btn--delete z-[4]"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(item)
          }}
          aria-label="Delete photo"
          title="Delete"
        >
          <Trash2 className="h-4 w-4 md:h-[18px] md:w-[18px]" />
        </button>
      )}
    </div>
  )
}
