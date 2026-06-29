import { useEffect, useState } from 'react'
import { Loader2, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

const RETRY_HINT_DELAY_MS = 3000

/**
 * Gallery grid thumbnail: spinner while loading, tap-to-retry after a delay.
 */
export function PhotoGridThumbnail({
  photoId,
  thumbUrl,
  isUploading = false,
  onLoadError,
  onRetryLoad,
  className,
}) {
  const [showRetryHint, setShowRetryHint] = useState(false)

  useEffect(() => {
    if (thumbUrl || isUploading) {
      setShowRetryHint(false)
      return undefined
    }
    const timer = setTimeout(() => setShowRetryHint(true), RETRY_HINT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [thumbUrl, isUploading, photoId])

  if (thumbUrl) {
    return (
      <img
        src={thumbUrl}
        alt=""
        className={cn('w-full h-full object-cover', className)}
        onError={onLoadError}
      />
    )
  }

  const handleRetryClick = (event) => {
    if (!showRetryHint || !onRetryLoad) return
    event.stopPropagation()
    event.preventDefault()
    onRetryLoad()
  }

  return (
    <div
      className={cn(
        'w-full h-full flex flex-col items-center justify-center gap-1',
        showRetryHint && onRetryLoad && 'cursor-pointer',
        className,
      )}
      onClick={handleRetryClick}
      role={showRetryHint && onRetryLoad ? 'button' : undefined}
      tabIndex={showRetryHint && onRetryLoad ? 0 : undefined}
      onKeyDown={(event) => {
        if (!showRetryHint || !onRetryLoad) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.stopPropagation()
          event.preventDefault()
          onRetryLoad()
        }
      }}
    >
      {showRetryHint && onRetryLoad ? (
        <>
          <RotateCcw className="h-5 w-5 opacity-60" aria-hidden />
          <span className="text-[10px] text-white/50">Tap to retry</span>
        </>
      ) : (
        <Loader2 className="h-5 w-5 animate-spin opacity-40" aria-hidden />
      )}
    </div>
  )
}

export default PhotoGridThumbnail
