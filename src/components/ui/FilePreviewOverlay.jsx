import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Download, Loader2, X } from 'lucide-react'
import { Button } from './button'
import {
  resolvePreviewKind,
  createPreviewSource,
  readTextFromBlob,
  saveBlobToDevice,
  isMobileDevice,
  isNativeApp,
  getFilePreviewPortalContainer,
} from '@/utils/filePreview'
import { showToast } from '@/components/ui/toast'
import { ZoomableImage } from '@/components/ui/ZoomableImage'
import {
  getGalleryDragAxis,
  getGallerySwipeAction,
  shouldAllowGallerySwipe,
} from '@/utils/zoomableImage'

const GALLERY_SETTLE_MS = 220

export function FilePreviewOverlay({
  open,
  onClose,
  items = [],
  initialIndex = 0,
  renderActions,
  immersiveGallery = false,
}) {
  const [index, setIndex] = useState(initialIndex)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [blob, setBlob] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [textContent, setTextContent] = useState('')
  const [cacheVersion, setCacheVersion] = useState(0)
  const [dragX, setDragX] = useState(0)
  const [isSettling, setIsSettling] = useState(false)
  const previewCacheRef = useRef(new Map())
  const cacheGenerationRef = useRef(0)
  const activeLoadRef = useRef(0)
  const contentRef = useRef(null)
  const settleTimerRef = useRef(null)
  const swipeRef = useRef({ x: 0, y: 0, startedAt: 0, axis: null, active: false })
  const zoomRef = useRef(null)
  const [downloading, setDownloading] = useState(false)

  const item = items[index]
  const kind = item
    ? resolvePreviewKind({ contentType: item.contentType, fileName: item.name })
    : 'unsupported'
  const hasGallery = items.length > 1

  const resetCurrent = useCallback(() => {
    activeLoadRef.current += 1
    setPreviewUrl(null)
    setBlob(null)
    setTextContent('')
    setError(null)
  }, [])

  const releasePreviewCache = useCallback(() => {
    cacheGenerationRef.current += 1
    for (const entry of previewCacheRef.current.values()) {
      entry.result?.revoke?.()
    }
    previewCacheRef.current.clear()
  }, [])

  const loadPreview = useCallback(async (targetItem) => {
    const cached = previewCacheRef.current.get(targetItem)
    if (cached) return cached.promise

    const generation = cacheGenerationRef.current
    const entry = {}
    entry.promise = (async () => {
      const result = await targetItem.loadBlob()
      let loaded

      if (typeof result === 'string' && result.startsWith('data:')) {
        const { url, revoke } = createPreviewSource(result)
        loaded = { blob: null, previewUrl: url, textContent: '', revoke }
      } else if (result instanceof Blob) {
        const itemKind = resolvePreviewKind({
          contentType: targetItem.contentType || result.type,
          fileName: targetItem.name,
        })
        if (itemKind === 'text') {
          loaded = {
            blob: result,
            previewUrl: null,
            textContent: await readTextFromBlob(result),
            revoke: null,
          }
        } else {
          const { url, revoke } = createPreviewSource(result)
          loaded = { blob: result, previewUrl: url, textContent: '', revoke }
        }
      } else {
        throw new Error('Invalid file data')
      }

      if (generation !== cacheGenerationRef.current) {
        loaded.revoke?.()
        const staleError = new Error('Preview load superseded')
        staleError.name = 'AbortError'
        throw staleError
      }

      entry.result = loaded
      setCacheVersion((version) => version + 1)
      return loaded
    })().catch((loadError) => {
      if (previewCacheRef.current.get(targetItem) === entry) {
        previewCacheRef.current.delete(targetItem)
      }
      throw loadError
    })
    previewCacheRef.current.set(targetItem, entry)
    return entry.promise
  }, [])

  const cleanup = useCallback(() => {
    resetCurrent()
    releasePreviewCache()
    setPreviewUrl(null)
    setDragX(0)
    setIsSettling(false)
    if (settleTimerRef.current) {
      window.clearTimeout(settleTimerRef.current)
      settleTimerRef.current = null
    }
  }, [releasePreviewCache, resetCurrent])

  const loadCurrent = useCallback(async () => {
    if (!open || !item?.loadBlob) return
    const requestId = activeLoadRef.current + 1
    activeLoadRef.current = requestId
    const cachedResult = previewCacheRef.current.get(item)?.result
    if (cachedResult) {
      setBlob(cachedResult.blob)
      setPreviewUrl(cachedResult.previewUrl)
      setTextContent(cachedResult.textContent)
      setError(null)
      setLoading(false)
      return
    }
    setPreviewUrl(null)
    setBlob(null)
    setTextContent('')
    setError(null)
    setLoading(true)
    try {
      const result = await loadPreview(item)
      if (requestId !== activeLoadRef.current) return
      setBlob(result.blob)
      setPreviewUrl(result.previewUrl)
      setTextContent(result.textContent)
      setError(null)
    } catch (e) {
      if (requestId !== activeLoadRef.current || e?.name === 'AbortError') return
      setError(e.message || 'Could not load preview')
    } finally {
      if (requestId === activeLoadRef.current) setLoading(false)
    }
  }, [open, item, loadPreview])

  useEffect(() => {
    if (open) setIndex(Math.min(Math.max(0, initialIndex), Math.max(0, items.length - 1)))
  }, [open, initialIndex, items.length])

  useEffect(() => {
    if (!open) {
      cleanup()
      return undefined
    }
    loadCurrent()
    return undefined
  }, [open, loadCurrent, cleanup])

  useEffect(() => {
    if (!open) return undefined
    return cleanup
  }, [open, items, cleanup])

  useEffect(() => {
    if (!open || !immersiveGallery) return
    for (const neighborIndex of [index - 1, index + 1]) {
      const neighbor = items[neighborIndex]
      if (neighbor?.loadBlob) loadPreview(neighbor).catch(() => {})
    }
  }, [open, immersiveGallery, index, items, loadPreview])

  const animateToIndex = useCallback((targetIndex) => {
    if (
      targetIndex < 0
      || targetIndex >= items.length
      || targetIndex === index
      || isSettling
    ) return

    if (!immersiveGallery) {
      setIndex(targetIndex)
      return
    }

    const width = contentRef.current?.clientWidth || window.innerWidth || 1
    setIsSettling(true)
    setDragX(targetIndex > index ? -width : width)
    settleTimerRef.current = window.setTimeout(() => {
      setIndex(targetIndex)
      setDragX(0)
      setIsSettling(false)
      settleTimerRef.current = null
    }, GALLERY_SETTLE_MS)
  }, [immersiveGallery, index, isSettling, items.length])

  const goPrev = useCallback(() => {
    animateToIndex(index - 1)
  }, [animateToIndex, index])

  const goNext = useCallback(() => {
    animateToIndex(index + 1)
  }, [animateToIndex, index])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
      else if (e.key === 'ArrowLeft' && hasGallery) goPrev()
      else if (e.key === 'ArrowRight' && hasGallery) goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, goPrev, goNext, hasGallery])

  const handleTouchStart = (e) => {
    if (isSettling) return
    if (e.touches.length > 1) {
      swipeRef.current.active = false
      return
    }
    if (zoomRef.current?.isZoomed?.()) {
      swipeRef.current.active = false
      return
    }
    if (!shouldAllowGallerySwipe({ scale: 1, touchCount: e.touches.length })) {
      swipeRef.current.active = false
      return
    }
    const t = e.touches[0]
    if (!t) return
    swipeRef.current = {
      x: t.clientX,
      y: t.clientY,
      startedAt: performance.now(),
      axis: null,
      active: true,
    }
  }

  const handleTouchMove = (e) => {
    if (!immersiveGallery || !hasGallery || !swipeRef.current.active) return
    if (zoomRef.current?.isZoomed?.()) {
      swipeRef.current.active = false
      setDragX(0)
      return
    }

    const t = e.touches[0]
    if (!t) return
    const dx = t.clientX - swipeRef.current.x
    const dy = t.clientY - swipeRef.current.y
    const axis = swipeRef.current.axis || getGalleryDragAxis({ deltaX: dx, deltaY: dy })
    if (!axis) return
    swipeRef.current.axis = axis
    if (axis === 'vertical') {
      swipeRef.current.active = false
      return
    }

    e.preventDefault()
    const isPastStart = dx > 0 && index === 0
    const isPastEnd = dx < 0 && index === items.length - 1
    setDragX((isPastStart || isPastEnd) ? dx * 0.22 : dx)
  }

  const handleTouchEnd = (e) => {
    if (!hasGallery || !swipeRef.current.active) return
    if (zoomRef.current?.isZoomed?.()) {
      swipeRef.current.active = false
      return
    }
    const t = e.changedTouches[0]
    swipeRef.current.active = false
    if (!t) return
    const dx = t.clientX - swipeRef.current.x
    const dy = t.clientY - swipeRef.current.y
    const action = getGallerySwipeAction({
      deltaX: dx,
      deltaY: dy,
      elapsedMs: performance.now() - swipeRef.current.startedAt,
      canGoPrev: index > 0,
      canGoNext: index < items.length - 1,
    })

    if (action === 'prev') {
      goPrev()
    } else if (action === 'next') {
      goNext()
    } else if (immersiveGallery && dragX !== 0) {
      setIsSettling(true)
      setDragX(0)
      settleTimerRef.current = window.setTimeout(() => {
        setIsSettling(false)
        settleTimerRef.current = null
      }, GALLERY_SETTLE_MS)
    }
  }

  const handleTouchCancel = () => {
    swipeRef.current.active = false
    if (!immersiveGallery || dragX === 0) return
    setIsSettling(true)
    setDragX(0)
    settleTimerRef.current = window.setTimeout(() => {
      setIsSettling(false)
      settleTimerRef.current = null
    }, GALLERY_SETTLE_MS)
  }

  const handleDownload = async () => {
    if (downloading) return
    setDownloading(true)
    try {
      if (blob) {
        await saveBlobToDevice(blob, item?.name, {
          contentType: item?.contentType || blob.type,
          onToast: showToast,
        })
        return
      }
      if (previewUrl?.startsWith('data:')) {
        const res = await fetch(previewUrl)
        const dataBlob = await res.blob()
        await saveBlobToDevice(dataBlob, item?.name, {
          contentType: item?.contentType || dataBlob.type,
          onToast: showToast,
        })
      }
    } catch (e) {
      if (e?.name !== 'AbortError') {
        setError(e.message || 'Could not save file')
      }
    } finally {
      setDownloading(false)
    }
  }

  const downloadDisabled = loading || downloading || (!blob && !previewUrl)
  const downloadLabel = kind === 'image' && (isNativeApp() || isMobileDevice())
    ? 'Save to Photos'
    : 'Download'

  const portalTarget = getFilePreviewPortalContainer()
  if (!open || !item || !portalTarget) return null

  const showUnsupported = !loading && !error && kind === 'unsupported'
  const showImage = !loading && !error && kind === 'image' && previewUrl
  const showPdf = !loading && !error && kind === 'pdf' && previewUrl
  const showText = !loading && !error && kind === 'text' && textContent
  const footerCaption = item.caption?.trim() || ''
  void cacheVersion
  const currentPreviewContent = (
    <>
      {loading && (
        <div className="file-preview-state">
          <Loader2 className="h-8 w-8 animate-spin opacity-60" />
          <p className="text-sm opacity-60 mt-3">Loading preview…</p>
        </div>
      )}

      {error && !loading && (
        <div className="file-preview-state">
          <p className="text-sm opacity-80 mb-4">{error}</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={loadCurrent}>
              Retry
            </Button>
            {blob && (
              <Button type="button" size="sm" onClick={handleDownload} disabled={downloading}>
                {downloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                {downloadLabel}
              </Button>
            )}
          </div>
        </div>
      )}

      {showImage && (
        <ZoomableImage
          ref={zoomRef}
          src={previewUrl}
          alt={item.name}
          className="file-preview-image"
          resetKey={`${index}-${previewUrl}`}
        />
      )}

      {showPdf && (
        <iframe
          src={previewUrl}
          title={item.name}
          className="file-preview-pdf"
        />
      )}

      {showText && (
        <pre className="file-preview-text">{textContent}</pre>
      )}

      {showUnsupported && (
        <div className="file-preview-state">
          <p className="text-sm opacity-70 mb-4">Preview not available for this file type.</p>
          <Button type="button" size="sm" onClick={handleDownload} disabled={downloadDisabled}>
            {downloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            {downloadLabel}
          </Button>
        </div>
      )}
    </>
  )

  return createPortal(
    <div
      className={`file-preview-overlay${immersiveGallery ? ' file-preview-overlay--immersive' : ''}`}
      role="dialog"
      aria-label="File preview"
      aria-roledescription={hasGallery ? 'carousel' : undefined}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      <div className="file-preview-header">
        <div className="file-preview-title truncate" title={item.name}>
          {item.name}
        </div>
        <div className="file-preview-header-actions">
          {renderActions?.({ item, index, onClose })}
          <button
            type="button"
            className="file-preview-icon-btn"
            onClick={handleDownload}
            disabled={downloadDisabled}
            aria-label={downloadLabel}
            title={downloadLabel}
          >
            {downloading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
          </button>
          <button
            type="button"
            className="file-preview-icon-btn"
            onClick={onClose}
            aria-label="Close preview"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="file-preview-body">
        {hasGallery && (
          <button
            type="button"
            className="file-preview-nav file-preview-nav--prev"
            onClick={goPrev}
            disabled={index === 0 || loading}
            aria-label="Previous file"
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
        )}

        <div ref={contentRef} className="file-preview-content">
          {immersiveGallery && kind === 'image' ? (
            <div className="file-preview-carousel">
              {[index - 1, index, index + 1].map((slideIndex) => {
                if (slideIndex < 0 || slideIndex >= items.length) return null
                const isCurrent = slideIndex === index
                const cachedPreview = previewCacheRef.current.get(items[slideIndex])?.result
                const offset = slideIndex - index
                return (
                  <div
                    key={items[slideIndex].id ?? slideIndex}
                    className={`file-preview-carousel-slide${isCurrent ? ' is-current' : ''}`}
                    aria-hidden={!isCurrent}
                    style={{
                      transform: `translate3d(calc(${offset * 100}% + ${dragX}px), 0, 0)`,
                      transitionDuration: isSettling ? `${GALLERY_SETTLE_MS}ms` : '0ms',
                    }}
                  >
                    {isCurrent ? currentPreviewContent : (
                      cachedPreview?.previewUrl ? (
                        <img
                          src={cachedPreview.previewUrl}
                          alt=""
                          className="file-preview-image"
                          draggable={false}
                        />
                      ) : null
                    )}
                  </div>
                )
              })}
            </div>
          ) : currentPreviewContent}
        </div>

        {hasGallery && (
          <button
            type="button"
            className="file-preview-nav file-preview-nav--next"
            onClick={goNext}
            disabled={index === items.length - 1 || loading}
            aria-label="Next file"
          >
            <ChevronRight className="h-7 w-7" />
          </button>
        )}
      </div>

      {(hasGallery || footerCaption) && (
        <div className="file-preview-footer" aria-live="polite">
          {footerCaption ? (
            <p className="file-preview-caption">{footerCaption}</p>
          ) : null}
          {hasGallery ? (
            <div className="file-preview-counter">
              {index + 1} / {items.length}
            </div>
          ) : null}
        </div>
      )}
    </div>,
    portalTarget
  )
}
