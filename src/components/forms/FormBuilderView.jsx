import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Type,
  Calendar,
  CheckSquare,
  PenLine,
  Save,
  Loader2,
} from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { showToast } from '../ui/toast'
import { useAuth } from '../../contexts/AuthContext'
import { downloadFormPdf, updateTemplate } from '../../utils/forms'
import { getSettings } from '@/utils/settings'
import { resolveLeadCustomFields } from '@/utils/customFields'
import { formLeadKeyOptions, normalizeFormLeadKey } from '@/utils/formLeadPrefill'
import { FieldOverlay } from './FieldOverlay'

const PALETTE = [
  { type: 'text', label: 'Text', Icon: Type, defaultSize: { width: 0.2, height: 0.035 } },
  { type: 'date', label: 'Date', Icon: Calendar, defaultSize: { width: 0.15, height: 0.035 } },
  { type: 'checkbox', label: 'Checkbox', Icon: CheckSquare, defaultSize: { width: 0.03, height: 0.03 } },
  { type: 'signature', label: 'Signature', Icon: PenLine, defaultSize: { width: 0.3, height: 0.07 } },
]

/** Slightly larger checkbox on narrow viewports so it stays finger-sized. */
const MOBILE_CHECKBOX_SIZE = { width: 0.055, height: 0.055 }

