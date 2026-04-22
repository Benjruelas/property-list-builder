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
import { FieldOverlay } from './FieldOverlay'

const PALETTE = [
  { type: 'text', label: 'Text', Icon: Type, defaultSize: { width: 0.2, height: 0.035 } },
  { type: 'date', label: 'Date', Icon: Calendar, defaultSize: { width: 0.15, height: 0.035 } },
  { type: 'checkbox', label: 'Checkbox', Icon: CheckSquare, defaultSize: { width: 0.03, height: 0.03 } },
  { type: 'signature', label: 'Signature', Icon: PenLine, defaultSize: { width: 0.3, height: 0.07 } },
]

function newId() {
  return `field_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

const RENDER_SCALE = 1.5

export function FormBuilderView({ template, onBack, onTemplateUpdated }) {
  const { getToken } = useAuth()
  const [pdfDoc, setPdfDoc] = useState(null)
  const [pageSizes, setPageSizes] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingErr, setLoadingErr] = useState(null)
  const [fields, setFields] = useState(() => Array.isArray(template.fields) ? template.fields : [])
  const [selectedFieldId, setSelectedFieldId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [templateName, setTemplateName] = useState(template.name || '')
  const [armedType, setArmedType] = useState(null)
  const [draggingPaletteType, setDraggingPaletteType] = useState(null)

  const pageRefs = useRef({})
  const renderedPages = useRef(new Set())
  const inflightRenders = useRef(new Map())

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
        const sizes = []
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i)
          const vp = page.getViewport({ scale: RENDER_SCALE })
          sizes.push({ width: vp.width, height: vp.height })
        }
        if (cancelled) return
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
      if (pdfDoc) {
        try { pdfDoc.destroy() } catch {}
      }
      renderedPages.current.clear()
      inflightRenders.current.clear()
    }
  }, [template.originalPdfKey, getToken])

  const renderPage = useCallback(async (pageIndex) => {
    if (!pdfDoc) return
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

  const handleFieldChange = useCallback((updated) => {
    setFields((prev) => prev.map((f) => (f.id === updated.id ? updated : f)))
  }, [])

  const handleFieldDelete = useCallback((id) => {
    setFields((prev) => prev.filter((f) => f.id !== id))
    setSelectedFieldId((cur) => (cur === id ? null : cur))
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
    const centered = {
      x: Math.max(0, Math.min(1 - spec.defaultSize.width, pct.x - spec.defaultSize.width / 2)),
      y: Math.max(0, Math.min(1 - spec.defaultSize.height, pct.y - spec.defaultSize.height / 2)),
      width: spec.defaultSize.width,
      height: spec.defaultSize.height,
    }
    const newField = {
      id: newId(),
      type,
      page: pageIndex,
      label: spec.label,
      required: false,
      ...centered,
    }
    setFields((prev) => [...prev, newField])
    setSelectedFieldId(newField.id)
  }, [pageSizes])

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
    const newField = {
      id: newId(),
      type,
      page: pageIndex,
      label: spec.label,
      required: false,
      x: Math.max(0, 0.5 - spec.defaultSize.width / 2),
      y: Math.max(0, 0.1),
      width: spec.defaultSize.width,
      height: spec.defaultSize.height,
    }
    setFields((prev) => [...prev, newField])
    setSelectedFieldId(newField.id)
  }, [pageSizes])

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
        className="flex items-center gap-2 px-4 py-3 border-b border-white/20"
        style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }}
      >
        <Button variant="ghost" size="icon" onClick={onBack} title="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Input
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          className="max-w-[360px] h-9"
          placeholder="Template name"
        />
        <div className="flex-1" />
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save
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
              className={`form-palette-btn ${isArmed ? 'is-armed' : ''} flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap shrink-0`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          )
        })}
      </div>

      {armedType && (
        <div className="md:hidden flex items-center justify-between gap-2 px-3 py-1.5 bg-blue-500/10 text-xs">
          <span>Tap on the page to place a <span className="font-semibold capitalize">{armedType}</span> field.</span>
          <button
            type="button"
            className="text-blue-700 underline"
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

        <main className="flex-1 bg-gray-200/50 overflow-y-auto scrollbar-hide p-4 space-y-4 min-w-0">
          {loading && (
            <div className="flex items-center justify-center py-20 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading PDF…
            </div>
          )}
          {loadingErr && (
            <div className="text-center py-20 text-sm text-red-600">{loadingErr}</div>
          )}
          {!loading && !loadingErr && pageSizes.map((size, pageIndex) => {
            const fieldsHere = fieldsByPage.get(pageIndex) || []
            const displayScale = 1
            const displayW = size.width * displayScale
            const displayH = size.height * displayScale
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
                    onSelect={setSelectedFieldId}
                    onChange={handleFieldChange}
                    onDelete={handleFieldDelete}
                  />
                ))}
                <div className="absolute bottom-1 right-2 text-[10px] text-gray-400 pointer-events-none">
                  Page {pageIndex + 1}
                </div>
              </div>
            )
          })}
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
        <div className="md:hidden border-t border-white/20 p-3 flex flex-col gap-2 bg-white/95">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium capitalize">{selectedField.type} field</p>
            <button
              type="button"
              onClick={() => setSelectedFieldId(null)}
              className="text-xs text-gray-600 underline"
            >
              Close
            </button>
          </div>
          <label className="text-xs text-gray-600">
            Label
            <Input
              value={selectedField.label || ''}
              onChange={(e) => handleFieldChange({ ...selectedField, label: e.target.value })}
              className="mt-1 h-9"
            />
          </label>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!selectedField.required}
                onChange={(e) => handleFieldChange({ ...selectedField, required: e.target.checked })}
              />
              Required
            </label>
            <Button
              variant="outline"
              size="sm"
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
