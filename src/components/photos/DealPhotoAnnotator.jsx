import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Stage, Layer, Rect, Circle, Arrow, Line, Text, Transformer, Image as KonvaImage } from 'react-konva'
import {
  ArrowLeft,
  Circle as CircleIcon,
  Square,
  ArrowRight,
  Minus,
  Type,
  Undo2,
  Redo2,
  Trash2,
  Loader2,
  Save,
} from 'lucide-react'
import { PanelBackButton } from '../ui/panel-header'
import { Button } from '../ui/button'
import { fetchDealPhotoBlob, saveDealPhotoAnnotations } from '@/utils/dealPhotos'
import { showToast } from '../ui/toast'
import { cn } from '@/lib/utils'
import { getModalPortalContainer } from '@/utils/modalPortal'
import { normalizeAnnotationObjects, serializeAnnotationLayer } from '@/utils/photoAnnotations'

const TOOLS = ['select', 'circle', 'rect', 'arrow', 'line', 'text']
const COLORS = ['#ef4444', '#22c55e', '#3b82f6', '#eab308', '#ffffff']
const DEFAULT_COLOR = '#ef4444'
const DEFAULT_STROKE = 3

function renderFlatImage(image, objects, width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0, width, height)

  for (const obj of objects) {
    ctx.strokeStyle = obj.stroke || DEFAULT_COLOR
    ctx.fillStyle = obj.fill || 'transparent'
    ctx.lineWidth = obj.strokeWidth || DEFAULT_STROKE
    if (obj.type === 'circle') {
      ctx.beginPath()
      ctx.arc(obj.x + obj.radius, obj.y + obj.radius, obj.radius, 0, Math.PI * 2)
      ctx.stroke()
    } else if (obj.type === 'rect') {
      ctx.strokeRect(obj.x, obj.y, obj.width, obj.height)
    } else if (obj.type === 'arrow' || obj.type === 'line') {
      const pts = obj.points || []
      if (pts.length >= 4) {
        ctx.beginPath()
        ctx.moveTo(pts[0], pts[1])
        ctx.lineTo(pts[2], pts[3])
        ctx.stroke()
        if (obj.type === 'arrow') {
          const angle = Math.atan2(pts[3] - pts[1], pts[2] - pts[0])
          const head = 12
          ctx.beginPath()
          ctx.moveTo(pts[2], pts[3])
          ctx.lineTo(pts[2] - head * Math.cos(angle - 0.4), pts[3] - head * Math.sin(angle - 0.4))
          ctx.moveTo(pts[2], pts[3])
          ctx.lineTo(pts[2] - head * Math.cos(angle + 0.4), pts[3] - head * Math.sin(angle + 0.4))
          ctx.stroke()
        }
      }
    } else if (obj.type === 'text') {
      ctx.font = `${obj.fontSize || 18}px sans-serif`
      ctx.fillStyle = obj.fill || obj.stroke || DEFAULT_COLOR
      ctx.fillText(obj.text || '', obj.x, obj.y)
    }
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.9)
  })
}

