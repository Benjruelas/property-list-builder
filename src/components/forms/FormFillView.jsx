import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Send, Loader2, CheckCircle2 } from 'lucide-react'
import { Button } from '../ui/button'
import { showToast } from '../ui/toast'
import { cn } from '@/lib/utils'
import { useAuth } from '../../contexts/AuthContext'
import { downloadFormPdf, bytesToBase64, downloadPublicFormPdf, submitPublicForm } from '../../utils/forms'
import { buildLegalConsentPayload } from '../../legal/legalMeta'
import { SendFormDialog } from './SendFormDialog'
import { SignaturePadModal } from './SignaturePadModal'
import { resolveFormUiLayout } from './formFillLayout'
import { FormFillChrome } from './FormFillChrome'

/** Where field centers sit in the viewport during tour navigation (stable “lane”). */
const VIEW_ANCHOR_X = 0.5
const VIEW_ANCHOR_Y = 0.38
const RENDER_SCALE = 1.5
/** Pinch / Ctrl+scroll zoom: 1 = default fit, higher = more magnification */
const FILL_ZOOM_MIN = 1
const FILL_ZOOM_MAX = 2.5
/** Auto-fit can scale below 1 so the full form fits on screen for review */
const FIT_TO_SCREEN_MIN = 0.35
/** Auto-focus zoom when stepping between fields */
const FILL_FOCUS_ZOOM_MIN = 1.45
const FILL_FOCUS_ZOOM_MAX = 2.35