function newId() {
  return `field_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

const RENDER_SCALE = 1.5
/** Pinch / Ctrl+scroll zoom: 1 = fit-width, higher = magnification */
const BUILDER_ZOOM_MIN = 1
const BUILDER_ZOOM_MAX = 2.5
/** Mild auto-zoom when selecting or placing a field */
const BUILDER_FOCUS_ZOOM_MIN = 1.4
const BUILDER_FOCUS_ZOOM_MAX = 2.0
const VIEW_ANCHOR_X = 0.5
const VIEW_ANCHOR_Y = 0.38

function useIsNarrowViewport() {
  const [narrow, setNarrow] = useState(() => (
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false
  ))
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const onChange = () => setNarrow(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return narrow
}

export function FormBuilderView({
  template,
  onBack,
  onTemplateUpdated,
  teams = [],
  teamMembership = null,
}) {
  const { getToken } = useAuth()
  const isNarrow = useIsNarrowViewport()
  const [pdfDoc, setPdfDoc] = useState(null)
  const [pageSizes, setPageSizes] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingErr, setLoadingErr] = useState(null)
  const [fields, setFields] = useState(() => Array.isArray(template?.fields) ? template.fields : [])
  const [selectedFieldId, setSelectedFieldId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [templateName, setTemplateName] = useState(template?.name || '')
  const [armedType, setArmedType] = useState(null)
  const [draggingPaletteType, setDraggingPaletteType] = useState(null)
  const [builderZoom, setBuilderZoom] = useState(1)
  const [unscaledSize, setUnscaledSize] = useState({ w: 0, h: 0 })

  const leadKeyOptions = useMemo(
    () => formLeadKeyOptions(resolveLeadCustomFields({ settings: getSettings(), teams, teamMembership })),
    [teams, teamMembership],
  )

  const pageRefs = useRef({})
  const renderedPages = useRef(new Set())
  const inflightRenders = useRef(new Map())
  const scrollContainerRef = useRef(null)
  const zoomInnerRef = useRef(null)
  const builderZoomRef = useRef(1)
  const pinchRef = useRef(null)
  const manualZoomRef = useRef(false)
  const formFocusZoomRef = useRef(null)
  const lastFocusedFieldIdRef = useRef(null)
  const pdfDocRef = useRef(null)

  useEffect(() => {
    builderZoomRef.current = builderZoom
  }, [builderZoom])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadingErr(null)
      try {
        const mod = await import('pdfjs-dist')
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default
        mod.GlobalWorkerOptions.workerSrc = workerUrl

        if (!template.originalPdfKey) {
          throw new Error('Template has no PDF source')
        }
        const buf = await downloadFormPdf(getToken, template.originalPdfKey)
        if (cancelled) return
        const doc = await mod.getDocument({ data: buf }).promise
        if (cancelled) { try { doc.destroy() } catch {} return }
        const pages = await Promise.all(
          Array.from({ length: doc.numPages }, (_, i) => doc.getPage(i + 1))
        )
        const sizes = pages.map((page) => {
          const vp = page.getViewport({ scale: RENDER_SCALE })
          return { width: vp.width, height: vp.height }
        })
        if (cancelled) return
        pdfDocRef.current = doc
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
      if (pdfDocRef.current) {
        try { pdfDocRef.current.destroy() } catch {}
        pdfDocRef.current = null
      }
      renderedPages.current.clear()
      inflightRenders.current.clear()
    }
  }, [template.originalPdfKey, getToken])

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
        console.warn('page render failed', pageIndex, e.message)
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
    if (!pdfDoc || !pageSizes.length) return
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const idx = Number(entry.target.getAttribute('data-page-index'))
          if (!Number.isNaN(idx)) renderPage(idx)
        }
      }
    }, { rootMargin: '400px 0px', root: scrollContainerRef.current })
    for (let i = 0; i < pageSizes.length; i++) {
      const el = pageRefs.current[i]?.wrapper
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [pdfDoc, pageSizes, renderPage, builderZoom])

  // Measure unscaled PDF stack for scroll extent when zoomed.
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

  // Pinch-to-zoom and Ctrl/Cmd+wheel (same pattern as form fill).
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    const clampZoom = (z) => Math.min(BUILDER_ZOOM_MAX, Math.max(BUILDER_ZOOM_MIN, z))

    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        const a = e.touches[0]
        const b = e.touches[1]
        pinchRef.current = { d0: dist(a, b), z0: builderZoomRef.current }
      }
    }
    const onTouchMove = (e) => {
      if (e.touches.length !== 2) return
      if (!pinchRef.current) {
        const a = e.touches[0]
        const b = e.touches[1]
        pinchRef.current = { d0: dist(a, b), z0: builderZoomRef.current }
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
      builderZoomRef.current = next
      setBuilderZoom(next)
    }
    const onTouchEnd = () => {
      pinchRef.current = null
    }
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      manualZoomRef.current = true
      setBuilderZoom((z) => {
        const next = clampZoom(z - e.deltaY * 0.0045)
        formFocusZoomRef.current = next
        builderZoomRef.current = next
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

  // Redraw canvases after pinch/wheel zoom (CSS transform + canvas compositing bug).
  useEffect(() => {
    if (!manualZoomRef.current) return
    if (!pdfDoc || renderedPages.current.size === 0) return
    manualZoomRef.current = false
    const t = window.setTimeout(() => { redrawRenderedPages() }, 80)
    return () => window.clearTimeout(t)
  }, [builderZoom, pdfDoc, redrawRenderedPages])

  const defaultSizeForType = useCallback((type) => {
    const spec = PALETTE.find((p) => p.type === type)
    if (!spec) return { width: 0.2, height: 0.035 }
    if (type === 'checkbox' && isNarrow) return MOBILE_CHECKBOX_SIZE
    return spec.defaultSize
  }, [isNarrow])

  const getFieldMetrics = useCallback((field, zoom) => {
    const pageEl = pageRefs.current[field.page]?.wrapper
    if (!pageEl) return null
    const z = zoom ?? builderZoomRef.current
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
      centerX: left + width / 2,
      centerY: top + height / 2,
    }
  }, [])

  const computeFieldFocusZoom = useCallback((field, pageEl, scroller) => {
    const pw = pageEl.offsetWidth
    const ph = pageEl.offsetHeight
    if (pw < 1 || ph < 1) return BUILDER_FOCUS_ZOOM_MIN

    const fieldW = Math.max(field.width * pw, 28)
    const fieldH = Math.max(field.height * ph, 18)
    const viewW = Math.max(scroller.clientWidth * 0.72, 240)
    const viewH = Math.max(scroller.clientHeight * 0.5, 200)

    const zoomW = viewW / fieldW
    const zoomH = viewH / fieldH
    return Math.min(
      BUILDER_FOCUS_ZOOM_MAX,
      Math.max(BUILDER_FOCUS_ZOOM_MIN, Math.min(zoomW, zoomH))
    )
  }, [])

  const scrollToField = useCallback((field, zoom) => {
    const scroller = scrollContainerRef.current
    if (!scroller || !field) return
    const metrics = getFieldMetrics(field, zoom)
    if (!metrics) return
    const maxLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth)
    const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    const targetLeft = Math.min(maxLeft, Math.max(0, metrics.centerX - scroller.clientWidth * VIEW_ANCHOR_X))
    const targetTop = Math.min(maxTop, Math.max(0, metrics.centerY - scroller.clientHeight * VIEW_ANCHOR_Y))
    scroller.scrollTo({ left: targetLeft, top: targetTop, behavior: 'smooth' })
  }, [getFieldMetrics])

  const focusFieldInView = useCallback(async (field) => {
    if (!field || !isNarrow) return
    const scroller = scrollContainerRef.current
    const pageEl = pageRefs.current[field.page]?.wrapper
    if (!scroller || !pageEl) return

    await renderPage(field.page)
    let targetZoom = builderZoomRef.current
    if (formFocusZoomRef.current == null || builderZoomRef.current < BUILDER_FOCUS_ZOOM_MIN - 0.02) {
      targetZoom = computeFieldFocusZoom(field, pageEl, scroller)
      formFocusZoomRef.current = targetZoom
    } else {
      targetZoom = formFocusZoomRef.current
    }

    const zoomChanged = Math.abs(targetZoom - builderZoomRef.current) > 0.02
    if (zoomChanged) {
      manualZoomRef.current = true
      builderZoomRef.current = targetZoom
      setBuilderZoom(targetZoom)
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      })
      await renderPage(field.page, true)
    }
    scrollToField(field, builderZoomRef.current)
  }, [computeFieldFocusZoom, isNarrow, renderPage, scrollToField])

  // Auto-focus / mild zoom when selection changes (mobile).
  useEffect(() => {
    if (!selectedFieldId || loading || !pdfDoc) return
    if (lastFocusedFieldIdRef.current === selectedFieldId) return
    const field = fields.find((f) => f.id === selectedFieldId)
    if (!field) return
    lastFocusedFieldIdRef.current = selectedFieldId
    let cancelled = false
    ;(async () => {
      await focusFieldInView(field)
      if (cancelled) return
    })()
    return () => { cancelled = true }
  }, [selectedFieldId, fields, loading, pdfDoc, focusFieldInView])

  const handleFieldChange = useCallback((updated) => {
    setFields((prev) => prev.map((f) => (f.id === updated.id ? updated : f)))
  }, [])

  const handleFieldDelete = useCallback((id) => {
    setFields((prev) => prev.filter((f) => f.id !== id))
    setSelectedFieldId((cur) => (cur === id ? null : cur))
    if (lastFocusedFieldIdRef.current === id) lastFocusedFieldIdRef.current = null
  }, [])

  const placeFieldAt = useCallback((type, pageIndex, clientX, clientY) => {
    if (!type) return
    const wrapper = pageRefs.current[pageIndex]?.wrapper
    const size = pageSizes[pageIndex]
    if (!wrapper || !size) return
    const rect = wrapper.getBoundingClientRect()
    const relX = clientX - rect.left
    const relY = clientY - rect.top
    const pct = {
      x: Math.max(0, Math.min(1, relX / rect.width)),
      y: Math.max(0, Math.min(1, relY / rect.height)),
    }
    const spec = PALETTE.find((p) => p.type === type)
    if (!spec) return
    const defaultSize = defaultSizeForType(type)
    const centered = {
      x: Math.max(0, Math.min(1 - defaultSize.width, pct.x - defaultSize.width / 2)),
      y: Math.max(0, Math.min(1 - defaultSize.height, pct.y - defaultSize.height / 2)),
      width: defaultSize.width,
      height: defaultSize.height,
    }
    const newField = {
      id: newId(),
      type,
      page: pageIndex,
      label: spec.label,
      required: false,
      ...centered,
    }
    // Allow focus effect to run for the newly placed field.
    lastFocusedFieldIdRef.current = null
    setFields((prev) => [...prev, newField])
    setSelectedFieldId(newField.id)
  }, [pageSizes, defaultSizeForType])

  const handleDropOnPage = useCallback((pageIndex, clientX, clientY) => {
    if (!draggingPaletteType) return
    placeFieldAt(draggingPaletteType, pageIndex, clientX, clientY)
    setDraggingPaletteType(null)
  }, [draggingPaletteType, placeFieldAt])

  const handleClickOnPage = useCallback((pageIndex, clientX, clientY) => {
    if (!armedType) return
    placeFieldAt(armedType, pageIndex, clientX, clientY)
    setArmedType(null)
  }, [armedType, placeFieldAt])

  const addFieldCenter = useCallback((type) => {
    const pageIndex = pageSizes.length ? 0 : -1
    if (pageIndex < 0) return
    const spec = PALETTE.find((p) => p.type === type)
    if (!spec) return
    const defaultSize = defaultSizeForType(type)
    const newField = {
      id: newId(),
      type,
      page: pageIndex,
      label: spec.label,
      required: false,
      x: Math.max(0, 0.5 - defaultSize.width / 2),
      y: Math.max(0, 0.1),
      width: defaultSize.width,
      height: defaultSize.height,
    }
    lastFocusedFieldIdRef.current = null
    setFields((prev) => [...prev, newField])
    setSelectedFieldId(newField.id)
  }, [pageSizes, defaultSizeForType])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const updated = await updateTemplate(getToken, template.id, {
        name: templateName,
        fields,
      })
      onTemplateUpdated?.(updated)
      showToast('Form saved', 'success')
    } catch (e) {
      showToast(e.message || 'Failed to save form', 'error')
    } finally {
      setSaving(false)
    }
  }, [fields, getToken, onTemplateUpdated, template.id, templateName])

  const handleSelectField = useCallback((id) => {
    setSelectedFieldId(id)
  }, [])

  const selectedField = useMemo(
    () => fields.find((f) => f.id === selectedFieldId) || null,
    [fields, selectedFieldId]
  )

  const fieldsByPage = useMemo(() => {
    const m = new Map()
    for (const f of fields) {
      const arr = m.get(f.page) || []
      arr.push(f)
      m.set(f.page, arr)
    }
    return m
  }, [fields])

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div
        className="flex items-center gap-2 px-3 md:px-4 py-2 md:py-3 border-b border-white/20"
        style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top, 0px))' }}
      >
        <Button variant="ghost" size="icon" onClick={onBack} title="Back" className="shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Input
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          className="min-w-0 flex-1 max-w-[360px] h-9"
          placeholder="Template name"
        />
        <div className="hidden md:block flex-1" />
        <Button
          onClick={handleSave}
          disabled={saving}
          size="sm"
          className="shrink-0 md:h-9"
          title="Save"
        >
          {saving ? <Loader2 className="h-4 w-4 md:mr-2 animate-spin" /> : <Save className="h-4 w-4 md:mr-2" />}
          <span className="hidden md:inline">Save</span>
        </Button>
      </div>

      <div className="md:hidden flex gap-2 px-3 py-2 border-b border-white/20 overflow-x-auto scrollbar-hide">
        {PALETTE.map(({ type, label, Icon }) => {
          const isArmed = armedType === type
          return (
            <button
              key={type}
              type="button"
              onClick={() => setArmedType(isArmed ? null : type)}
              className={`form-palette-btn ${isArmed ? 'is-armed' : ''} flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-full text-sm whitespace-nowrap shrink-0`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          )
        })}
      </div>

      {armedType && (
        <div className="md:hidden form-builder-arm-banner flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
          <span>
            Tap on the page to place a <span className="font-semibold capitalize">{armedType}</span> field.
          </span>
          <button
            type="button"
            className="form-builder-arm-cancel shrink-0 font-medium underline underline-offset-2"
            onClick={() => setArmedType(null)}
          >
            Cancel
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <aside className="hidden md:flex w-52 border-r border-white/20 flex-col p-3 gap-2 overflow-y-auto scrollbar-hide">
          <p className="text-[11px] uppercase tracking-wide mt-1 mb-1 opacity-70">Fields</p>
          {PALETTE.map(({ type, label, Icon }) => {
            const isArmed = armedType === type
            return (
              <button
                key={type}
                type="button"
                draggable
                onDragStart={() => setDraggingPaletteType(type)}
                onDragEnd={() => setDraggingPaletteType(null)}
                onClick={() => setArmedType(isArmed ? null : type)}
                onDoubleClick={() => addFieldCenter(type)}
                title="Drag onto page, or click to arm then click on page to place"
                className={`form-palette-btn ${isArmed ? 'is-armed' : ''} flex items-center gap-2 px-3 py-2 rounded-md text-sm cursor-grab active:cursor-grabbing`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            )
          })}
          <p className="text-[11px] mt-2 leading-relaxed opacity-60">
            Drag a field onto the page, or click a field then click on a page to place it. Double-click adds to page 1.
            Pinch or Ctrl+scroll to zoom.
          </p>
          {armedType && (
            <button
              type="button"
              className="text-[11px] underline mt-1 text-left opacity-90"
              onClick={() => setArmedType(null)}
            >
              Cancel placement
            </button>
          )}
        </aside>

        <main
          ref={scrollContainerRef}
          className="flex-1 bg-gray-200/50 overflow-y-auto overflow-x-auto scrollbar-hide p-1 md:p-4 min-w-0 overscroll-behavior-contain"
          style={{ WebkitOverflowScrolling: 'touch' }}
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
                ref={zoomInnerRef}
                className="form-builder-zoom-inner space-y-3 md:space-y-4 w-full"
                style={{
                  transform: `scale(${builderZoom})`,
                  transformOrigin: 'top left',
                  minWidth: builderZoom > 1.001 ? `${builderZoom * 100}%` : undefined,
                }}
              >
                {pageSizes.map((size, pageIndex) => {
                  const fieldsHere = fieldsByPage.get(pageIndex) || []
                  const displayW = size.width
                  const displayH = size.height
                  return (
                    <div
                      key={pageIndex}
                      ref={(el) => {
                        pageRefs.current[pageIndex] = pageRefs.current[pageIndex] || {}
                        pageRefs.current[pageIndex].wrapper = el
                      }}
                      data-page-index={pageIndex}
                      className={`pdf-page-wrapper relative mx-auto bg-white shadow-sm ${armedType ? 'cursor-crosshair' : ''}`}
                      style={{
                        width: '100%',
                        maxWidth: `${displayW}px`,
                        aspectRatio: `${displayW} / ${displayH}`,
                        containerType: 'size',
                      }}
                      onDragOver={(e) => { if (draggingPaletteType) e.preventDefault() }}
                      onDrop={(e) => {
                        e.preventDefault()
                        handleDropOnPage(pageIndex, e.clientX, e.clientY)
                      }}
                      onClick={(e) => {
                        if (armedType && (e.target === e.currentTarget || e.target.tagName === 'CANVAS')) {
                          handleClickOnPage(pageIndex, e.clientX, e.clientY)
                          return
                        }
                        if (e.target === e.currentTarget) setSelectedFieldId(null)
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
                        <FieldOverlay
                          key={f.id}
                          field={f}
                          pageSize={{ width: displayW, height: displayH }}
                          selected={selectedFieldId === f.id}
                          onSelect={handleSelectField}
                          onChange={handleFieldChange}
                          onDelete={handleFieldDelete}
                          touchFriendly={isNarrow}
                        />
                      ))}
                      <div className="absolute bottom-1 right-2 text-[10px] text-gray-400 pointer-events-none">
                        Page {pageIndex + 1}
                      </div>
                    </div>
                  )
                })}
              </div>
              {builderZoom > 1.001 && unscaledSize.h > 0 && (
                <div
                  className="pointer-events-none w-px"
                  aria-hidden
                  style={{ height: (builderZoom - 1) * unscaledSize.h }}
                />
              )}
            </>
          )}
        </main>

        {selectedField && (
          <aside className="hidden md:flex w-64 border-l border-white/20 flex-col p-3 gap-3 overflow-y-auto scrollbar-hide">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-gray-500">Field</p>
              <p className="text-sm font-medium capitalize">{selectedField.type}</p>
            </div>
            <label className="text-xs text-gray-600">
              Label
              <Input
                value={selectedField.label || ''}
                onChange={(e) => handleFieldChange({ ...selectedField, label: e.target.value })}
                className="mt-1 h-9"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!selectedField.required}
                onChange={(e) => handleFieldChange({ ...selectedField, required: e.target.checked })}
              />
              Required
            </label>
            {(selectedField.type === 'text' || selectedField.type === 'date') && (
              <label className="text-xs text-gray-600">
                Link to lead field
                <select
                  className="mt-1 h-9 w-full rounded-md border border-white/20 bg-black/20 px-2 text-sm"
                  value={selectedField.leadKey || ''}
                  onChange={(e) => {
                    const leadKey = normalizeFormLeadKey(e.target.value)
                    const next = { ...selectedField }
                    if (leadKey) next.leadKey = leadKey
                    else delete next.leadKey
                    handleFieldChange(next)
                  }}
                >
                  {leadKeyOptions.map((opt) => (
                    <option key={opt.key || 'none'} value={opt.key}>{opt.label}</option>
                  ))}
                </select>
              </label>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleFieldDelete(selectedField.id)}
            >
              Delete field
            </Button>
          </aside>
        )}
      </div>

      {selectedField && (
        <div
          className="md:hidden form-builder-mobile-inspector border-t border-white/20 px-3 pt-3 flex flex-col gap-2"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="form-builder-inspector-title text-sm font-medium capitalize">
              {selectedField.type} field
            </p>
            <button
              type="button"
              onClick={() => setSelectedFieldId(null)}
              className="form-builder-inspector-close text-xs font-medium underline underline-offset-2 min-h-[36px] px-2"
            >
              Close
            </button>
          </div>
          <label className="form-builder-inspector-label text-xs">
            Label
            <Input
              value={selectedField.label || ''}
              onChange={(e) => handleFieldChange({ ...selectedField, label: e.target.value })}
              className="mt-1 h-10"
            />
          </label>
          {(selectedField.type === 'text' || selectedField.type === 'date') && (
            <label className="form-builder-inspector-label text-xs">
              Link to lead field
              <select
                className="mt-1 h-10 w-full rounded-md border border-white/20 bg-black/20 px-2 text-sm"
                value={selectedField.leadKey || ''}
                onChange={(e) => {
                  const leadKey = normalizeFormLeadKey(e.target.value)
                  const next = { ...selectedField }
                  if (leadKey) next.leadKey = leadKey
                  else delete next.leadKey
                  handleFieldChange(next)
                }}
              >
                {leadKeyOptions.map((opt) => (
                  <option key={opt.key || 'none'} value={opt.key}>{opt.label}</option>
                ))}
              </select>
            </label>
          )}
          <div className="flex items-center justify-between gap-3">
            <label className="form-builder-inspector-label flex items-center gap-2 text-sm min-h-[44px]">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={!!selectedField.required}
                onChange={(e) => handleFieldChange({ ...selectedField, required: e.target.checked })}
              />
              Required
            </label>
            <Button
              variant="destructive"
              size="sm"
              className="form-builder-inspector-delete min-h-[40px] px-4"
              onClick={() => handleFieldDelete(selectedField.id)}
            >
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default FormBuilderView
