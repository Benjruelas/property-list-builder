import { useEffect, useMemo, useState } from 'react'
import { Loader2, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { blurHashStyle } from './blurHashUtils'
import { getSignedUrl } from './photosClient'
import { JOB_STATUS } from './PhotoUploadManager'
import { getBlobs } from './photoStoreIdb'

export function PhotoTile({
  item,
  getToken,
  onRetry,
  onClick,
  onDelete,
  readOnly,
  className,
}) {
  const [sharpUrl, setSharpUrl] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [localUrl, setLocalUrl] = useState(null)

  const isJob = item.kind === 'job'
  const photo = item.photo || item
  const job = isJob ? item.job : null
  const status = job?.status
  const failed = status === JOB_STATUS.failed
  const uploading = status === JOB_STATUS.uploading || status === JOB_STATUS.queued

  const blurHash = photo?.blurHash || job?.blurHash
  const thumbKey = photo?.annotatedThumbnailKey || photo?.thumbnailKey || photo?.key

  useEffect(() => {
    let revoke = null
    let cancelled = false

    async function load() {
      if (job?.jobId) {
        const blobs = await getBlobs(job.jobId)
        if (cancelled) return
        if (blobs?.thumb) {
          const url = URL.createObjectURL(blobs.thumb)
          revoke = url
          setLocalUrl(url)
          setLoaded(true)
          return
        }
      }
      if (photo?._localThumbUrl) {
        setLocalUrl(photo._localThumbUrl)
        setLoaded(true)
        return
      }
      if (photo?._annotatedPreviewUrl?.startsWith('blob:') || photo?._annotatedPreviewUrl?.startsWith('data:')) {
        setLocalUrl(photo._annotatedPreviewUrl)
        setLoaded(true)
        return
      }
      if (!thumbKey || !getToken) return
      try {
        const url = await getSignedUrl(getToken, thumbKey, photo?.updatedAt || photo?.createdAt || '')
        if (!cancelled) setSharpUrl(url)
      } catch { /* inline retry handles failure */ }
    }

    load()
    return () => {
      cancelled = true
      if (revoke?.startsWith?.('blob:')) URL.revokeObjectURL(revoke)
    }
  }, [job?.jobId, thumbKey, getToken, photo?.updatedAt, photo?._localThumbUrl, photo?._annotatedPreviewUrl])

  const displayUrl = localUrl || sharpUrl

  return (
    <button
      type="button"
      className={cn(
        'relative aspect-square overflow-hidden rounded-md bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      onClick={() => onClick?.(item)}
      aria-label={item.label || 'Photo'}
    >
      <div
        className="absolute inset-0 scale-110 blur-xl opacity-80"
        style={blurHash ? blurHashStyle(blurHash) : undefined}
      />
      {displayUrl && (
        <img
          src={displayUrl}
          alt=""
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-300',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
          onLoad={() => setLoaded(true)}
          draggable={false}
        />
      )}
      {uploading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <Loader2 className="h-5 w-5 animate-spin text-white" />
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50 p-1">
          <button
            type="button"
            className="flex items-center gap-1 rounded bg-white/90 px-2 py-1 text-[10px] font-medium text-foreground"
            onClick={(e) => {
              e.stopPropagation()
              onRetry?.(job.jobId)
            }}
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}
      {!readOnly && onDelete && !isJob && (
        <span
          role="button"
          tabIndex={0}
          className="absolute right-1 top-1 rounded bg-black/50 px-1 text-[10px] text-white"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(item)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.stopPropagation()
              onDelete(item)
            }
          }}
        >
          ×
        </span>
      )}
      {item.number != null && (
        <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-[10px] font-medium text-white">
          {item.number}
        </span>
      )}
    </button>
  )
}
