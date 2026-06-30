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
import { cn } from '@/lib/utils'

const SWIPE_THRESHOLD_PX = 48

export function FilePreviewOverlay({
  open,
  onClose,
  items = [],
  initialIndex = 0,
  renderActions,
}) {
  const [index, setIndex] = useState(initialIndex)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [blob, setBlob] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [textContent, setTextContent] = useState('')
  const revokeRef = useRef(null)
  const swipeRef = useRef({ x: 0, y: 0, active: false })
  const [downloading, setDownloading] = useState(false)

  const item = items[index]
  const kind = item
    ? resolvePreviewKind({ contentType: item.contentType, fileName: item.name })
    : 'unsupported'
  const hasGallery = items.length > 1

  const cleanup = useCallback(() => {
    if (revokeRef.current) {
      revokeRef.current()
      revokeRef.current = null
    }
    setPreviewUrl(null)
    setBlob(null)
    setTextContent('')
    setError(null)
  }, [])

  const loadCurrent = useCallback(async () => {
    if (!open || !item?.loadBlob) return
    cleanup()
    setLoading(true)
    try {
      const result = await item.loadBlob()
      setBlob(result instanceof Blob ? result : null)

      if (typeof result === 'string' && result.startsWith('data:')) {
        const { url, revoke } = createPreviewSource(result)
        revokeRef.current = revoke
        setPreviewUrl(url)
        setTextContent('')
      } else if (result instanceof Blob) {
        const itemKind = resolvePreviewKind({ contentType: item.contentType || result.type, fileName: item.name })
        if (itemKind === 'text') {
          const text = await readTextFromBlob(result)
          setTextContent(text)
          setPreviewUrl(null)
        } else {
          const { url, revoke } = createPreviewSource(result)
          revokeRef.current = revoke
          setPreviewUrl(url)
          setTextContent('')
        }
      } else {
        throw new Error('Invalid file data')
      }
      setError(null)
    } catch (e) {
      setError(e.message || 'Could not load preview')
    } finally {
      setLoading(false)
    }
  }, [open, item, cleanup])

  useEffect(() => {
    if (open) setIndex(Math.min(Math.max(0, initialIndex), Math.max(0, items.length - 1)))
  }, [open, initialIndex, items.length])

  useEffect(() => {
    if (!open) {
      cleanup()
      return undefined
    }
    loadCurrent()
    return cleanup
  }, [open, index, loadCurrent, cleanup])

  const goPrev = useCallback(() => {
    if (index > 0) setIndex(index - 1)
  }, [index])

  const goNext = useCallback(() => {
    if (index < items.length - 1) setIndex(index + 1)
  }, [index, items.length])

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
    const t = e.touches[0]
    if (!t) return
    swipeRef.current = { x: t.clientX, y: t.clientY, active: true }
  }

  const handleTouchEnd = (e) => {
    if (!hasGallery || !swipeRef.current.active) return
    const t = e.changedTouches[0]
    swipeRef.current.active = false
    if (!t) return
    const dx = t.clientX - swipeRef.current.x
    const dy = t.clientY - swipeRef.current.y
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy)) return
    if (dx > 0) goPrev()
    else goNext()
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

  return createPortal(
    <div
      className="file-preview-overlay"
      role="dialog"
      aria-label="File preview"
      aria-roledescription={hasGallery ? 'carousel' : undefined}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
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

        <div className="file-preview-content">
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
            <img
              src={previewUrl}
              alt={item.name}
              className="file-preview-image"
              draggable={false}
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

      {hasGallery && (
        <div className="file-preview-counter" aria-live="polite">
          {index + 1} / {items.length}
        </div>
      )}
    </div>,
    portalTarget
  )
}