export function DealPhotoAnnotator({ open, deal, pipelineId, photo, getToken, onClose, onSaved }) {
  const containerRef = useRef(null)
  const transformerRef = useRef(null)
  const stageRef = useRef(null)
  const [image, setImage] = useState(null)
  const [stageSize, setStageSize] = useState({ width: 300, height: 300 })
  const [scale, setScale] = useState(1)
  const [objects, setObjects] = useState([])
  const [history, setHistory] = useState([[]])
  const [historyIdx, setHistoryIdx] = useState(0)
  const [tool, setTool] = useState('select')
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [strokeWidth, setStrokeWidth] = useState(DEFAULT_STROKE)
  const [selectedId, setSelectedId] = useState(null)
  const [drawing, setDrawing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const pushHistory = useCallback((nextObjects) => {
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIdx + 1)
      return [...trimmed, nextObjects]
    })
    setHistoryIdx((i) => i + 1)
  }, [historyIdx])

  const updateObjects = useCallback((next) => {
    setObjects(next)
    pushHistory(next)
  }, [pushHistory])

  useEffect(() => {
    if (!open || !photo) return undefined
    setLoading(true)
    const key = photo.annotatedKey || photo.key
    fetchDealPhotoBlob(getToken, key)
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        const img = new window.Image()
        img.onload = () => {
          setImage(img)
          const objs = normalizeAnnotationObjects(photo.annotations?.objects)
          setObjects(objs)
          setHistory([objs])
          setHistoryIdx(0)
          setLoading(false)
        }
        img.src = url
      })
      .catch(() => {
        showToast('Could not load photo', 'error')
        setLoading(false)
      })
    return () => setImage(null)
  }, [open, photo, getToken])

  useEffect(() => {
    if (!open || !containerRef.current || !image) return undefined
    const resize = () => {
      const el = containerRef.current
      if (!el) return
      const maxW = el.clientWidth
      const maxH = el.clientHeight
      const ratio = image.width / image.height
      let w = maxW
      let h = w / ratio
      if (h > maxH) {
        h = maxH
        w = h * ratio
      }
      setStageSize({ width: w, height: h })
      setScale(w / image.width)
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [open, image])

  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return
    const stage = stageRef.current
    const tr = transformerRef.current
    const node = selectedId ? stage.findOne(`#${selectedId}`) : null
    if (node) {
      tr.nodes([node])
    } else {
      tr.nodes([])
    }
    tr.getLayer()?.batchDraw()
  }, [selectedId, objects])

  const handleUndo = () => {
    if (historyIdx <= 0) return
    const nextIdx = historyIdx - 1
    setHistoryIdx(nextIdx)
    setObjects(history[nextIdx])
    setSelectedId(null)
  }

  const handleRedo = () => {
    if (historyIdx >= history.length - 1) return
    const nextIdx = historyIdx + 1
    setHistoryIdx(nextIdx)
    setObjects(history[nextIdx])
    setSelectedId(null)
  }

  const handleDeleteSelected = () => {
    if (!selectedId) return
    updateObjects(objects.filter((o) => o.id !== selectedId))
    setSelectedId(null)
  }

  const handleStageMouseDown = (e) => {
    if (tool === 'select') {
      const clicked = e.target === e.target.getStage()
      if (clicked) setSelectedId(null)
      return
    }

    const stage = e.target.getStage()
    const pos = stage.getPointerPosition()
    if (!pos) return

    const id = `obj_${Date.now()}`
    if (tool === 'text') {
      const text = window.prompt('Label text') || ''
      if (!text.trim()) return
      updateObjects([
        ...objects,
        {
          id,
          type: 'text',
          x: pos.x / scale,
          y: pos.y / scale,
          text: text.trim(),
          fill: color,
          fontSize: 18,
        },
      ])
      return
    }

    setDrawing({
      id,
      type: tool,
      startX: pos.x / scale,
      startY: pos.y / scale,
      color,
      strokeWidth,
    })
  }

  const handleStageMouseMove = (e) => {
    if (!drawing) return
    const stage = e.target.getStage()
    const pos = stage.getPointerPosition()
    if (!pos) return
    setDrawing((d) => ({ ...d, endX: pos.x / scale, endY: pos.y / scale }))
  }

  const handleStageMouseUp = () => {
    if (!drawing) return
    const { id, type, startX, startY, endX = startX, endY = startY, color: c, strokeWidth: sw } = drawing
    let obj = null
    if (type === 'circle') {
      const radius = Math.max(4, Math.hypot(endX - startX, endY - startY) / 2)
      obj = {
        id,
        type: 'circle',
        x: Math.min(startX, endX),
        y: Math.min(startY, endY),
        radius,
        stroke: c,
        strokeWidth: sw,
      }
    } else if (type === 'rect') {
      obj = {
        id,
        type: 'rect',
        x: Math.min(startX, endX),
        y: Math.min(startY, endY),
        width: Math.max(4, Math.abs(endX - startX)),
        height: Math.max(4, Math.abs(endY - startY)),
        stroke: c,
        strokeWidth: sw,
      }
    } else if (type === 'arrow' || type === 'line') {
      obj = {
        id,
        type,
        points: [startX, startY, endX, endY],
        stroke: c,
        strokeWidth: sw,
      }
    }
    if (obj) updateObjects([...objects, obj])
    setDrawing(null)
  }

  const handleSave = async () => {
    if (!image || !photo) return
    setSaving(true)
    try {
      const annotatedBlob = await renderFlatImage(image, objects, image.width, image.height)
      const { deal: updated } = await saveDealPhotoAnnotations(getToken, {
        pipelineId,
        dealId: deal.id,
        photoId: photo.id,
        annotations: serializeAnnotationLayer(objects),
        annotatedBlob,
        existingPhotos: deal.photos || [],
      })
      showToast('Annotations saved', 'success')
      onSaved?.(updated)
    } catch (e) {
      showToast(e.message || 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!open || !photo) return null

  const previewObj = drawing
    ? (() => {
        const { type, startX, startY, endX = startX, endY = startY, color: c, strokeWidth: sw, id } = drawing
        if (type === 'circle') {
          const radius = Math.max(4, Math.hypot(endX - startX, endY - startY) / 2)
          return (
            <Circle
              key="preview"
              x={Math.min(startX, endX) * scale + radius * scale}
              y={Math.min(startY, endY) * scale + radius * scale}
              radius={radius * scale}
              stroke={c}
              strokeWidth={sw}
            />
          )
        }
        if (type === 'rect') {
          return (
            <Rect
              key="preview"
              x={Math.min(startX, endX) * scale}
              y={Math.min(startY, endY) * scale}
              width={Math.abs(endX - startX) * scale}
              height={Math.abs(endY - startY) * scale}
              stroke={c}
              strokeWidth={sw}
            />
          )
        }
        if (type === 'arrow') {
          return (
            <Arrow
              key="preview"
              points={[startX, startY, endX, endY].map((v) => v * scale)}
              stroke={c}
              strokeWidth={sw}
              fill={c}
            />
          )
        }
        if (type === 'line') {
          return (
            <Line
              key="preview"
              points={[startX, startY, endX, endY].map((v) => v * scale)}
              stroke={c}
              strokeWidth={sw}
            />
          )
        }
        return null
      })()
    : null

  return createPortal(
    <div className="photo-annotator-overlay" role="dialog" aria-label="Annotate photo">
      <div className="photo-annotator-header">
        <PanelBackButton onClick={onClose} />
        <span className="text-sm font-medium flex-1 text-center">Annotate</span>
        <Button type="button" size="sm" onClick={handleSave} disabled={saving || loading}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
          Save
        </Button>
      </div>

      <div ref={containerRef} className="photo-annotator-canvas-wrap">
        {loading ? (
          <Loader2 className="h-8 w-8 animate-spin opacity-50" />
        ) : image ? (
          <Stage
            ref={stageRef}
            width={stageSize.width}
            height={stageSize.height}
            onMouseDown={handleStageMouseDown}
            onMouseMove={handleStageMouseMove}
            onMouseUp={handleStageMouseUp}
            onTouchStart={handleStageMouseDown}
            onTouchMove={handleStageMouseMove}
            onTouchEnd={handleStageMouseUp}
          >
            <Layer>
              <KonvaImage
                image={image}
                x={0}
                y={0}
                width={stageSize.width}
                height={stageSize.height}
                listening={false}
              />
              {objects.map((obj) => {
                if (obj.type === 'circle') {
                  return (
                    <Circle
                      key={obj.id}
                      id={obj.id}
                      x={(obj.x + obj.radius) * scale}
                      y={(obj.y + obj.radius) * scale}
                      radius={obj.radius * scale}
                      stroke={obj.stroke}
                      strokeWidth={obj.strokeWidth}
                      draggable={tool === 'select'}
                      onClick={() => setSelectedId(obj.id)}
                      onDragEnd={(e) => {
                        const nx = e.target.x() / scale - obj.radius
                        const ny = e.target.y() / scale - obj.radius
                        setObjects((prev) => prev.map((o) => (o.id === obj.id ? { ...o, x: nx, y: ny } : o)))
                      }}
                    />
                  )
                }
                if (obj.type === 'rect') {
                  return (
                    <Rect
                      key={obj.id}
                      id={obj.id}
                      x={obj.x * scale}
                      y={obj.y * scale}
                      width={obj.width * scale}
                      height={obj.height * scale}
                      stroke={obj.stroke}
                      strokeWidth={obj.strokeWidth}
                      draggable={tool === 'select'}
                      onClick={() => setSelectedId(obj.id)}
                      onDragEnd={(e) => {
                        setObjects((prev) =>
                          prev.map((o) =>
                            o.id === obj.id ? { ...o, x: e.target.x() / scale, y: e.target.y() / scale } : o
                          )
                        )
                      }}
                    />
                  )
                }
                if (obj.type === 'arrow') {
                  return (
                    <Arrow
                      key={obj.id}
                      id={obj.id}
                      points={(obj.points || []).map((v) => v * scale)}
                      stroke={obj.stroke}
                      strokeWidth={obj.strokeWidth}
                      fill={obj.stroke}
                      draggable={tool === 'select'}
                      onClick={() => setSelectedId(obj.id)}
                    />
                  )
                }
                if (obj.type === 'line') {
                  return (
                    <Line
                      key={obj.id}
                      id={obj.id}
                      points={(obj.points || []).map((v) => v * scale)}
                      stroke={obj.stroke}
                      strokeWidth={obj.strokeWidth}
                      draggable={tool === 'select'}
                      onClick={() => setSelectedId(obj.id)}
                    />
                  )
                }
                if (obj.type === 'text') {
                  return (
                    <Text
                      key={obj.id}
                      id={obj.id}
                      x={obj.x * scale}
                      y={obj.y * scale}
                      text={obj.text}
                      fontSize={(obj.fontSize || 18) * scale}
                      fill={obj.fill || obj.stroke}
                      draggable={tool === 'select'}
                      onClick={() => setSelectedId(obj.id)}
                      onDragEnd={(e) => {
                        setObjects((prev) =>
                          prev.map((o) =>
                            o.id === obj.id ? { ...o, x: e.target.x() / scale, y: e.target.y() / scale } : o
                          )
                        )
                      }}
                    />
                  )
                }
                return null
              })}
              {previewObj}
              <Transformer ref={transformerRef} rotateEnabled={false} />
            </Layer>
          </Stage>
        ) : null}
      </div>

      <div className="photo-annotator-toolbar">
        <div className="photo-annotator-tools">
          {[
            { id: 'circle', Icon: CircleIcon },
            { id: 'rect', Icon: Square },
            { id: 'arrow', Icon: ArrowRight },
            { id: 'line', Icon: Minus },
            { id: 'text', Icon: Type },
          ].map(({ id, Icon }) => (
            <button
              key={id}
              type="button"
              className={cn('photo-annotator-tool-btn', tool === id && 'is-active')}
              onClick={() => setTool(id)}
              title={id}
            >
              <Icon className="h-5 w-5" />
            </button>
          ))}
        </div>
        <div className="photo-annotator-colors">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={cn('photo-annotator-swatch', color === c && 'is-active')}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <div className="photo-annotator-actions">
          <button type="button" className="photo-annotator-tool-btn" onClick={handleUndo} title="Undo">
            <Undo2 className="h-5 w-5" />
          </button>
          <button type="button" className="photo-annotator-tool-btn" onClick={handleRedo} title="Redo">
            <Redo2 className="h-5 w-5" />
          </button>
          <button type="button" className="photo-annotator-tool-btn" onClick={handleDeleteSelected} title="Delete">
            <Trash2 className="h-5 w-5" />
          </button>
          <input
            type="range"
            min={1}
            max={8}
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(Number(e.target.value))}
            className="photo-annotator-stroke-slider"
            title="Stroke width"
          />
        </div>
      </div>
    </div>,
    getModalPortalContainer()
  )
}