export function FormFillView({
  template,
  onBack,
  mode = 'authenticated',
  publicToken,
  onSubmitted,
  onSubmittingChange,
  initialValues,
  lockedFieldIds,
  lead = null,
  leads = [],
  onFormSent,
  teams = [],
  teamMembership = null,
  requiresSubmitterEmail = false,
  /** When set, Send opens confirm callback instead of SendFormDialog (preview-before-send). */
  confirmMode = false,
  onConfirmSend = null,
  confirmLabel = 'Send',
  /** Optional: report field values upward (e.g. send preview step persistence). */
  onValuesChange = null,
}) {
  const isPublic = mode === 'public'
  const { getToken } = useAuth()

  const effectiveLockedSet = useMemo(() => {
    const ids = Array.isArray(lockedFieldIds) ? lockedFieldIds : []
    return new Set(ids)
  }, [lockedFieldIds])

  const lockedFieldKey = useMemo(
    () => [...effectiveLockedSet].sort().join('|'),
    [effectiveLockedSet]
  )
  const [pdfBuffer, setPdfBuffer] = useState(null)
  const [pdfDoc, setPdfDoc] = useState(null)
  const [pageSizes, setPageSizes] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingErr, setLoadingErr] = useState(null)
  const [values, setValues] = useState(() => ({ ...(initialValues || {}) }))
  const [sigOpen, setSigOpen] = useState(false)
  const [sigFieldId, setSigFieldId] = useState(null)
  const [sendOpen, setSendOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [legalAccepted, setLegalAccepted] = useState(false)
  const [submitterEmail, setSubmitterEmail] = useState('')
  /** Open in view mode; enter fill mode when the user taps a field. */
  const [fillMode, setFillMode] = useState(false)

  const scrollContainerRef = useRef(null)
  const zoomInnerRef = useRef(null)
  const fillZoomRef = useRef(1)
  const pinchRef = useRef(null)
  const lastFocusedFieldRef = useRef(null)
  const formFocusZoomRef = useRef(null)
  const manualZoomRef = useRef(false)
  const pageRefs = useRef({})
  const renderedPages = useRef(new Set())
  const inflightRenders = useRef(new Map())
  const workerRef = useRef(null)

  const [fillZoom, setFillZoom] = useState(1)
  const [reviewFitZoom, setReviewFitZoom] = useState(1)
  const [unscaledSize, setUnscaledSize] = useState({ w: 0, h: 0 })
  const [scrollPos, setScrollPos] = useState({ top: 0, left: 0 })
  const [reviewFitsViewport, setReviewFitsViewport] = useState(true)

  // Natural reading order: page → y → x.
  const orderedFields = useMemo(() => {
    return [...(template?.fields || [])].sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page
      if (a.y !== b.y) return a.y - b.y
      return a.x - b.x
    })
  }, [template?.fields])

  const activeTourFields = useMemo(
    () => orderedFields.filter((f) => !effectiveLockedSet.has(f.id)),
    [orderedFields, effectiveLockedSet]
  )

  const [tourStep, setTourStep] = useState(0)
  const isSendStep = fillMode && tourStep >= activeTourFields.length
  const currentField = fillMode && !isSendStep ? activeTourFields[tourStep] : null

  useEffect(() => {
    if (!initialValues || typeof initialValues !== 'object') return
    setValues((prev) => {
      const merged = { ...initialValues }
      for (const [key, val] of Object.entries(prev)) {
        if (!effectiveLockedSet.has(key)) merged[key] = val
      }
      return merged
    })
  }, [initialValues, lockedFieldKey, effectiveLockedSet])

  useEffect(() => {
    onValuesChange?.(values)
  }, [values, onValuesChange])

  useEffect(() => {
    if (!isPublic || effectiveLockedSet.size === 0 || !activeTourFields.length) return
    const firstOpen = activeTourFields.findIndex((f) => {
      const v = initialValues?.[f.id] ?? values[f.id]
      if (f.type === 'checkbox') return !v
      return typeof v === 'string' ? !v.trim() : !v
    })
    if (firstOpen >= 0) setTourStep(firstOpen)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- jump once when prefill loads
  }, [initialValues, isPublic, effectiveLockedSet.size])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadingErr(null)
      try {
        const mod = await import('pdfjs-dist')
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default
        mod.GlobalWorkerOptions.workerSrc = workerUrl
        let buf
        if (isPublic) {
          if (!publicToken) throw new Error('Form link is missing')
          buf = await downloadPublicFormPdf(publicToken)
        } else {
          if (!template?.originalPdfKey) throw new Error('Template has no PDF source')
          buf = await downloadFormPdf(getToken, template.originalPdfKey)
        }
        if (cancelled) return
        const doc = await mod.getDocument({ data: buf.slice(0) }).promise
        if (cancelled) { try { doc.destroy() } catch { /* ignore */ } return }
        const pages = await Promise.all(
          Array.from({ length: doc.numPages }, (_, i) => doc.getPage(i + 1))
        )
        const sizes = pages.map((page) => {
          const vp = page.getViewport({ scale: RENDER_SCALE })
          return { width: vp.width, height: vp.height }
        })
        if (cancelled) return
        setPdfBuffer(buf)
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
      if (workerRef.current) {
        try { workerRef.current.terminate() } catch { /* ignore */ }
        workerRef.current = null
      }
      renderedPages.current.clear()
      inflightRenders.current.clear()
    }
  }, [template?.originalPdfKey, getToken, isPublic, publicToken])

  useEffect(() => {
    fillZoomRef.current = fillZoom
  }, [fillZoom])

  // Measure the unscaled PDF stack (before CSS transform) so we can extend scroll when zoomed in.
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

  // Pinch-to-zoom and Ctrl/Cmd+wheel; prevent two-finger scroll from being eaten without updating zoom.
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    const clampZoom = (z) => Math.min(FILL_ZOOM_MAX, Math.max(FILL_ZOOM_MIN, z))

    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        const a = e.touches[0]
        const b = e.touches[1]
        pinchRef.current = { d0: dist(a, b), z0: fillZoomRef.current }
      }
    }
    const onTouchMove = (e) => {
      if (e.touches.length !== 2) return
      if (!pinchRef.current) {
        const a = e.touches[0]
        const b = e.touches[1]
        pinchRef.current = { d0: dist(a, b), z0: fillZoomRef.current }
      }
      const d0 = pinchRef.current.d0
      if (d0 < 4) return
      e.preventDefault()
      const a = e.touches[0]
      const b = e.touches[1]
      const d1 = dist(a, b)
      const { z0 } = pinchRef.current
      const next = clampZoom(z0 * (d1 / d0))
      manualZoomRef.current = true
      formFocusZoomRef.current = next
      fillZoomRef.current = next
      setFillZoom(next)
    }
    const onTouchEnd = () => {
      pinchRef.current = null
    }
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      manualZoomRef.current = true
      setFillZoom((z) => {
        const next = clampZoom(z - e.deltaY * 0.0045)
        formFocusZoomRef.current = next
        fillZoomRef.current = next
        return next
      })
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

  const computeViewModeZoom = useCallback(() => {
    const scroller = scrollContainerRef.current
    const pageEl = pageRefs.current[0]?.wrapper
    const inner = zoomInnerRef.current
    if (!scroller || !pageEl || pageEl.offsetWidth < 1) return 1
    // Match scroller padding (p-4 = 32px) plus a little slack so fit doesn't leave horizontal overflow.
    const padX = 48
    const availableW = Math.max(120, scroller.clientWidth - padX)
    const fitZoomW = availableW / pageEl.offsetWidth
    if (!isPublic) {
      // In-panel view: fit page width; never upscale above 1 (avoids blank canvas + overflow).
      return Math.min(1, Math.max(FIT_TO_SCREEN_MIN, fitZoomW))
    }
    const padY = 32
    const availableH = Math.max(120, scroller.clientHeight - padY)
    let fitZoom = fitZoomW
    if (inner && inner.offsetHeight > 0) {
      fitZoom = Math.min(fitZoomW, availableH / inner.offsetHeight)
    }
    return Math.min(FILL_ZOOM_MAX, Math.max(FIT_TO_SCREEN_MIN, fitZoom))
  }, [isPublic, pageSizes.length])

  /** After fit/reset: top of form, horizontally centered in the scroller when wider than the viewport. */
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
        requestAnimationFrame(() => {
          pinReviewScroll()
        })
      })
    })
  }, [computeViewModeZoom, pinReviewScroll])

  const resetFillView = useCallback(() => {
    lastFocusedFieldRef.current = null
    formFocusZoomRef.current = null
    manualZoomRef.current = false
    if (fillMode) {
      requestAnimationFrame(() => {
        setFillZoom(1)
        fillZoomRef.current = 1
        requestAnimationFrame(() => {
          pinReviewScroll()
        })
      })
      return
    }
    applyReviewFit()
  }, [applyReviewFit, fillMode, pinReviewScroll])

  const getFieldMetrics = useCallback((field, zoom) => {
    const pageEl = pageRefs.current[field.page]?.wrapper
    if (!pageEl) return null
    const z = zoom ?? fillZoomRef.current
    const pageTop = pageEl.offsetTop
    const pageLeft = pageEl.offsetLeft
    const pw = pageEl.offsetWidth
    const ph = pageEl.offsetHeight
    const left = (pageLeft + field.x * pw) * z
    const top = (pageTop + field.y * ph) * z
    const width = field.width * pw * z
    const height = field.height * ph * z
    return {
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      centerX: left + width / 2,
      centerY: top + height / 2,
    }
  }, [])

  const computeFieldFocusZoom = useCallback((field, pageEl, scroller) => {
    const pw = pageEl.offsetWidth
    const ph = pageEl.offsetHeight
    if (pw < 1 || ph < 1) return FILL_FOCUS_ZOOM_MIN

    const fieldW = Math.max(field.width * pw, 28)
    const fieldH = Math.max(field.height * ph, 18)
    const viewW = Math.max(scroller.clientWidth * 0.72, 240)
    const viewH = Math.max(scroller.clientHeight * 0.5, 200)

    const zoomW = viewW / fieldW
    const zoomH = viewH / fieldH
    return Math.min(
      FILL_FOCUS_ZOOM_MAX,
      Math.max(FILL_FOCUS_ZOOM_MIN, Math.min(zoomW, zoomH))
    )
  }, [])

  const resolveFocusZoom = useCallback((field, pageEl, scroller, prevField) => {
    const pageChanged = !!prevField && prevField.page !== field.page
    if (pageChanged) formFocusZoomRef.current = null

    if (formFocusZoomRef.current != null) return formFocusZoomRef.current

    const idealZoom = computeFieldFocusZoom(field, pageEl, scroller)
    formFocusZoomRef.current = idealZoom
    return idealZoom
  }, [computeFieldFocusZoom])

  /**
   * Pan along the straight vector from the previous field center to the next.
   * If the previous field was anchored in the viewport, the next field lands
   * in the same spot — no recentre oscillation.
   */
  const scrollLinearToField = useCallback((fromField, toField, zoom) => {
    const scroller = scrollContainerRef.current
    const toMetrics = getFieldMetrics(toField, zoom)
    if (!scroller || !toMetrics) return

    let targetLeft = scroller.scrollLeft
    let targetTop = scroller.scrollTop

    if (!fromField) {
      targetLeft = toMetrics.centerX - scroller.clientWidth * VIEW_ANCHOR_X
      targetTop = toMetrics.centerY - scroller.clientHeight * VIEW_ANCHOR_Y
    } else {
      const fromMetrics = getFieldMetrics(fromField, zoom)
      if (!fromMetrics) return
      const deltaX = toMetrics.centerX - fromMetrics.centerX
      const deltaY = toMetrics.centerY - fromMetrics.centerY
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return
      targetLeft = scroller.scrollLeft + deltaX
      targetTop = scroller.scrollTop + deltaY
    }

    const maxLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth)
    const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    targetLeft = Math.min(maxLeft, Math.max(0, targetLeft))
    targetTop = Math.min(maxTop, Math.max(0, targetTop))

    const deltaMag = Math.hypot(targetLeft - scroller.scrollLeft, targetTop - scroller.scrollTop)
    scroller.scrollTo({
      left: targetLeft,
      top: targetTop,
      behavior: deltaMag < 3 ? 'auto' : 'smooth',
    })
  }, [getFieldMetrics])

  const handleScrollContainerScroll = useCallback((e) => {
    const t = e.currentTarget
    setScrollPos({ top: t.scrollTop, left: t.scrollLeft })
  }, [])

  const needsViewReset = useMemo(() => {
    if (fillMode) {
      if (Math.abs(fillZoom - 1) > 0.05) return true
      if (scrollPos.top > 2 || scrollPos.left > 2) return true
      return false
    }
    if (Math.abs(fillZoom - reviewFitZoom) > 0.05) return true
    if (scrollPos.top > 2 || scrollPos.left > 2) return true
    return false
  }, [fillMode, fillZoom, reviewFitZoom, scrollPos.left, scrollPos.top])

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
        console.warn('fill render failed', pageIndex, e.message)
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

  // Render the first page immediately; other pages load via intersection observer.
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

  const fieldsByPage = useMemo(() => {
    const m = new Map()
    for (const f of (template.fields || [])) {
      const arr = m.get(f.page) || []
      arr.push(f)
      m.set(f.page, arr)
    }
    return m
  }, [template.fields])

  const setValue = useCallback((id, v) => {
    if (effectiveLockedSet.has(id)) return
    setValues((prev) => ({ ...prev, [id]: v }))
  }, [effectiveLockedSet])

  const openSigForCurrent = useCallback(() => {
    if (!currentField) return
    setSigFieldId(currentField.id)
    setSigOpen(true)
  }, [currentField])

  const handleSigSave = useCallback((dataUrl) => {
    if (sigFieldId) setValue(sigFieldId, dataUrl)
    setSigOpen(false)
    setSigFieldId(null)
  }, [setValue, sigFieldId])

  const isFieldFilled = useCallback((f, v) => {
    if (!f) return false
    if (f.type === 'checkbox') return !!v
    return typeof v === 'string' ? !!v.trim() : !!v
  }, [])

  const validateRequired = useCallback(() => {
    const missing = []
    for (const f of (template.fields || [])) {
      if (!f.required) continue
      if (!isFieldFilled(f, values[f.id])) {
        missing.push(f.label || f.type)
      }
    }
    return missing
  }, [isFieldFilled, template.fields, values])

  const goPrev = useCallback(() => {
    setTourStep((s) => Math.max(0, s - 1))
  }, [])

  // Jump tour step when user clicks/tabs into any field (fill mode only).
  const enterFillMode = useCallback((fieldId) => {
    if (fieldId && effectiveLockedSet.has(fieldId)) return
    lastFocusedFieldRef.current = null
    formFocusZoomRef.current = null
    setFillMode(true)
    const idx = fieldId
      ? activeTourFields.findIndex((f) => f.id === fieldId)
      : 0
    if (idx >= 0) setTourStep(idx)
  }, [activeTourFields, effectiveLockedSet])

  const exitFillMode = useCallback(() => {
    setFillMode(false)
    formFocusZoomRef.current = null
    lastFocusedFieldRef.current = null
    applyReviewFit()
  }, [applyReviewFit])

  const setStepForField = useCallback((fieldId) => {
    if (effectiveLockedSet.has(fieldId)) return
    if (!fillMode) {
      enterFillMode(fieldId)
      return
    }
    const idx = activeTourFields.findIndex((f) => f.id === fieldId)
    if (idx >= 0) setTourStep(idx)
  }, [activeTourFields, enterFillMode, fillMode, effectiveLockedSet])

  // View mode: scale the full form to fit the panel viewport.
  useEffect(() => {
    if (fillMode || loading || loadingErr || !pdfDoc || !pageSizes.length) return
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
  }, [fillMode, loading, loadingErr, pdfDoc, pageSizes.length, unscaledSize.w, unscaledSize.h, computeViewModeZoom, renderPage, redrawRenderedPages])

  // Redraw canvases after view-mode zoom changes (CSS transform blanks PDF canvases until repaint).
  useEffect(() => {
    if (fillMode || loading || !pdfDoc || renderedPages.current.size === 0) return
    if (manualZoomRef.current) return
    const t = window.setTimeout(() => { redrawRenderedPages() }, 80)
    return () => window.clearTimeout(t)
  }, [fillZoom, fillMode, loading, pdfDoc, redrawRenderedPages])

  const allFieldsFilled = useMemo(() => {
    const fields = template.fields || []
    if (!fields.length) return false
    return fields.every((f) => isFieldFilled(f, values[f.id]))
  }, [isFieldFilled, template.fields, values])

  // Linear pan from previous field → current field (fill mode only).
  useEffect(() => {
    if (!fillMode || !currentField || loading || loadingErr || !pdfDoc) return
    if (isPublic && allFieldsFilled) return
    const scroller = scrollContainerRef.current
    const pageEl = pageRefs.current[currentField.page]?.wrapper
    if (!scroller || !pageEl) return

    let cancelled = false
    const fromField = lastFocusedFieldRef.current

    ;(async () => {
      await renderPage(currentField.page)
      if (cancelled) return

      const targetZoom = resolveFocusZoom(currentField, pageEl, scroller, fromField)
      const zoomChanged = Math.abs(targetZoom - fillZoomRef.current) > 0.02

      if (zoomChanged) {
        setFillZoom(targetZoom)
        fillZoomRef.current = targetZoom
        await new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        })
        if (cancelled) return
        await renderPage(currentField.page, true)
        if (cancelled) return
      }

      const pageChanged = fromField && fromField.page !== currentField.page
      if (!fromField || pageChanged || zoomChanged) {
        scrollLinearToField(null, currentField, fillZoomRef.current)
      } else {
        scrollLinearToField(fromField, currentField, fillZoomRef.current)
      }
      lastFocusedFieldRef.current = currentField
    })()

    return () => { cancelled = true }
  }, [allFieldsFilled, fillMode, isPublic, currentField, loading, loadingErr, pdfDoc, renderPage, resolveFocusZoom, scrollLinearToField])

  // Redraw canvases only after manual pinch/wheel zoom (CSS transform + canvas compositing bug).
  useEffect(() => {
    if (!manualZoomRef.current) return
    if (!pdfDoc || renderedPages.current.size === 0) return
    manualZoomRef.current = false
    const t = window.setTimeout(() => { redrawRenderedPages() }, 80)
    return () => window.clearTimeout(t)
  }, [fillZoom, pdfDoc, redrawRenderedPages])

  const flattenPdf = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!pdfBuffer) return reject(new Error('PDF not loaded'))
      const worker = new Worker(
        new URL('../../workers/pdfFlatten.worker.js', import.meta.url),
        { type: 'module' }
      )
      workerRef.current = worker
      worker.onmessage = (ev) => {
        const m = ev.data
        if (m?.type === 'done') {
          try { worker.terminate() } catch { /* ignore */ }
          if (workerRef.current === worker) workerRef.current = null
          resolve(m.bytes)
        } else if (m?.type === 'error') {
          try { worker.terminate() } catch { /* ignore */ }
          if (workerRef.current === worker) workerRef.current = null
          reject(new Error(m.message || 'Flatten failed'))
        }
      }
      worker.onerror = (err) => {
        try { worker.terminate() } catch { /* ignore */ }
        if (workerRef.current === worker) workerRef.current = null
        reject(new Error(err.message || 'Worker error'))
      }
      const bufferCopy = pdfBuffer.slice(0)
      worker.postMessage(
        {
          type: 'flatten',
          pdfBuffer: bufferCopy,
          fields: template.fields || [],
          values,
        },
        [bufferCopy]
      )
    })
  }, [pdfBuffer, template.fields, values])

  const stripValuesForSubmit = useCallback(() => {
    const strippedValues = {}
    const fieldsById = new Map((template.fields || []).map((f) => [f.id, f]))
    for (const [fieldId, value] of Object.entries(values || {})) {
      const field = fieldsById.get(fieldId)
      if (field && field.type === 'signature') {
        strippedValues[fieldId] = value ? '[signature]' : ''
      } else if (typeof value === 'boolean') {
        strippedValues[fieldId] = value
      } else {
        strippedValues[fieldId] = value == null ? '' : String(value)
      }
    }
    return strippedValues
  }, [template.fields, values])

  const handlePublicSubmit = useCallback(async () => {
    if (!legalAccepted) {
      showToast('Please accept the terms before submitting.', 'error')
      return
    }
    if (requiresSubmitterEmail) {
      const email = String(submitterEmail || '').trim()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showToast('Enter an email to receive your completed form PDF', 'error')
        return
      }
    }
    const missing = validateRequired()
    if (missing.length > 0) {
      showToast(
        `There are required fields still empty: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}`,
        'error'
      )
      const firstMissingIdx = activeTourFields.findIndex(
        (f) => f.required && !isFieldFilled(f, values[f.id])
      )
      if (firstMissingIdx >= 0) setTourStep(firstMissingIdx)
      return
    }
    setSending(true)
    onSubmittingChange?.(true)
    try {
      const flattened = await flattenPdf()
      const pdfBase64 = bytesToBase64(flattened)
      await submitPublicForm(publicToken, {
        pdfBase64,
        values: stripValuesForSubmit(),
        consent: buildLegalConsentPayload(),
        submitterEmail: requiresSubmitterEmail ? String(submitterEmail).trim() : undefined,
      })
      onSubmitted?.()
    } catch (e) {
      onSubmittingChange?.(false)
      showToast(e.message || 'Failed to submit form', 'error')
    } finally {
      setSending(false)
    }
  }, [
    flattenPdf,
    isFieldFilled,
    legalAccepted,
    onSubmitted,
    onSubmittingChange,
    activeTourFields,
    publicToken,
    requiresSubmitterEmail,
    stripValuesForSubmit,
    submitterEmail,
    validateRequired,
    values,
  ])

  const getFilledValuesForInvite = useCallback(() => {
    const out = {}
    for (const f of template.fields || []) {
      const v = values[f.id]
      if (isFieldFilled(f, v)) out[f.id] = v
    }
    return out
  }, [isFieldFilled, template.fields, values])

  const preparePdfForSend = useCallback(async () => {
    const flattened = await flattenPdf()
    return bytesToBase64(flattened)
  }, [flattenPdf])

  const tryOpenSend = useCallback(() => {
    const missing = validateRequired()
    if (isPublic) {
      if (!legalAccepted) {
        showToast('Please accept the terms before submitting.', 'error')
        return
      }
      if (requiresSubmitterEmail) {
        const email = String(submitterEmail || '').trim()
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          showToast('Enter an email to receive your completed form PDF', 'error')
          return
        }
      }
      if (missing.length > 0) {
        showToast(
          `There are required fields still empty: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}`,
          'error'
        )
        const firstMissing = activeTourFields.findIndex(
          (f) => f.required && !isFieldFilled(f, values[f.id])
        )
        if (firstMissing >= 0) {
          setFillMode(true)
          setTourStep(firstMissing)
        }
        return
      }
      handlePublicSubmit()
      return
    }
    if (confirmMode && typeof onConfirmSend === 'function') {
      onConfirmSend({
        values: getFilledValuesForInvite(),
        stripValues: stripValuesForSubmit(),
        preparePdf: preparePdfForSend,
      })
      return
    }
    // Authenticated: always open the send dialog so the user can choose
    // link-to-complete (with prefills) or PDF attachment.
    setSendOpen(true)
  }, [
    activeTourFields,
    confirmMode,
    enterFillMode,
    fillMode,
    getFilledValuesForInvite,
    handlePublicSubmit,
    isFieldFilled,
    isPublic,
    legalAccepted,
    onConfirmSend,
    preparePdfForSend,
    requiresSubmitterEmail,
    stripValuesForSubmit,
    submitterEmail,
    validateRequired,
    values,
  ])

  const goNext = useCallback(() => {
    setTourStep((s) => Math.min(s + 1, Math.max(activeTourFields.length - 1, 0)))
  }, [activeTourFields.length])

  const stepLabel = currentField
    ? (currentField.label && currentField.label.trim()) || currentField.type
    : ''
  const isLast = currentField && tourStep === activeTourFields.length - 1

  // How many fields have a non-empty value — used for the progress bar.
  const filledCount = useMemo(() => {
    let n = 0
    for (const f of (template.fields || [])) {
      if (isFieldFilled(f, values[f.id])) n++
    }
    return n
  }, [isFieldFilled, template.fields, values])
  const totalFields = activeTourFields.length
  const progressPct = totalFields > 0 ? Math.round((filledCount / totalFields) * 100) : 0
  const allRequiredFilled = useMemo(() => validateRequired().length === 0, [validateRequired])
  const fieldsReady = allRequiredFilled && !loading && !loadingErr && !sending
  const submitReady = isPublic
    ? (fieldsReady && legalAccepted && (
      !requiresSubmitterEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(submitterEmail || '').trim())
    ))
    : fieldsReady
  const showSubmitControl = isPublic ? fieldsReady : true

  // Recipient only: auto-fit for review once every field is complete.
  useEffect(() => {
    if (!isPublic || !fillMode || !allFieldsFilled) return
    exitFillMode()
  }, [allFieldsFilled, exitFillMode, fillMode, isPublic])

  const publicReviewMode = isPublic && !fillMode
  const viewFitReady = !fillMode && unscaledSize.w > 0 && unscaledSize.h > 0

  // Vertically/horizontally center when the form fits; otherwise align top and center X via scroll.
  useEffect(() => {
    if (fillMode || !viewFitReady) return
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
  }, [fillMode, viewFitReady, unscaledSize.h, unscaledSize.w, fillZoom])

  // Re-fit after the submit footer appears so the form stays fully visible.
  useEffect(() => {
    if (fillMode || !viewFitReady || !showSubmitControl) return
    let cancelled = false
    ;(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      if (cancelled) return
      const z = computeViewModeZoom()
      setFillZoom(z)
      fillZoomRef.current = z
      setReviewFitZoom(z)
    })()
    return () => { cancelled = true }
  }, [fillMode, viewFitReady, showSubmitControl, computeViewModeZoom])

  // View mode: keep the form horizontally centered (and top-aligned) after zoom/layout changes.
  useEffect(() => {
    if (fillMode || !viewFitReady) return
    const id = requestAnimationFrame(() => {
      pinReviewScroll()
    })
    return () => cancelAnimationFrame(id)
  }, [fillMode, viewFitReady, fillZoom, unscaledSize.w, unscaledSize.h, reviewFitsViewport, pinReviewScroll])

  const renderSubmitButton = (className) => {
    const label = isPublic
      ? (submitReady ? 'Submit now' : 'Submit')
      : (confirmMode ? confirmLabel : 'Send')
    const inFooter = className?.includes('form-fill-footer')
    return (
      <Button
        variant={submitReady && isPublic ? 'default' : 'outline'}
        onClick={tryOpenSend}
        disabled={loading || !!loadingErr || sending || (isPublic && !legalAccepted)}
        className={cn(
          'share-dialog-btn shrink-0',
          inFooter
            ? 'form-fill-action-bar-btn form-fill-footer-btn'
            : 'form-fill-submit-btn',
          submitReady && isPublic && 'form-fill-submit-btn--ready form-fill-submit-btn--prominent',
          className
        )}
        title={isPublic
          ? (submitReady ? 'Review your form, then submit' : 'Submit form')
          : (confirmMode ? confirmLabel : 'Send form link or PDF')}
        aria-label={isPublic
          ? (submitReady ? 'Submit completed form now' : 'Submit form')
          : (confirmMode ? confirmLabel : 'Send form link or PDF')}
      >
        {sending ? (
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        ) : submitReady && isPublic ? (
          <CheckCircle2 className="h-4 w-4 shrink-0" />
        ) : (
          <Send className="h-4 w-4 shrink-0" />
        )}
        {inFooter ? (
          <span className="form-fill-footer-btn-label">{label}</span>
        ) : (
          label
        )}
      </Button>
    )
  }

  const layout = resolveFormUiLayout(isPublic)

  const chromeProps = {
    layout,
    isPublic,
    fillMode,
    template,
    onBack,
    needsViewReset,
    resetFillView,
    loading,
    loadingErr,
    showSubmitControl,
    renderSubmitButton,
    currentField,
    sigOpen,
    sendOpen,
    exitFillMode,
    stepLabel,
    tourStep,
    totalFields,
    goPrev,
    goNext,
    isLast,
    openSigForCurrent,
    values,
    progressPct,
    filledCount,
    submitReady,
    legalAccepted,
    onLegalAcceptedChange: setLegalAccepted,
    requiresSubmitterEmail,
    submitterEmail,
    onSubmitterEmailChange: setSubmitterEmail,
    confirmMode,
  }

  return (
    <div
      className={cn(
        'form-fill-root flex flex-col flex-1 min-h-0',
        isPublic && 'public-form-fill',
        `form-fill-layout-${layout}`
      )}
    >
      <FormFillChrome part="header" {...chromeProps} />
      <FormFillChrome part="fill-top" {...chromeProps} />

      <div
        ref={scrollContainerRef}
        onScroll={handleScrollContainerScroll}
        className={cn(
          'fill-scroll-container scrollbar-hide flex-1 min-h-0 overscroll-behavior-contain bg-gray-200/50',
          // Authenticated / send-preview: allow pan both axes (view + edit).
          // Public review keeps x locked via form-fill-fit-scroll.
          (fillMode || !isPublic || confirmMode)
            ? 'p-4 overflow-y-auto overflow-x-auto'
            : 'form-fill-fit-scroll px-2 py-3',
        )}
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
          <>
            <div
              className={cn(
                viewFitReady && 'form-fill-fit-frame',
                viewFitReady && (reviewFitsViewport
                  ? 'form-fill-fit-frame--fits'
                  : 'form-fill-fit-frame--scroll')
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
                    minWidth: fillMode ? `${fillZoom * 100}%` : undefined,
                  }}
                >
                  {pageSizes.map((size, pageIndex) => {
                    const fieldsHere = fieldsByPage.get(pageIndex) || []
                    const displayW = size.width
                    const displayH = size.height
                    const pageMaxWidth = `${displayW}px`
                    return (
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
                          maxWidth: pageMaxWidth,
                          aspectRatio: `${displayW} / ${displayH}`,
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
                        {fieldsHere.map((f) => (
                          <InteractiveFillField
                            key={f.id}
                            field={f}
                            value={values[f.id]}
                            onChange={(v) => setValue(f.id, v)}
                            isCurrent={fillMode && currentField?.id === f.id}
                            viewOnly={!fillMode}
                            reviewTypography={publicReviewMode}
                            locked={effectiveLockedSet.has(f.id)}
                            onActivate={() => enterFillMode(f.id)}
                            onOpenSignature={() => {
                              setSigFieldId(f.id)
                              setSigOpen(true)
                            }}
                            onFocus={() => setStepForField(f.id)}
                            onEnter={goNext}
                          />
                        ))}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            {fillMode && fillZoom > 1.001 && unscaledSize.h > 0 && (
              <div
                className="pointer-events-none w-px"
                aria-hidden
                style={{ height: (fillZoom - 1) * unscaledSize.h }}
              />
            )}
          </>
        )}
      </div>

      <FormFillChrome part="footer" {...chromeProps} />

      <SignaturePadModal
        open={sigOpen}
        onClose={() => { setSigOpen(false); setSigFieldId(null) }}
        onSave={handleSigSave}
        initialDataUrl={sigFieldId ? values[sigFieldId] : null}
      />

      {!isPublic && !confirmMode && sendOpen && (
        <SendFormDialog
          open
          template={template}
          prefillValues={getFilledValuesForInvite()}
          values={stripValuesForSubmit()}
          preparePdf={preparePdfForSend}
          lead={lead}
          leads={leads}
          teams={teams}
          teamMembership={teamMembership}
          initialDelivery={submitReady ? 'pdf' : 'link'}
          onClose={() => setSendOpen(false)}
          onSent={() => {
            setSendOpen(false)
            onFormSent?.()
            onBack?.()
          }}
        />
      )}
    </div>
  )
}

/**
 * Directly-interactive field positioned on the PDF. Text/date use native
 * inputs (so the keyboard/date picker opens on tap), checkbox uses a native
 * checkbox, and signature is a button that opens the signature pad.
 */
function InteractiveFillField({
  field,
  value,
  onChange,
  isCurrent,
  viewOnly = false,
  reviewTypography = false,
  locked = false,
  onActivate,
  onOpenSignature,
  onFocus,
  onEnter,
}) {
  const elRef = useRef(null)
  const wrapperRef = useRef(null)
  const isReadOnly = viewOnly || locked
  const canGrowWidth = field.type === 'text' || field.type === 'date'
  const [displayWidthFrac, setDisplayWidthFrac] = useState(() => Number(field.width) || 0.2)

  useEffect(() => {
    if (isReadOnly || !isCurrent) return
    const el = elRef.current
    if (!el?.focus) return
    const t = setTimeout(() => {
      try { el.focus({ preventScroll: true }) } catch { el.focus() }
    }, 220)
    return () => clearTimeout(t)
  }, [isCurrent, isReadOnly])

  useLayoutEffect(() => {
    if (!canGrowWidth) {
      setDisplayWidthFrac(Number(field.width) || 0.2)
      return
    }
    const wrapper = wrapperRef.current
    const pageEl = wrapper?.offsetParent
    const pageW = pageEl?.clientWidth || 0
    const templateW = Math.max(0.01, Math.min(1, Number(field.width) || 0.2))
    const maxW = Math.max(templateW, Math.min(1, 1 - (Number(field.x) || 0)))
    if (!pageW) {
      setDisplayWidthFrac(templateW)
      return
    }
    const text = String(value || '').trim()
    if (!text) {
      setDisplayWidthFrac(templateW)
      return
    }
    const style = window.getComputedStyle(wrapper)
    const font = `${style.fontWeight || '400'} ${style.fontSize || '12px'} ${style.fontFamily || 'sans-serif'}`
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setDisplayWidthFrac(templateW)
      return
    }
    ctx.font = font
    const neededPx = ctx.measureText(text).width + 16
    const neededFrac = neededPx / pageW
    setDisplayWidthFrac(Math.min(maxW, Math.max(templateW, neededFrac)))
  }, [canGrowWidth, field.width, field.x, value, reviewTypography, field.height])

  const wrapperStyle = {
    position: 'absolute',
    left: `${field.x * 100}%`,
    top: `${field.y * 100}%`,
    width: `${(canGrowWidth ? displayWidthFrac : field.width) * 100}%`,
    height: `${field.height * 100}%`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: reviewTypography
      ? `clamp(10px, ${field.height * 90}cqh, 20px)`
      : `clamp(9px, ${field.height * 70}cqh, 16px)`,
    boxSizing: 'border-box',
    background: locked
      ? 'rgba(107,114,128,0.14)'
      : viewOnly
        ? 'rgba(59,130,246,0.04)'
        : isCurrent ? 'rgba(59,130,246,0.18)' : 'rgba(59,130,246,0.05)',
    border: locked
      ? '1px solid rgba(107,114,128,0.4)'
      : viewOnly
        ? '1px dashed rgba(37,99,235,0.28)'
        : isCurrent ? '2px solid rgba(37,99,235,1)' : '1px dashed rgba(37,99,235,0.45)',
    borderRadius: 3,
    overflow: canGrowWidth ? 'visible' : 'hidden',
    zIndex: isCurrent ? 10 : locked ? 2 : 1,
    cursor: viewOnly && !locked ? 'pointer' : locked ? 'default' : undefined,
    boxShadow: isCurrent
      ? '0 0 0 4px rgba(59,130,246,0.18), 0 6px 16px rgba(37,99,235,0.35)'
      : 'none',
    transition: 'box-shadow 0.25s ease, background 0.25s ease, border-color 0.25s ease, width 0.15s ease',
    color: '#000',
  }

  const handleWrapperClick = (e) => {
    if (!viewOnly || locked) return
    e.stopPropagation()
    onActivate?.()
  }

  const handleKeyDown = (e) => {
    if (isReadOnly) return
    if (e.key === 'Enter' && (field.type === 'text' || field.type === 'date')) {
      e.preventDefault()
      onEnter?.()
    }
  }

  const handleFocus = () => {
    if (isReadOnly) return
    onFocus?.()
  }

  let inner
  if (field.type === 'text') {
    inner = (
      <input
        ref={elRef}
        type="text"
        className="form-field-input"
        value={value || ''}
        placeholder={field.label || ''}
        readOnly={isReadOnly}
        tabIndex={isReadOnly ? -1 : 0}
        onChange={(e) => onChange(e.target.value)}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        style={{
          width: '100%',
          height: '100%',
          border: 0,
          background: 'transparent',
          padding: '0 4px',
          outline: 'none',
          fontSize: 'inherit',
          color: '#000',
          WebkitTextFillColor: '#000',
          caretColor: '#000',
          colorScheme: 'light',
          textAlign: 'center',
          pointerEvents: isReadOnly ? 'none' : 'auto',
        }}
      />
    )
  } else if (field.type === 'date') {
    inner = (
      <input
        ref={elRef}
        type="date"
        className="form-field-input"
        value={value || ''}
        readOnly={isReadOnly}
        tabIndex={isReadOnly ? -1 : 0}
        onChange={(e) => onChange(e.target.value)}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        style={{
          width: '100%',
          height: '100%',
          border: 0,
          background: 'transparent',
          padding: '0 4px',
          outline: 'none',
          fontSize: 'inherit',
          color: '#000',
          WebkitTextFillColor: '#000',
          caretColor: '#000',
          colorScheme: 'light',
          textAlign: 'center',
          pointerEvents: isReadOnly ? 'none' : 'auto',
        }}
      />
    )
  } else if (field.type === 'checkbox') {
    inner = (
      <input
        ref={elRef}
        type="checkbox"
        checked={!!value}
        disabled={isReadOnly}
        tabIndex={isReadOnly ? -1 : 0}
        onChange={(e) => onChange(e.target.checked)}
        onFocus={handleFocus}
        style={{ width: '80%', height: '80%', margin: 0, accentColor: '#2563eb', pointerEvents: isReadOnly ? 'none' : 'auto' }}
      />
    )
  } else if (field.type === 'signature') {
    inner = (
      <button
        ref={elRef}
        type="button"
        tabIndex={isReadOnly ? -1 : 0}
        onClick={(e) => {
          e.stopPropagation()
          if (isReadOnly) return
          if (viewOnly) {
            onActivate?.()
            return
          }
          onFocus?.()
          onOpenSignature?.()
        }}
        onFocus={handleFocus}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 0,
          background: 'transparent',
          padding: 0,
          cursor: locked ? 'default' : 'pointer',
          pointerEvents: isReadOnly ? 'none' : 'auto',
        }}
      >
        {value
          ? <img src={value} alt="Signature" style={{ maxWidth: '100%', maxHeight: '100%' }} />
          : <span style={{ color: '#1d4ed8', fontSize: 'inherit' }}>Tap to sign</span>}
      </button>
    )
  }

  return (
    <div
      ref={wrapperRef}
      style={wrapperStyle}
      className={isCurrent ? 'fill-field-current' : undefined}
      onClick={handleWrapperClick}
      role={viewOnly && !locked ? 'button' : undefined}
      tabIndex={viewOnly && !locked ? 0 : undefined}
      onKeyDown={viewOnly && !locked ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate?.() } } : undefined}
      aria-label={viewOnly && !locked ? `Fill ${field.label || field.type}` : locked ? `${field.label || field.type} (pre-filled)` : undefined}
    >
      {inner}
    </div>
  )
}

export default FormFillView
