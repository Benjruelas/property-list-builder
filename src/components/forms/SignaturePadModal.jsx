import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'

/**
 * Signature capture modal.
 *
 * Desktop / tablet: uses `signature_pad` inside a standard Radix Dialog.
 * Mobile (< 768px viewport): renders a fullscreen overlay that is ALWAYS
 * presented in landscape orientation. If the device is currently portrait
 * we CSS-rotate the pad 90° so the signing area spans the long edge of
 * the phone — the user does not need to physically rotate the device. The
 * toolbar sits horizontally across the top of the landscape pad. We use
 * a small custom drawing implementation with offsetX/offsetY because
 * `signature_pad` breaks under CSS transforms.
 */
export function SignaturePadModal({ open, onClose, onSave, initialDataUrl = null }) {
  // Desktop pad (signature_pad) refs
  const desktopCanvasRef = useRef(null)
  const desktopPadRef = useRef(null)
  // Mobile pad (custom) refs
  const mobileCanvasRef = useRef(null)
  const mobileDrawingRef = useRef({
    drawing: false,
    lastX: 0,
    lastY: 0,
    dirty: false,
    initialImage: null,
  })

  const [loading, setLoading] = useState(true)
  const [isEmpty, setIsEmpty] = useState(!initialDataUrl)
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1024,
    h: typeof window !== 'undefined' ? window.innerHeight : 768,
  }))

  const isMobile = viewport.w < 768
  const MOBILE_TOOLBAR_H = 56

  // Pad is ALWAYS presented in landscape. If the current viewport is
  // portrait (h > w) we swap dimensions and CSS-rotate the container 90°
  // so the pad fills the phone diagonally-rotated while leaving the rest
  // of the app unaffected by device rotation.
  const isPortrait = isMobile && viewport.h > viewport.w
  const padW = isPortrait ? viewport.h : viewport.w
  const padH = isPortrait ? viewport.w : viewport.h
  const canvasCssW = padW
  const canvasCssH = Math.max(1, padH - MOBILE_TOOLBAR_H)

  useEffect(() => {
    if (!open) return
    const onResize = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight })
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [open])

  // ——— Desktop: signature_pad lifecycle ——————————————————————————————————————
  const fitDesktopCanvas = useCallback(() => {
    const canvas = desktopCanvasRef.current
    if (!canvas) return
    const ratio = Math.max(window.devicePixelRatio || 1, 1)
    const parentRect = canvas.parentElement?.getBoundingClientRect()
    const cssW = parentRect?.width || 400
    const cssH = 180
    canvas.width = Math.max(1, Math.floor(cssW * ratio))
    canvas.height = Math.max(1, Math.floor(cssH * ratio))
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`
    const ctx = canvas.getContext('2d')
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(ratio, ratio)
    desktopPadRef.current?.clear()
    if (initialDataUrl && desktopPadRef.current) {
      desktopPadRef.current.fromDataURL(initialDataUrl, { ratio: 1, width: cssW, height: cssH })
    }
  }, [initialDataUrl])

  useEffect(() => {
    if (!open || isMobile) return
    let cancelled = false
    let resizeHandler = null
    ;(async () => {
      const SignaturePadMod = await import('signature_pad')
      if (cancelled) return
      const SignaturePad = SignaturePadMod.default || SignaturePadMod.SignaturePad
      const canvas = desktopCanvasRef.current
      if (!canvas) return
      desktopPadRef.current = new SignaturePad(canvas, {
        penColor: '#111827',
        backgroundColor: 'rgba(0,0,0,0)',
      })
      desktopPadRef.current.addEventListener('endStroke', () => {
        setIsEmpty(desktopPadRef.current?.isEmpty() ?? true)
      })
      fitDesktopCanvas()
      setLoading(false)
      resizeHandler = () => fitDesktopCanvas()
      window.addEventListener('resize', resizeHandler)
    })()
    return () => {
      cancelled = true
      if (resizeHandler) window.removeEventListener('resize', resizeHandler)
      if (desktopPadRef.current) {
        try { desktopPadRef.current.off() } catch { /* ignore */ }
        desktopPadRef.current = null
      }
    }
  }, [open, isMobile, fitDesktopCanvas])

  // ——— Mobile: custom pad using offsetX/offsetY (transform-aware) ————————————
  const sizeMobileCanvas = useCallback(() => {
    const canvas = mobileCanvasRef.current
    if (!canvas) return
    const ratio = Math.max(window.devicePixelRatio || 1, 1)
    canvas.width = Math.max(1, Math.floor(canvasCssW * ratio))
    canvas.height = Math.max(1, Math.floor(canvasCssH * ratio))
    canvas.style.width = `${canvasCssW}px`
    canvas.style.height = `${canvasCssH}px`
    const ctx = canvas.getContext('2d')
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(ratio, ratio)
    ctx.clearRect(0, 0, canvasCssW, canvasCssH)
    // Redraw initial image if provided.
    const img = mobileDrawingRef.current.initialImage
    if (img) {
      // Fit the initial image inside the canvas (preserve aspect ratio).
      const scale = Math.min(canvasCssW / img.width, canvasCssH / img.height)
      const drawW = img.width * scale
      const drawH = img.height * scale
      const dx = (canvasCssW - drawW) / 2
      const dy = (canvasCssH - drawH) / 2
      ctx.drawImage(img, dx, dy, drawW, drawH)
    }
  }, [canvasCssW, canvasCssH])

  useEffect(() => {
    if (!open || !isMobile) return
    setLoading(true)
    const drawing = mobileDrawingRef.current
    drawing.drawing = false
    drawing.dirty = !!initialDataUrl
    drawing.initialImage = null

    const canvas = mobileCanvasRef.current
    if (!canvas) return

    const setup = () => {
      sizeMobileCanvas()
      setLoading(false)
    }

    if (initialDataUrl) {
      const img = new Image()
      img.onload = () => {
        drawing.initialImage = img
        setup()
      }
      img.onerror = setup
      img.src = initialDataUrl
    } else {
      setup()
    }

    const handlePointerDown = (e) => {
      e.preventDefault()
      try { canvas.setPointerCapture?.(e.pointerId) } catch { /* ignore */ }
      drawing.drawing = true
      drawing.lastX = e.offsetX
      drawing.lastY = e.offsetY
    }
    const handlePointerMove = (e) => {
      if (!drawing.drawing) return
      e.preventDefault()
      const x = e.offsetX
      const y = e.offsetY
      const ctx = canvas.getContext('2d')
      ctx.strokeStyle = '#111827'
      ctx.lineWidth = 2.4
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(drawing.lastX, drawing.lastY)
      ctx.lineTo(x, y)
      ctx.stroke()
      drawing.lastX = x
      drawing.lastY = y
      if (!drawing.dirty) {
        drawing.dirty = true
        setIsEmpty(false)
      }
    }
    const handlePointerUp = (e) => {
      drawing.drawing = false
      try { canvas.releasePointerCapture?.(e.pointerId) } catch { /* ignore */ }
    }

    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerup', handlePointerUp)
    canvas.addEventListener('pointercancel', handlePointerUp)
    canvas.addEventListener('pointerleave', handlePointerUp)

    const onResize = () => sizeMobileCanvas()
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerup', handlePointerUp)
      canvas.removeEventListener('pointercancel', handlePointerUp)
      canvas.removeEventListener('pointerleave', handlePointerUp)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [open, isMobile, initialDataUrl, sizeMobileCanvas])

  const handleClear = () => {
    if (isMobile) {
      const canvas = mobileCanvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.restore()
      }
      mobileDrawingRef.current.dirty = false
      mobileDrawingRef.current.initialImage = null
      setIsEmpty(true)
    } else {
      desktopPadRef.current?.clear()
      setIsEmpty(true)
    }
  }

  const handleSave = () => {
    if (isMobile) {
      const canvas = mobileCanvasRef.current
      if (!canvas || isEmpty) return
      onSave?.(canvas.toDataURL('image/png'))
    } else {
      if (!desktopPadRef.current || desktopPadRef.current.isEmpty()) return
      onSave?.(desktopPadRef.current.toDataURL('image/png'))
    }
  }

  if (!open) return null

  if (isMobile && typeof document !== 'undefined') {
    const content = (
      <div
        // z-index low enough that toasts (99999) sit above it.
        // NOTE: `pointerEvents: 'auto'` is REQUIRED because our portal target
        // (#modal-root) sets `pointer-events: none` on itself to allow clicks
        // through when no modal is open. Without this, clicks fall through
        // the rotated pad to whatever underlying UI is beneath, making the
        // buttons appear unresponsive.
        className="fixed inset-0 z-[20000] bg-black/95"
        style={{ pointerEvents: 'auto' }}
      >
        {/* Pad container — sized to the landscape-oriented writing surface.
            In portrait we CSS-rotate 90° so the pad always presents as
            landscape without requiring the user to rotate their phone. */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: `${padW}px`,
            height: `${padH}px`,
            transform: isPortrait
              ? 'translate(-50%, -50%) rotate(90deg)'
              : 'translate(-50%, -50%)',
            transformOrigin: 'center center',
            background: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            pointerEvents: 'auto',
          }}
        >
          {/* Horizontal toolbar across the TOP of the landscape pad. */}
          <div
            className="flex items-center justify-between bg-gray-50 border-b border-gray-200"
            style={{
              height: `${MOBILE_TOOLBAR_H}px`,
              flexShrink: 0,
              padding: '0 16px',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-gray-700 font-medium px-4 py-2 rounded-md active:bg-gray-200"
            >
              Cancel
            </button>
            <div className="text-sm font-semibold text-gray-900">Sign here</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClear}
                className="text-sm text-gray-700 font-medium px-4 py-2 rounded-md active:bg-gray-200"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isEmpty}
                className="text-sm font-semibold px-4 py-2 rounded-md bg-blue-600 text-white disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>

          <div
            className="flex-1 relative bg-white"
            style={{ touchAction: 'none' }}
          >
            <canvas
              ref={mobileCanvasRef}
              style={{
                touchAction: 'none',
                display: 'block',
                width: `${canvasCssW}px`,
                height: `${canvasCssH}px`,
              }}
            />
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500 bg-white/80">
                Loading signature pad…
              </div>
            )}
            <div
              className="pointer-events-none absolute left-8 right-8 border-b border-dashed border-gray-400"
              style={{ bottom: '22%' }}
            />
            <div
              className="pointer-events-none absolute text-[11px] text-gray-400"
              style={{ left: 32, bottom: 'calc(22% - 18px)' }}
            >
              Sign above the line
            </div>
          </div>
        </div>
      </div>
    )
    return createPortal(content, document.getElementById('modal-root') || document.body)
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose?.() }}>
      <DialogContent className="max-w-md p-4" blurOverlay showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Sign here</DialogTitle>
          <DialogDescription className="text-xs text-gray-500">
            Draw your signature below.
          </DialogDescription>
        </DialogHeader>

        <div className="border border-gray-300 rounded-md bg-white relative">
          <canvas
            ref={desktopCanvasRef}
            style={{ touchAction: 'none', display: 'block' }}
          />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500 bg-white/80">
              Loading signature pad…
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClear}>Clear</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={isEmpty}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default SignaturePadModal
