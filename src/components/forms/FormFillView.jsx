import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Send, Loader2, PenLine, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { showToast } from '../ui/toast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog'
import { useAuth } from '../../contexts/AuthContext'
import { downloadFormPdf, sendForm, bytesToBase64, updateTemplate } from '../../utils/forms'
import { buildSendPayload } from '../../lib/forms/emailPayload'
import { SignaturePadModal } from './SignaturePadModal'

const RENDER_SCALE = 1.5

export function FormFillView({ template, onBack }) {
  const { getToken } = useAuth()
  const [pdfBuffer, setPdfBuffer] = useState(null)
  const [pdfDoc, setPdfDoc] = useState(null)
  const [pageSizes, setPageSizes] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingErr, setLoadingErr] = useState(null)
  const [values, setValues] = useState({})
  const [sigOpen, setSigOpen] = useState(false)
  const [sigFieldId, setSigFieldId] = useState(null)
  const [sendOpen, setSendOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [recipient, setRecipient] = useState('')
  const [subject, setSubject] = useState(`Completed form: ${template.name || 'Form'}`)
  const [message, setMessage] = useState('')

  const scrollContainerRef = useRef(null)
  const pageRefs = useRef({})
  const renderedPages = useRef(new Set())
  const inflightRenders = useRef(new Map())
  const workerRef = useRef(null)

  // Natural reading order: page → y → x.
  const orderedFields = useMemo(() => {
    return [...(template.fields || [])].sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page
      if (a.y !== b.y) return a.y - b.y
      return a.x - b.x
    })
  }, [template.fields])

  const [tourStep, setTourStep] = useState(0)
  const isSendStep = tourStep >= orderedFields.length
  const currentField = !isSendStep ? orderedFields[tourStep] : null

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadingErr(null)
      try {
        const mod = await import('pdfjs-dist')
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default
        mod.GlobalWorkerOptions.workerSrc = workerUrl
        if (!template.originalPdfKey) throw new Error('Template has no PDF source')
        const buf = await downloadFormPdf(getToken, template.originalPdfKey)
        if (cancelled) return
        const doc = await mod.getDocument({ data: buf.slice(0) }).promise
        if (cancelled) { try { doc.destroy() } catch { /* ignore */ } return }
        const sizes = []
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i)
          const vp = page.getViewport({ scale: RENDER_SCALE })
          sizes.push({ width: vp.width, height: vp.height })
        }
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
        console.warn('fill render failed', pageIndex, e.message)
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
    setValues((prev) => ({ ...prev, [id]: v }))
  }, [])

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

  const tryOpenSend = useCallback(() => {
    const missing = validateRequired()
    if (missing.length > 0) {
      showToast(
        `There are required fields still empty: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}`,
        'error'
      )
      // Jump the guide to the first unfilled required field to help the user.
      const firstMissing = (template.fields || []).findIndex(
        (f) => f.required && !isFieldFilled(f, values[f.id])
      )
      if (firstMissing >= 0) {
        const fid = (template.fields || [])[firstMissing].id
        const idx = orderedFields.findIndex((f) => f.id === fid)
        if (idx >= 0) setTourStep(idx)
      }
      return
    }
    setSendOpen(true)
  }, [isFieldFilled, orderedFields, template.fields, validateRequired, values])

  const goNext = useCallback(() => {
    setTourStep((s) => {
      if (s >= orderedFields.length) return s
      const cur = orderedFields[s]
      if (cur?.required && !isFieldFilled(cur, values[cur.id])) {
        showToast(
          `"${cur.label || cur.type}" is required. Please fill it in before continuing.`,
          'error'
        )
        return s
      }
      const next = s + 1
      if (next >= orderedFields.length) {
        // Reached end of guide — gate the send dialog behind a full required-
        // field check (covers fields earlier in the tour that the user may
        // have skipped via arrow-prev + skip-next chain).
        const missing = []
        for (const f of (template.fields || [])) {
          if (!f.required) continue
          if (!isFieldFilled(f, values[f.id])) missing.push(f.label || f.type)
        }
        if (missing.length > 0) {
          showToast(
            `There are required fields still empty: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}`,
            'error'
          )
          const firstMissingIdx = orderedFields.findIndex(
            (f) => f.required && !isFieldFilled(f, values[f.id])
          )
          return firstMissingIdx >= 0 ? firstMissingIdx : s
        }
        setSendOpen(true)
      }
      return next
    })
  }, [isFieldFilled, orderedFields, template.fields, values])

  const goPrev = useCallback(() => {
    setTourStep((s) => Math.max(0, s - 1))
  }, [])

  // Jump tour step when user clicks/tabs into any field.
  const setStepForField = useCallback((fieldId) => {
    const idx = orderedFields.findIndex((f) => f.id === fieldId)
    if (idx >= 0) setTourStep(idx)
  }, [orderedFields])

  // Scroll the current field into view whenever the tour step changes.
  // (Auto-focus of the input is handled inside `InteractiveFillField` so it
  // fires reliably as soon as the field is mounted, even before the PDF is
  // fully laid out.)
  useEffect(() => {
    if (!currentField || loading || loadingErr) return
    const pageEl = pageRefs.current[currentField.page]?.wrapper
    const scroller = scrollContainerRef.current
    if (!pageEl || !scroller) return
    const doScroll = () => {
      const pageTopInScroller = pageEl.offsetTop
      const pageHeight = pageEl.offsetHeight || 1
      const fieldMid = pageTopInScroller + (currentField.y + currentField.height / 2) * pageHeight
      const target = fieldMid - scroller.clientHeight / 2
      scroller.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
    }
    doScroll()
    const t = setTimeout(doScroll, 160)
    return () => clearTimeout(t)
  }, [currentField, loading, loadingErr])

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

  const handleSend = useCallback(async () => {
    const missing = validateRequired()
    if (missing.length > 0) {
      showToast(
        `There are required fields still empty: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}`,
        'error'
      )
      setSendOpen(false)
      const firstMissingIdx = orderedFields.findIndex(
        (f) => f.required && !isFieldFilled(f, values[f.id])
      )
      if (firstMissingIdx >= 0) setTourStep(firstMissingIdx)
      return
    }
    if (!recipient.trim()) {
      showToast('Enter a recipient email', 'error')
      return
    }
    setSending(true)
    try {
      const flattened = await flattenPdf()
      const pdfBase64 = bytesToBase64(flattened)
      const payload = buildSendPayload({
        template,
        values,
        recipient,
        subject,
        message,
        flattenedPdfBase64: pdfBase64,
      })
      await sendForm(getToken, payload)
      try {
        await updateTemplate(getToken, template.id, { lastUsedAt: new Date().toISOString() })
      } catch { /* non-fatal */ }
      showToast('Form sent', 'success')
      setSendOpen(false)
      onBack?.()
    } catch (e) {
      showToast(e.message || 'Failed to send form', 'error')
    } finally {
      setSending(false)
    }
  }, [flattenPdf, getToken, isFieldFilled, message, onBack, orderedFields, recipient, subject, template, validateRequired, values])

  const stepLabel = currentField
    ? (currentField.label && currentField.label.trim()) || currentField.type
    : ''
  const isLast = currentField && tourStep === orderedFields.length - 1

  // How many fields have a non-empty value — used for the progress bar.
  const filledCount = useMemo(() => {
    let n = 0
    for (const f of (template.fields || [])) {
      if (isFieldFilled(f, values[f.id])) n++
    }
    return n
  }, [isFieldFilled, template.fields, values])
  const totalFields = orderedFields.length
  const progressPct = totalFields > 0 ? Math.round((filledCount / totalFields) * 100) : 0

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div
        className="flex items-center gap-2 px-4 py-3 border-b border-white/20"
        style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }}
      >
        <Button variant="ghost" size="icon" onClick={onBack} title="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="font-medium text-sm truncate">{template.name}</div>
        <div className="flex-1" />
        <Button
          onClick={tryOpenSend}
          disabled={loading || !!loadingErr}
        >
          <Send className="h-4 w-4 mr-2" /> Send
        </Button>
      </div>

      {/* Step bar — lives at the top of the panel (below the header). Mirrors
          the App Tour but is rendered inline so it reliably shows on all
          platforms regardless of dialog stacking context. */}
      {currentField && !sigOpen && !sendOpen && (
        <div className="fill-tour-stepbar-wrap">
          <div
            className="fill-tour-stepbar"
            role="toolbar"
            aria-label="Form field navigation"
          >
            <div className="fill-tour-stepbar-title">
              {stepLabel}{currentField.required ? ' *' : ''}
            </div>
            <div className="fill-tour-stepbar-controls">
              <button
                type="button"
                className="fill-tour-stepbar-arrow"
                onClick={goPrev}
                disabled={tourStep === 0}
                title="Previous field"
                aria-label="Previous field"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="fill-tour-stepbar-count">
                {tourStep + 1} <span className="fill-tour-stepbar-count-of">of</span> {totalFields}
              </div>
              <button
                type="button"
                className="fill-tour-stepbar-arrow"
                onClick={goNext}
                title={isLast ? 'Review & send' : 'Next field'}
                aria-label={isLast ? 'Review & send' : 'Next field'}
              >
                {isLast
                  ? <Send className="h-5 w-5" />
                  : <ChevronRight className="h-5 w-5" />}
              </button>
              {currentField.type === 'signature' && (
                <button
                  type="button"
                  className="fill-tour-stepbar-action"
                  onClick={openSigForCurrent}
                >
                  <PenLine className="h-4 w-4" />
                  {values[currentField.id] ? 'Redo' : 'Sign'}
                </button>
              )}
            </div>
            <div
              className="fill-tour-stepbar-progress"
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${filledCount} of ${totalFields} fields filled`}
            >
              <div
                className="fill-tour-stepbar-progress-bar"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <div
        ref={scrollContainerRef}
        className="fill-scroll-container flex-1 overflow-y-auto bg-gray-200/50 p-4 space-y-4"
      >
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
              className="pdf-page-wrapper relative mx-auto bg-white shadow-sm"
              style={{
                width: '100%',
                maxWidth: `${displayW}px`,
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
                  isCurrent={currentField?.id === f.id}
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

      <SignaturePadModal
        open={sigOpen}
        onClose={() => { setSigOpen(false); setSigFieldId(null) }}
        onSave={handleSigSave}
        initialDataUrl={sigFieldId ? values[sigFieldId] : null}
      />

      <Dialog open={sendOpen} onOpenChange={(open) => { if (!open && !sending) setSendOpen(false) }}>
        <DialogContent
          className="map-panel forms-send-dialog max-w-md"
          blurOverlay
        >
          <DialogHeader>
            <DialogTitle>Send completed form</DialogTitle>
            <DialogDescription className="text-xs opacity-70">
              The flattened PDF will be emailed as an attachment.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <label className="block text-xs opacity-80">
              Recipient email
              <Input
                type="email"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="name@example.com"
                className="mt-1"
              />
            </label>
            <label className="block text-xs opacity-80">
              Subject
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1"
              />
            </label>
            <label className="block text-xs opacity-80">
              Message (optional)
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                className="forms-send-textarea mt-1 flex w-full rounded-md px-3 py-2 text-sm focus-visible:outline-none"
              />
            </label>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setSendOpen(false)}
              disabled={sending}
              className="forms-send-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={sending}
              className="forms-send-confirm"
            >
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  onOpenSignature,
  onFocus,
  onEnter,
}) {
  const elRef = useRef(null)

  // Auto-focus whenever this field becomes the active tour step — keeps the
  // field in an "active, waiting-for-input" state without requiring an extra
  // tap on desktop. (On iOS, browsers still require a user gesture to open
  // the keyboard, so the user will tap to type — the highlight makes the
  // target obvious.)
  useEffect(() => {
    if (!isCurrent) return
    const el = elRef.current
    if (!el?.focus) return
    const t = setTimeout(() => {
      try { el.focus({ preventScroll: true }) } catch { el.focus() }
    }, 220)
    return () => clearTimeout(t)
  }, [isCurrent])

  const wrapperStyle = {
    position: 'absolute',
    left: `${field.x * 100}%`,
    top: `${field.y * 100}%`,
    width: `${field.width * 100}%`,
    height: `${field.height * 100}%`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: field.type === 'checkbox' || field.type === 'signature' ? 'center' : 'flex-start',
    fontSize: `clamp(9px, ${field.height * 70}cqh, 16px)`,
    boxSizing: 'border-box',
    background: isCurrent ? 'rgba(59,130,246,0.18)' : 'rgba(59,130,246,0.05)',
    border: isCurrent ? '2px solid rgba(37,99,235,1)' : '1px dashed rgba(37,99,235,0.45)',
    borderRadius: 3,
    overflow: 'hidden',
    zIndex: isCurrent ? 10 : 1,
    boxShadow: isCurrent
      ? '0 0 0 4px rgba(59,130,246,0.18), 0 6px 16px rgba(37,99,235,0.35)'
      : 'none',
    transition: 'box-shadow 0.2s, background 0.2s, border-color 0.2s',
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (field.type === 'text' || field.type === 'date')) {
      e.preventDefault()
      onEnter?.()
    }
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
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
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
          caretColor: '#000',
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
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
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
          caretColor: '#000',
        }}
      />
    )
  } else if (field.type === 'checkbox') {
    inner = (
      <input
        ref={elRef}
        type="checkbox"
        checked={!!value}
        onChange={(e) => onChange(e.target.checked)}
        onFocus={onFocus}
        style={{ width: '80%', height: '80%', margin: 0, accentColor: '#2563eb' }}
      />
    )
  } else if (field.type === 'signature') {
    inner = (
      <button
        ref={elRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onFocus?.()
          onOpenSignature?.()
        }}
        onFocus={onFocus}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 0,
          background: 'transparent',
          padding: 0,
          cursor: 'pointer',
        }}
      >
        {value
          ? <img src={value} alt="Signature" style={{ maxWidth: '100%', maxHeight: '100%' }} />
          : <span style={{ color: '#1d4ed8', fontSize: 'inherit' }}>Tap to sign</span>}
      </button>
    )
  }

  return <div style={wrapperStyle}>{inner}</div>
}

export default FormFillView
