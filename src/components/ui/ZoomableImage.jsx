import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import {
  clampPan,
  clampScale,
  DOUBLE_TAP_SCALE,
  isZoomed,
  touchCenter,
  touchDistance,
  wheelScaleDelta,
} from '@/utils/zoomableImage'

const DOUBLE_TAP_MS = 300

export const ZoomableImage = forwardRef(function ZoomableImage(
  { src, alt, className, resetKey },
  ref,
) {
  const stageRef = useRef(null)
  const imgRef = useRef(null)
  const [transform, setTransform] = useState({ scale: 1, translateX: 0, translateY: 0 })
  const pinchRef = useRef(null)
  const panRef = useRef(null)
  const lastTapRef = useRef(0)

  const resetTransform = useCallback(() => {
    setTransform({ scale: 1, translateX: 0, translateY: 0 })
    pinchRef.current = null
    panRef.current = null
  }, [])

  useEffect(() => {
    resetTransform()
  }, [resetKey, src, resetTransform])

  useImperativeHandle(ref, () => ({
    isZoomed: () => isZoomed(transform.scale),
    reset: resetTransform,
  }), [transform.scale, resetTransform])

  const getMetrics = useCallback(() => {
    const stage = stageRef.current
    const img = imgRef.current
    if (!stage || !img) return null
    return {
      containerWidth: stage.clientWidth,
      containerHeight: stage.clientHeight,
      imageWidth: img.clientWidth,
      imageHeight: img.clientHeight,
    }
  }, [])

  const applyTransform = useCallback((next) => {
    const metrics = getMetrics()
    if (!metrics) {
      setTransform(next)
      return
    }
    const clamped = clampPan({
      ...metrics,
      translateX: next.translateX,
      translateY: next.translateY,
      scale: next.scale,
    })
    setTransform({ scale: next.scale, ...clamped })
  }, [getMetrics])

  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      e.stopPropagation()
      const [t1, t2] = e.touches
      pinchRef.current = {
        startDistance: touchDistance(t1, t2),
        startScale: transform.scale,
        startTranslateX: transform.translateX,
        startTranslateY: transform.translateY,
        startCenter: touchCenter(t1, t2),
      }
      panRef.current = null
      return
    }

    if (e.touches.length === 1 && isZoomed(transform.scale)) {
      e.stopPropagation()
      const t = e.touches[0]
      panRef.current = {
        startX: t.clientX,
        startY: t.clientY,
        startTranslateX: transform.translateX,
        startTranslateY: transform.translateY,
      }
    }
  }

  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault()
      e.stopPropagation()
      const [t1, t2] = e.touches
      const distance = touchDistance(t1, t2)
      const scale = clampScale(
        pinchRef.current.startScale * (distance / pinchRef.current.startDistance),
      )
      applyTransform({
        scale,
        translateX: pinchRef.current.startTranslateX,
        translateY: pinchRef.current.startTranslateY,
      })
      return
    }

    if (e.touches.length === 1 && panRef.current) {
      e.preventDefault()
      e.stopPropagation()
      const t = e.touches[0]
      const dx = t.clientX - panRef.current.startX
      const dy = t.clientY - panRef.current.startY
      applyTransform({
        scale: transform.scale,
        translateX: panRef.current.startTranslateX + dx,
        translateY: panRef.current.startTranslateY + dy,
      })
    }
  }

  const handleTouchEnd = (e) => {
    if (e.touches.length < 2) pinchRef.current = null
    if (e.touches.length === 0) panRef.current = null

    if (e.changedTouches.length !== 1 || pinchRef.current) return
    const now = Date.now()
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      e.preventDefault()
      e.stopPropagation()
      if (isZoomed(transform.scale)) {
        resetTransform()
      } else {
        applyTransform({
          scale: DOUBLE_TAP_SCALE,
          translateX: 0,
          translateY: 0,
        })
      }
      lastTapRef.current = 0
      return
    }
    lastTapRef.current = now
  }

  const handleWheel = (e) => {
    e.preventDefault()
    const nextScale = wheelScaleDelta(e.deltaY, transform.scale)
    applyTransform({
      scale: nextScale,
      translateX: transform.translateX,
      translateY: transform.translateY,
    })
  }

  return (
    <div
      ref={stageRef}
      className="file-preview-zoom-stage"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className={className}
        draggable={false}
        style={{
          transform: `translate3d(${transform.translateX}px, ${transform.translateY}px, 0) scale(${transform.scale})`,
        }}
        onLoad={() => {
          if (isZoomed(transform.scale)) {
            applyTransform(transform)
          }
        }}
      />
    </div>
  )
})
