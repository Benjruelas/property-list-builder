import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Download, Loader2, Maximize2, Trash2 } from 'lucide-react'
import { Button } from '../ui/button'
import { showToast } from '../ui/toast'
import { showConfirm } from '../ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { useAuth } from '../../contexts/AuthContext'
import {
  fetchFormSubmissionPdfBlob,
  deleteFormSubmission,
} from '../../utils/forms'
import { saveBlobToDevice } from '@/utils/filePreview'

const RENDER_SCALE = 1.5
const FILL_ZOOM_MAX = 2.5
const FIT_TO_SCREEN_MIN = 0.35

/**
 * View a completed form PDF with the same pdf.js canvas viewer as FormFillView.
 */
export function FormCompletedView({
  title = 'Completed form',
  fileName,
  pdfKey,
  submissionId = null,
  onBack,
  onDeleted,
  canDelete = true,
}) {
  const { getToken } = useAuth()
  const [pdfDoc, setPdfDoc] = useState(null)
  const [pdfBlob, setPdfBlob] = useState(null)
  const [pageSizes, setPageSizes] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingErr, setLoadingErr] = useState(null)
  const [fillZoom, setFillZoom] = useState(1)
  const [reviewFitZoom, setReviewFitZoom] = useState(1)
  const [unscaledSize, setUnscaledSize] = useState({ w: 0, h: 0 })
  const [scrollPos, setScrollPos] = useState({ top: 0, left: 0 })
  const [reviewFitsViewport, setReviewFitsViewport] = useState(true)
  const [busy, setBusy] = useState(false)

  const scrollContainerRef = useRef(null)
  const zoomInnerRef = useRef(null)
  const fillZoomRef = useRef(1)
  const pageRefs = useRef({})
  const renderedPages = useRef(new Set())
  const inflightRenders = useRef(new Map())
  const pinchRef = useRef(null)
  const manualZoomRef = useRef(false)

  useEffect(() => {
    fillZoomRef.current = fillZoom
  }, [fillZoom])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadingErr(null)
      try {
        if (!pdfKey) throw new Error('Completed PDF is missing')
        const blob = await fetchFormSubmissionPdfBlob(getToken, pdfKey)
        if (cancelled) return
        const buf = await blob.arrayBuffer()
        if (cancelled) return
        const mod = await import('pdfjs-dist')
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default
        mod.GlobalWorkerOptions.workerSrc = workerUrl
        const doc = await mod.getDocument({ data: buf.slice(0) }).promise
        if (cancelled) { try { doc.destroy() } catch { /* ignore */ } return }
        const pages = await Promise.all(
          Array.from({ length: doc.numPages }, (_, i) => doc.getPage(i + 1)),
        )
        const sizes = pages.map((page) => {
          const vp = page.getViewport({ scale: RENDER_SCALE })
          return { width: vp.width, height: vp.height }
        })
        if (cancelled) return
        setPdfBlob(blob)
        setPdfDoc(doc)
        setPageSizes(sizes)
      } catch (e) {
        if (!cancelled) {
          console.error(e)
          setLoadingErr(e.message || 'Failed to load PDF')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
      renderedPages.current.clear()
      inflightRenders.current.clear()
    }
  }, [getToken, pdfKey])

  useEffect(() => {
    const el = zoomInnerRef.current
    if (!el) return
    const measure = () => {
      setUnscaledSize({ w: el.offsetWidth, h: el.offsetHeight })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [pageSizes.length, loading, loadingErr])

  const computeViewModeZoom = useCallback(() => {
    const scroller = scrollContainerRef.current
    const pageEl = pageRefs.current[0]?.wrapper
    const inner = zoomInnerRef.current
    if (!scroller || !pageEl || pageEl.offsetWidth < 1) return 1
    const padX = 48
    const availableW = Math.max(120, scroller.clientWidth - padX)
    const fitZoomW = availableW / pageEl.offsetWidth
    const padY = 32
    const availableH = Math.max(120, scroller.clientHeight - padY)
    let fitZoom = fitZoomW
    if (inner && inner.offsetHeight > 0) {
      fitZoom = Math.min(fitZoomW, availableH / inner.offsetHeight)
    }
    return Math.min(1, Math.max(FIT_TO_SCREEN_MIN, fitZoom))
  }, [pageSizes.length])

  const pinReviewScroll = useCallback(() => {
    const scroller = scrollContainerRef.current
    if (!scroller) return
    const maxLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth)
    const left = maxLeft > 0 ? Math.round(maxLeft / 2) : 0
    scroller.scrollTop = 0
    scroller.scrollLeft = left
    setScrollPos({ top: 0, left })
  }, [])

  const applyReviewFit = useCallback(() => {
    pinReviewScroll()
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const z = computeViewModeZoom()
        setFillZoom(z)
        fillZoomRef.current = z
        setReviewFitZoom(z)
        requestAnimationFrame(() => pinReviewScroll())
      })
    })
  }, [computeViewModeZoom, pinReviewScroll])

  const resetFillView = useCallback(() => {
    manualZoomRef.current = false
    applyReviewFit()
  }, [applyReviewFit])

  const renderPage = useCallback(async (pageIndex, force = false) => {
    if (!pdfDoc) return
    if (force) renderedPages.current.delete(pageIndex)
    if (renderedPages.current.has(pageIndex)) return
    if (inflightRenders.current.has(pageIndex)) return inflightRenders.current.get(pageIndex)
    const canvas = pageRefs.current[pageIndex]?.canvas
    if (!canvas) return
    const promise = (async () => {
      try {
        const page = await pdfDoc.getPage(pageIndex + 1)
        const vp = page.getViewport({ scale: RENDER_SCALE })
        canvas.width = vp.width
        canvas.height = vp.height
        const ctx = canvas.getContext('2d')
        await page.render({ canvasContext: ctx, viewport: vp }).promise
        renderedPages.current.add(pageIndex)
      } catch (e) {
        console.warn('completed form render failed', pageIndex, e.message)
      } finally {
        inflightRenders.current.delete(pageIndex)
      }
    })()
    inflightRenders.current.set(pageIndex, promise)
    return promise
  }, [pdfDoc])

  const redrawRenderedPages = useCallback(async () => {
    const pages = [...renderedPages.current]
    for (const pageIndex of pages) {
      await renderPage(pageIndex, true)
    }
  }, [renderPage])

  useEffect(() => {
    if (!pdfDoc || loading || !pageSizes.length) return
    renderPage(0)
  }, [pdfDoc, loading, pageSizes.length, renderPage])

  useEffect(() => {
    if (!pdfDoc || !pageSizes.length) return
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const idx = Number(entry.target.getAttribute('data-page-index'))
          if (!Number.isNaN(idx)) renderPage(idx)
        }
      }
    }, { rootMargin: '400px 0px' })
    for (let i = 0; i < pageSizes.length; i++) {
      const el = pageRefs.current[i]?.wrapper
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [pdfDoc, pageSizes, renderPage])

  useEffect(() => {
    if (loading || loadingErr || !pdfDoc || !pageSizes.length) return
    let cancelled = false
    const refit = async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      if (cancelled) return
      await renderPage(0)
      if (cancelled) return
      const z = computeViewModeZoom()
      if (Math.abs(z - fillZoomRef.current) <= 0.02) return
      setFillZoom(z)
      fillZoomRef.current = z
      setReviewFitZoom(z)
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      if (cancelled) return
      await redrawRenderedPages()
    }
    refit()
    const scroller = scrollContainerRef.current
    if (!scroller) return () => { cancelled = true }
    const ro = new ResizeObserver(() => {
      if (cancelled) return
      requestAnimationFrame(() => { refit() })
    })
    ro.observe(scroller)
    return () => {
      cancelled = true
      ro.disconnect()
    }
  }, [loading, loadingErr, pdfDoc, pageSizes.length, unscaledSize.w, unscaledSize.h, computeViewModeZoom, renderPage, redrawRenderedPages])

  useEffect(() => {
    if (!manualZoomRef.current) return
    if (!pdfDoc || renderedPages.current.size === 0) return
    manualZoomRef.current = false
    const t = window.setTimeout(() => { redrawRenderedPages() }, 80)
    return () => window.clearTimeout(t)
  }, [fillZoom, pdfDoc, redrawRenderedPages])

  // Pinch / Ctrl+wheel zoom
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    const clampZoom = (z) => Math.min(FILL_ZOOM_MAX, Math.max(FIT_TO_SCREEN_MIN, z))

    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        pinchRef.current = { d0: dist(e.touches[0], e.touches[1]), z0: fillZoomRef.current }
      }
    }
    const onTouchMove = (e) => {
      if (e.touches.length !== 2) return
      if (!pinchRef.current) {
        pinchRef.current = { d0: dist(e.touches[0], e.touches[1]), z0: fillZoomRef.current }
      }
      const d0 = pinchRef.current.d0
      if (d0 < 4) return
      e.preventDefault()
      const scale = dist(e.touches[0], e.touches[1]) / d0
      const next = clampZoom(pinchRef.current.z0 * scale)
      manualZoomRef.current = true
      setFillZoom(next)
      fillZoomRef.current = next
    }
    const onTouchEnd = () => { pinchRef.current = null }
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const factor = e.deltaY > 0 ? 0.92 : 1.08
      const next = clampZoom(fillZoomRef.current * factor)
      manualZoomRef.current = true
      setFillZoom(next)
      fillZoomRef.current = next
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchEnd, { passive: true })
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
      el.removeEventListener('wheel', onWheel)
    }
  }, [pageSizes.length, loading, loadingErr])

  const viewFitReady = unscaledSize.w > 0 && unscaledSize.h > 0

  useEffect(() => {
    if (!viewFitReady) return
    const scroller = scrollContainerRef.current
    if (!scroller) return
    const measure = () => {
      const contentH = unscaledSize.h * fillZoom
      const contentW = unscaledSize.w * fillZoom
      const pad = 48
      const fitsH = !contentH || contentH <= scroller.clientHeight - pad
      const fitsW = !contentW || contentW <= scroller.clientWidth - pad
      setReviewFitsViewport(fitsH && fitsW)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(scroller)
    return () => ro.disconnect()
  }, [viewFitReady, unscaledSize.h, unscaledSize.w, fillZoom])

  useEffect(() => {
    if (!viewFitReady) return
    const id = requestAnimationFrame(() => pinReviewScroll())
    return () => cancelAnimationFrame(id)
  }, [viewFitReady, fillZoom, unscaledSize.w, unscaledSize.h, reviewFitsViewport, pinReviewScroll])

  const needsViewReset = useMemo(() => {
    if (Math.abs(fillZoom - reviewFitZoom) > 0.05) return true
    if (scrollPos.top > 2 || scrollPos.left > 2) return true
    return false
  }, [fillZoom, reviewFitZoom, scrollPos.left, scrollPos.top])

  const handleScroll = (e) => {
    const t = e.currentTarget
    setScrollPos({ top: t.scrollTop, left: t.scrollLeft })
  }

  const handleDownload = async () => {
    if (!pdfBlob || busy) return
    setBusy(true)
    try {
      await saveBlobToDevice(pdfBlob, fileName || `${title}.pdf`, {
        contentType: 'application/pdf',
        onToast: showToast,
      })
    } catch (e) {
      if (e?.name !== 'AbortError') {
        showToast(e?.message || 'Could not save PDF', 'error')
      }
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (busy || !canDelete) return
    const ok = await showConfirm({
      title: 'Delete completed form?',
      description: 'This permanently removes the completed PDF. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      await deleteFormSubmission(getToken, { submissionId, pdfKey })
      showToast('Completed form deleted', 'success')
      onDeleted?.()
      onBack?.()
    } catch (e) {
      showToast(e.message || 'Failed to delete', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="form-fill-root form-fill-layout-bottom-dock flex flex-col flex-1 min-h-0">
      <header
        className="form-fill-header form-fill-header--minimal shrink-0 border-b border-white/20 px-4 py-3 form-fill-header--auth"
        style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }}
      >
        <div className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-2 min-h-[2.5rem]">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            title="Back"
            aria-label="Back"
            className="form-fill-icon-btn shrink-0"
            disabled={busy}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold truncate text-center min-w-0">
            {title}
          </h1>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownload}
              disabled={busy || loading || !pdfBlob}
              title="Download PDF"
              aria-label="Download PDF"
              className="form-fill-icon-btn"
            >
              <Download className="h-4 w-4" />
            </Button>
            {canDelete ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleDelete}
                disabled={busy || loading}
                title="Delete completed form"
                aria-label="Delete completed form"
                className="form-fill-icon-btn"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="fill-scroll-container scrollbar-hide flex-1 min-h-0 overscroll-behavior-contain bg-gray-200/50 p-4 overflow-y-auto overflow-x-auto"
        style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y' }}
      >
        {loading && (
          <div className="flex items-center justify-center py-20 text-sm text-gray-600">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading PDF…
          </div>
        )}
        {loadingErr && (
          <div className="text-center py-20 text-sm text-red-600">{loadingErr}</div>
        )}

        {!loading && !loadingErr && pageSizes.length > 0 && (
          <div
            className={cn(
              viewFitReady && 'form-fill-fit-frame',
              viewFitReady && (reviewFitsViewport
                ? 'form-fill-fit-frame--fits'
                : 'form-fill-fit-frame--scroll'),
            )}
          >
            <div
              className={cn(viewFitReady && 'form-fill-fit-stage')}
              style={
                viewFitReady
                  ? {
                      width: unscaledSize.w * fillZoom,
                      minHeight: unscaledSize.h * fillZoom,
                    }
                  : undefined
              }
            >
              <div
                ref={zoomInnerRef}
                className={cn('form-fill-zoom-inner space-y-4', !viewFitReady && 'w-full')}
                style={{
                  transform: `scale(${fillZoom})`,
                  transformOrigin: 'top left',
                  width: viewFitReady ? unscaledSize.w : undefined,
                }}
              >
                {pageSizes.map((size, pageIndex) => (
                  <div
                    key={pageIndex}
                    ref={(el) => {
                      pageRefs.current[pageIndex] = pageRefs.current[pageIndex] || {}
                      pageRefs.current[pageIndex].wrapper = el
                    }}
                    data-page-index={pageIndex}
                    className="pdf-page-wrapper relative mx-auto bg-white shadow-sm"
                    style={{
                      width: '100%',
                      maxWidth: `${size.width}px`,
                      aspectRatio: `${size.width} / ${size.height}`,
                      containerType: 'size',
                    }}
                  >
                    <canvas
                      ref={(el) => {
                        pageRefs.current[pageIndex] = pageRefs.current[pageIndex] || {}
                        pageRefs.current[pageIndex].canvas = el
                      }}
                      style={{ width: '100%', height: '100%', display: 'block' }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="form-fill-footer form-fill-footer--view shrink-0" aria-label="Form actions">
        <div className="form-fill-footer-inner form-fill-footer-inner--actions">
          {needsViewReset ? (
            <Button
              variant="outline"
              onClick={resetFillView}
              className="share-dialog-btn form-fill-action-bar-btn form-fill-footer-btn"
              title="Reset view"
              disabled={busy}
            >
              <Maximize2 className="h-4 w-4 shrink-0" />
              <span className="form-fill-footer-btn-label">Reset</span>
            </Button>
          ) : null}
          <Button
            variant="outline"
            onClick={handleDownload}
            className="share-dialog-btn form-fill-action-bar-btn form-fill-footer-btn"
            disabled={busy || loading || !pdfBlob}
          >
            <Download className="h-4 w-4 shrink-0" />
            <span className="form-fill-footer-btn-label">Download</span>
          </Button>
          {canDelete ? (
            <Button
              variant="outline"
              onClick={handleDelete}
              className="share-dialog-btn form-fill-action-bar-btn form-fill-footer-btn"
              disabled={busy || loading}
            >
              <Trash2 className="h-4 w-4 shrink-0" />
              <span className="form-fill-footer-btn-label">Delete</span>
            </Button>
          ) : null}
        </div>
      </footer>
    </div>
  )
}

export default FormCompletedView
