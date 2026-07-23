import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { Stage, Layer, Group, Rect, Circle, Arrow, Line, Text, Image as KonvaImage } from 'react-konva'
import {
  Circle as CircleIcon,
  Square,
  ArrowRight,
  Minus,
  Type,
  Undo2,
  Redo2,
  Loader2,
  Save,
  Copy,
  Move,
  ChevronDown,
  Trash2,
  Pencil,
} from 'lucide-react'
import { PanelBackButton } from '../ui/panel-header'
import { Button } from '../ui/button'
import { cn } from '@/lib/utils'
import { getModalPortalContainer } from '@/utils/modalPortal'
import { normalizeAnnotationObjects, serializeAnnotationLayer } from '@/utils/photoAnnotations'
import {
  applyMove,
  applyResize,
  createDefaultTextObject,
  fitTextObjectBounds,
  getMaxTextWidth,
  normalizeTextContent,
  cloneAnnotationObjectSnapshot,
  cloneObjects,
  clientToImageCoords,
  getHandlePositions,
  DEFAULT_TEXT_FONT_SIZE,
} from './annotationGeometry'
import { AnnotationHandleLayer } from './AnnotationHandleLayer'
import { AnnotationTextEditor } from './AnnotationTextEditor'
import { arrowHeadSize, scaledStrokeWidth } from './annotationKonvaRender'
import {
  ANNOTATOR_COLORS,
  DEFAULT_ANNOTATOR_COLOR,
  DEFAULT_STROKE_WIDTH,
  STROKE_SIZE_OPTIONS,
  loadPhotoAnnotatorPrefs,
  savePhotoAnnotatorPrefs,
  strokeSizeLabel,
} from './photoAnnotatorPrefs'

const COLORS = ANNOTATOR_COLORS
const DEFAULT_COLOR = DEFAULT_ANNOTATOR_COLOR
const DEFAULT_STROKE = DEFAULT_STROKE_WIDTH
const STROKE_OPTIONS = STROKE_SIZE_OPTIONS
const COPY_OFFSET = 16
const DEFAULT_SHAPE = 'circle'

const SHAPE_OPTIONS = [
  { id: 'circle', Icon: CircleIcon, label: 'Circle' },
  { id: 'rect', Icon: Square, label: 'Rectangle' },
  { id: 'arrow', Icon: ArrowRight, label: 'Arrow' },
  { id: 'line', Icon: Minus, label: 'Line' },
]

function cloneAnnotationObject(obj) {
  const copy = { ...obj, id: `obj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }
  if (obj.type === 'circle' || obj.type === 'rect' || obj.type === 'text') {
    copy.x = (obj.x || 0) + COPY_OFFSET
    copy.y = (obj.y || 0) + COPY_OFFSET
  } else if (Array.isArray(obj.points)) {
    copy.points = obj.points.map((v) => v + COPY_OFFSET)
  }
  return copy
}

function buildShapeFromDrawing(drawing) {
  const { id, type, startX, startY, endX = startX, endY = startY, color: c, strokeWidth: sw } = drawing
  if (type === 'circle') {
    const radius = Math.max(4, Math.hypot(endX - startX, endY - startY) / 2)
    if (radius < 4) return null
    return {
      id,
      type: 'circle',
      x: Math.min(startX, endX),
      y: Math.min(startY, endY),
      radius,
      stroke: c,
      strokeWidth: sw,
    }
  }
  if (type === 'rect') {
    const width = Math.max(4, Math.abs(endX - startX))
    const height = Math.max(4, Math.abs(endY - startY))
    if (width < 4 || height < 4) return null
    return {
      id,
      type: 'rect',
      x: Math.min(startX, endX),
      y: Math.min(startY, endY),
      width,
      height,
      stroke: c,
      strokeWidth: sw,
    }
  }
  if (type === 'arrow' || type === 'line') {
    if (Math.hypot(endX - startX, endY - startY) < 4) return null
    return {
      id,
      type,
      points: [startX, startY, endX, endY],
      stroke: c,
      strokeWidth: sw,
    }
  }
  return null
}

export function PhotoAnnotatorEditor({
  open,
  image,
  loading = false,
  initialObjects = [],
  resetKey = null,
  onClose,
  onSave,
  saving = false,
}) {
  const containerRef = useRef(null)
  const stageRef = useRef(null)

  // Konva keeps canvases/caches alive unless the stage is destroyed; release
  // them when the editor unmounts.
  useEffect(() => () => {
    try {
      stageRef.current?.destroy?.()
    } catch {
      /* already destroyed */
    }
  }, [])
  const shapesBtnRef = useRef(null)
  const colorBtnRef = useRef(null)
  const strokeBtnRef = useRef(null)
  const [stageSize, setStageSize] = useState({ width: 300, height: 300 })
  const [scale, setScale] = useState(1)
  const [objects, setObjects] = useState([])
  const [history, setHistory] = useState([[]])
  const [historyIdx, setHistoryIdx] = useState(0)
  const [mode, setMode] = useState('idle')
  const [shapeKind, setShapeKind] = useState(DEFAULT_SHAPE)
  const [color, setColor] = useState(() => loadPhotoAnnotatorPrefs()?.color ?? DEFAULT_COLOR)
  const [strokeWidth, setStrokeWidth] = useState(() => loadPhotoAnnotatorPrefs()?.strokeWidth ?? DEFAULT_STROKE)
  const [selectedId, setSelectedId] = useState(null)
  const [moveHeld, setMoveHeld] = useState(false)
  const [editingTextId, setEditingTextId] = useState(null)
  const [editDraft, setEditDraft] = useState('')
  const [shapesMenuOpen, setShapesMenuOpen] = useState(false)
  const [colorMenuOpen, setColorMenuOpen] = useState(false)
  const [strokeMenuOpen, setStrokeMenuOpen] = useState(false)
  const [drawing, setDrawing] = useState(null)
  const actionPillRef = useRef(null)
  const preEditSnapshotRef = useRef(null)
  const resizeSessionRef = useRef(null)
  const moveSessionRef = useRef(null)
  const scaleRef = useRef(scale)
  const objectsRef = useRef(objects)
  const historyIdxRef = useRef(0)
  const historyRef = useRef([[]])
  objectsRef.current = objects
  scaleRef.current = scale
  historyRef.current = history

  const pushHistory = useCallback((nextObjects) => {
    const snapshot = cloneObjects(nextObjects)
    const nextHistory = [...historyRef.current.slice(0, historyIdxRef.current + 1), snapshot]
    const nextIdx = nextHistory.length - 1
    historyRef.current = nextHistory
    historyIdxRef.current = nextIdx
    setHistory(nextHistory)
    setHistoryIdx(nextIdx)
  }, [])

  const updateObjects = useCallback((next) => {
    objectsRef.current = next
    setObjects(next)
    pushHistory(next)
  }, [pushHistory])

  const setObjectsLive = useCallback((next) => {
    objectsRef.current = next
    setObjects(next)
  }, [])

  useEffect(() => {
    savePhotoAnnotatorPrefs({ color, strokeWidth })
  }, [color, strokeWidth])

  useEffect(() => {
    if (!open) return
    const objs = normalizeAnnotationObjects(initialObjects)
    const snapshot = cloneObjects(objs)
    setObjects(snapshot)
    historyIdxRef.current = 0
    historyRef.current = [snapshot]
    setHistory([snapshot])
    setHistoryIdx(0)
    setMode('idle')
    setShapeKind(DEFAULT_SHAPE)
    setSelectedId(null)
    setMoveHeld(false)
    setEditingTextId(null)
    setEditDraft('')
    setShapesMenuOpen(false)
    setColorMenuOpen(false)
    setStrokeMenuOpen(false)
    setDrawing(null)
  }, [open, resetKey, initialObjects])

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

  const positionActionPillForId = useCallback((idOverride) => {
    const pill = actionPillRef.current
    if (!pill) return false

    const activeId = idOverride ?? selectedId
    if (!activeId || !stageRef.current || !containerRef.current) {
      pill.style.display = 'none'
      return false
    }
    if (drawing && idOverride == null) {
      pill.style.display = 'none'
      return false
    }

    const stage = stageRef.current
    const node = stage.findOne(`#${activeId}`)
    if (!node) {
      pill.style.display = 'none'
      return false
    }

    const nodeRect = node.getClientRect()
    const stageEl = stage.container()
    const stageRect = stageEl.getBoundingClientRect()
    const wrapRect = containerRef.current.getBoundingClientRect()
    pill.style.display = 'flex'
    pill.style.left = `${stageRect.left - wrapRect.left + nodeRect.x + nodeRect.width / 2}px`
    pill.style.top = `${stageRect.top - wrapRect.top + nodeRect.y - 8}px`
    return true
  }, [selectedId, drawing])

  const positionActionPill = useCallback(() => {
    positionActionPillForId()
  }, [positionActionPillForId])

  const scheduleActionPill = useCallback((idOverride) => {
    let attempts = 0
    const tryPosition = () => {
      if (positionActionPillForId(idOverride)) return
      if (attempts < 8) {
        attempts += 1
        requestAnimationFrame(tryPosition)
      }
    }
    requestAnimationFrame(tryPosition)
  }, [positionActionPillForId])

  useLayoutEffect(() => {
    if (selectedId && !drawing && !editingTextId) {
      scheduleActionPill(selectedId)
    } else {
      positionActionPill()
    }
  }, [scheduleActionPill, positionActionPill, objects, stageSize, moveHeld, selectedId, drawing, editingTextId])

  useEffect(() => {
    if (!shapesMenuOpen && !colorMenuOpen && !strokeMenuOpen) return undefined
    const closeMenus = (e) => {
      if (shapesBtnRef.current?.contains(e.target)) return
      if (colorBtnRef.current?.contains(e.target)) return
      if (strokeBtnRef.current?.contains(e.target)) return
      if (e.target.closest?.('.photo-annotator-popover')) return
      setShapesMenuOpen(false)
      setColorMenuOpen(false)
      setStrokeMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeMenus)
    return () => document.removeEventListener('pointerdown', closeMenus)
  }, [shapesMenuOpen, colorMenuOpen, strokeMenuOpen])

  const clearSelection = useCallback(() => {
    setSelectedId(null)
    setMoveHeld(false)
    setEditingTextId(null)
    setEditDraft('')
  }, [])

  const openTextEditor = useCallback((objId, objHint = null) => {
    const obj = objHint || objectsRef.current.find((o) => o.id === objId)
    if (!obj || obj.type !== 'text') return
    preEditSnapshotRef.current = cloneAnnotationObjectSnapshot(obj)
    setEditingTextId(objId)
    setEditDraft(obj.text || 'Text')
    setSelectedId(objId)
    setMode('idle')
  }, [])

  const handleEditDraftChange = useCallback((draft) => {
    setEditDraft(draft)
    const objId = editingTextId
    if (!objId) return
    const obj = objectsRef.current.find((o) => o.id === objId)
    if (!obj) return
    const fontSize = obj.fontSize || DEFAULT_TEXT_FONT_SIZE
    const maxTextWidth = image ? getMaxTextWidth(image.width) : undefined
    const { width, height } = fitTextObjectBounds(draft, fontSize, maxTextWidth, { measuring: true })
    setObjects((prev) =>
      prev.map((o) => (o.id === objId ? { ...o, text: draft, width, height } : o))
    )
  }, [editingTextId, image])

  const commitTextEdit = useCallback(() => {
    if (!editingTextId) return
    const obj = objectsRef.current.find((o) => o.id === editingTextId)
    if (!obj) {
      setEditingTextId(null)
      return
    }
    const text = normalizeTextContent(editDraft)
    const fontSize = obj.fontSize || DEFAULT_TEXT_FONT_SIZE
    const maxTextWidth = image ? getMaxTextWidth(image.width) : undefined
    const { width, height } = fitTextObjectBounds(text, fontSize, maxTextWidth)
    updateObjects(
      objectsRef.current.map((o) =>
        o.id === editingTextId ? { ...o, text, width, height, fontSize } : o
      )
    )
    setEditingTextId(null)
    setEditDraft('')
    preEditSnapshotRef.current = null
    scheduleActionPill(editingTextId)
  }, [editDraft, editingTextId, image, updateObjects, scheduleActionPill])

  const cancelTextEdit = useCallback(() => {
    const snapshot = preEditSnapshotRef.current
    const objId = editingTextId
    if (snapshot && objId) {
      setObjects((prev) => prev.map((o) => (o.id === objId ? snapshot : o)))
    }
    setEditingTextId(null)
    setEditDraft('')
    preEditSnapshotRef.current = null
  }, [editingTextId])

  const handleUndo = useCallback(() => {
    if (historyIdxRef.current <= 0) return
    const nextIdx = historyIdxRef.current - 1
    const snapshot = historyRef.current[nextIdx]
    if (!snapshot) return
    historyIdxRef.current = nextIdx
    setHistoryIdx(nextIdx)
    setObjects(cloneObjects(snapshot))
    clearSelection()
  }, [clearSelection])

  const handleRedo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return
    const nextIdx = historyIdxRef.current + 1
    const snapshot = historyRef.current[nextIdx]
    if (!snapshot) return
    historyIdxRef.current = nextIdx
    setHistoryIdx(nextIdx)
    setObjects(cloneObjects(snapshot))
    clearSelection()
  }, [clearSelection])

  const selectShapeKind = (kind) => {
    setShapeKind(kind)
    setMode('shape')
    setShapesMenuOpen(false)
    clearSelection()
  }

  const handleCopySelected = () => {
    const obj = objectsRef.current.find((o) => o.id === selectedId)
    if (!obj) return
    const copy = cloneAnnotationObject(obj)
    const next = [...objectsRef.current, copy]
    updateObjects(next)
    setSelectedId(copy.id)
    scheduleActionPill(copy.id)
  }

  const handleDeleteSelected = () => {
    if (!selectedId) return
    updateObjects(objectsRef.current.filter((o) => o.id !== selectedId))
    clearSelection()
  }

  const handleResizeStart = useCallback((objId, handleId, e) => {
    e.evt?.preventDefault?.()
    e.evt?.stopPropagation?.()
    const stage = e.target.getStage()
    if (!stage) return
    const startObj = objectsRef.current.find((o) => o.id === objId)
    if (!startObj) return

    setSelectedId(objId)
    setMode('idle')
    setEditingTextId(null)

    const snapshot = cloneAnnotationObjectSnapshot(startObj)
    const stagePointer = stage.getPointerPosition()
    const handlePos = getHandlePositions(startObj).find((h) => h.id === handleId)
    let offsetX = 0
    let offsetY = 0
    if (stagePointer && handlePos) {
      offsetX = stagePointer.x / scaleRef.current - handlePos.x
      offsetY = stagePointer.y / scaleRef.current - handlePos.y
    }
    resizeSessionRef.current = { objId, handleId, snapshot, stage, offsetX, offsetY }

    const applyAtClient = (clientX, clientY) => {
      const session = resizeSessionRef.current
      if (!session) return
      const pt = clientToImageCoords(session.stage, scaleRef.current, clientX, clientY)
      if (!pt) return
      const nextObj = applyResize(
        session.snapshot,
        session.handleId,
        pt.x - session.offsetX,
        pt.y - session.offsetY
      )
      const next = objectsRef.current.map((o) => (o.id === session.objId ? nextObj : o))
      setObjectsLive(next)
    }

    const finish = () => {
      if (!resizeSessionRef.current) return
      updateObjects(objectsRef.current)
      resizeSessionRef.current = null
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
      requestAnimationFrame(() => scheduleActionPill(session.objId))
    }

    const onMouseMove = (ev) => applyAtClient(ev.clientX, ev.clientY)
    const onMouseUp = () => finish()
    const onTouchMove = (ev) => {
      const touch = ev.touches[0]
      if (touch) applyAtClient(touch.clientX, touch.clientY)
    }
    const onTouchEnd = () => finish()

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('touchcancel', onTouchEnd)
  }, [updateObjects, scheduleActionPill, setObjectsLive])

  const handleMovePointerDown = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    const obj = objectsRef.current.find((o) => o.id === selectedId)
    if (!obj) return

    moveSessionRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      snapshot: cloneAnnotationObjectSnapshot(obj),
      objId: obj.id,
    }
    setMoveHeld(true)

    const onPointerMove = (ev) => {
      const session = moveSessionRef.current
      if (!session || ev.pointerId !== session.pointerId) return
      const dx = (ev.clientX - session.startX) / scaleRef.current
      const dy = (ev.clientY - session.startY) / scaleRef.current
      const moved = applyMove(session.snapshot, dx, dy)
      const next = objectsRef.current.map((o) => (o.id === session.objId ? moved : o))
      setObjectsLive(next)
    }

    const onPointerEnd = (ev) => {
      const session = moveSessionRef.current
      if (!session || ev.pointerId !== session.pointerId) return
      const dx = (ev.clientX - session.startX) / scaleRef.current
      const dy = (ev.clientY - session.startY) / scaleRef.current
      const moved = applyMove(session.snapshot, dx, dy)
      const next = objectsRef.current.map((o) => (o.id === session.objId ? moved : o))
      updateObjects(next)
      moveSessionRef.current = null
      setMoveHeld(false)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerEnd)
      window.removeEventListener('pointercancel', onPointerEnd)
      requestAnimationFrame(() => scheduleActionPill(session.objId))
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerEnd)
    window.addEventListener('pointercancel', onPointerEnd)
  }, [selectedId, updateObjects, scheduleActionPill, setObjectsLive])

  const handleStageMouseDown = (e) => {
    if (e.target !== e.target.getStage()) {
      return
    }

    setShapesMenuOpen(false)
    setColorMenuOpen(false)
    setStrokeMenuOpen(false)

    const stage = e.target.getStage()
    const pos = stage.getPointerPosition()
    if (!pos) return

    if (mode === 'text') {
      const id = `obj_${Date.now()}`
      const maxTextWidth = image ? getMaxTextWidth(image.width) : undefined
      const newObj = createDefaultTextObject({
        id,
        x: pos.x / scale,
        y: pos.y / scale,
        fill: color,
        maxWidth: maxTextWidth,
      })
      updateObjects([...objectsRef.current, newObj])
      setSelectedId(id)
      openTextEditor(id, newObj)
      return
    }

    if (mode !== 'shape' || !shapeKind) {
      if (!editingTextId) {
        clearSelection()
      }
      setMode('idle')
      return
    }

    setDrawing({
      id: `obj_${Date.now()}`,
      type: shapeKind,
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
    const obj = buildShapeFromDrawing(drawing)
    setDrawing(null)
    setMode('idle')
    if (!obj) {
      clearSelection()
      return
    }
    updateObjects([...objectsRef.current, obj])
    setSelectedId(obj.id)
    scheduleActionPill(obj.id)
  }

  const handleSave = () => {
    onSave?.(serializeAnnotationLayer(objects).objects)
  }

  const handleSelectObject = (e, objId) => {
    e.cancelBubble = true
    setSelectedId(objId)
    setMode('idle')
    setEditingTextId(null)
    scheduleActionPill(objId)
  }

  const selectedObject = objects.find((o) => o.id === selectedId)

  const textEditorStyle = (() => {
    if (!editingTextId || !stageRef.current || !containerRef.current) return null
    const obj = objects.find((o) => o.id === editingTextId)
    if (!obj) return null
    const stageRect = stageRef.current.container().getBoundingClientRect()
    const wrapRect = containerRef.current.getBoundingClientRect()
    const fontSize = obj.fontSize || DEFAULT_TEXT_FONT_SIZE
    const maxTextWidth = image ? getMaxTextWidth(image.width) : undefined
    const { width, height } = fitTextObjectBounds(editDraft, fontSize, maxTextWidth, { measuring: true })
    return {
      left: stageRect.left - wrapRect.left + obj.x * scale,
      top: stageRect.top - wrapRect.top + obj.y * scale,
      width: width * scale,
      minHeight: height * scale,
      fontSize: fontSize * scale,
      textColor: obj.fill || obj.stroke || '#ffffff',
    }
  })()

  if (!open) return null

  const previewObj = drawing
    ? (() => {
        const { type, startX, startY, endX = startX, endY = startY, color: c, strokeWidth: sw } = drawing
        if (type === 'circle') {
          const radius = Math.max(4, Math.hypot(endX - startX, endY - startY) / 2)
          return (
            <Circle
              key="preview"
              x={Math.min(startX, endX) * scale + radius * scale}
              y={Math.min(startY, endY) * scale + radius * scale}
              radius={radius * scale}
              stroke={c}
              strokeWidth={scaledStrokeWidth(sw, scale)}
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
              strokeWidth={scaledStrokeWidth(sw, scale)}
            />
          )
        }
        if (type === 'arrow') {
          const head = arrowHeadSize(sw, scale)
          return (
            <Arrow
              key="preview"
              points={[startX, startY, endX, endY].map((v) => v * scale)}
              stroke={c}
              strokeWidth={scaledStrokeWidth(sw, scale)}
              fill={c}
              pointerLength={head}
              pointerWidth={head}
            />
          )
        }
        if (type === 'line') {
          return (
            <Line
              key="preview"
              points={[startX, startY, endX, endY].map((v) => v * scale)}
              stroke={c}
              strokeWidth={scaledStrokeWidth(sw, scale)}
            />
          )
        }
        return null
      })()
    : null

  const activeShape = SHAPE_OPTIONS.find((s) => s.id === shapeKind) ?? SHAPE_OPTIONS[0]
  const ActiveShapeIcon = activeShape.Icon
  const canUndo = historyIdx > 0
  const canRedo = historyIdx < history.length - 1

  return createPortal(
    <div className="photo-annotator-overlay map-panel" role="dialog" aria-label="Annotate photo">
      <div className="photo-annotator-header photo-annotator-header--compact">
        <PanelBackButton onClick={onClose} />
        <Button
          type="button"
          className="photo-overlay-header-btn photo-mode-btn photo-mode-btn--primary ml-auto shrink-0"
          onClick={handleSave}
          disabled={saving || loading}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
          Save
        </Button>
      </div>

      <div className="photo-annotator-body">
      <div ref={containerRef} className="photo-annotator-canvas-wrap">
        {loading ? (
          <Loader2 className="h-8 w-8 animate-spin opacity-50" />
        ) : image ? (
          <>
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
                        strokeWidth={scaledStrokeWidth(obj.strokeWidth, scale)}
                        onClick={(e) => handleSelectObject(e, obj.id)}
                        onTap={(e) => handleSelectObject(e, obj.id)}
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
                        strokeWidth={scaledStrokeWidth(obj.strokeWidth, scale)}
                        onClick={(e) => handleSelectObject(e, obj.id)}
                        onTap={(e) => handleSelectObject(e, obj.id)}
                      />
                    )
                  }
                  if (obj.type === 'arrow') {
                    const head = arrowHeadSize(obj.strokeWidth, scale)
                    return (
                      <Arrow
                        key={obj.id}
                        id={obj.id}
                        points={(obj.points || []).map((v) => v * scale)}
                        stroke={obj.stroke}
                        strokeWidth={scaledStrokeWidth(obj.strokeWidth, scale)}
                        fill={obj.stroke}
                        pointerLength={head}
                        pointerWidth={head}
                        onClick={(e) => handleSelectObject(e, obj.id)}
                        onTap={(e) => handleSelectObject(e, obj.id)}
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
                        strokeWidth={scaledStrokeWidth(obj.strokeWidth, scale)}
                        onClick={(e) => handleSelectObject(e, obj.id)}
                        onTap={(e) => handleSelectObject(e, obj.id)}
                      />
                    )
                  }
                  if (obj.type === 'text') {
                    return (
                      <Group key={obj.id}>
                        {selectedId === obj.id && editingTextId !== obj.id && (
                          <Rect
                            x={obj.x * scale}
                            y={obj.y * scale}
                            width={obj.width * scale}
                            height={obj.height * scale}
                            stroke="#93c5fd"
                            strokeWidth={1}
                            dash={[4, 4]}
                            listening={false}
                          />
                        )}
                        <Text
                          id={obj.id}
                          x={obj.x * scale}
                          y={obj.y * scale}
                          width={obj.width * scale}
                          height={obj.height * scale}
                          text={obj.text}
                          fontSize={(obj.fontSize || DEFAULT_TEXT_FONT_SIZE) * scale}
                          fill={obj.fill || obj.stroke}
                          align="center"
                          verticalAlign="middle"
                          wrap="word"
                          visible={editingTextId !== obj.id}
                          listening={editingTextId !== obj.id}
                          onClick={(e) => handleSelectObject(e, obj.id)}
                          onTap={(e) => handleSelectObject(e, obj.id)}
                          onDblClick={(e) => {
                            e.cancelBubble = true
                            openTextEditor(obj.id)
                          }}
                          onDblTap={(e) => {
                            e.cancelBubble = true
                            openTextEditor(obj.id)
                          }}
                        />
                      </Group>
                    )
                  }
                  return null
                })}
                {previewObj}
              </Layer>
              {selectedObject && !drawing && (
                <Layer listening>
                  <AnnotationHandleLayer
                    obj={selectedObject}
                    scale={scale}
                    disabled={moveHeld || Boolean(editingTextId)}
                    onResizeStart={handleResizeStart}
                  />
                </Layer>
              )}
            </Stage>

            <AnnotationTextEditor
              open={Boolean(editingTextId && textEditorStyle)}
              value={editDraft}
              style={textEditorStyle || undefined}
              onChange={handleEditDraftChange}
              onCommit={commitTextEdit}
              onCancel={cancelTextEdit}
            />

            {selectedId && !drawing && !editingTextId && (
              <div
                ref={actionPillRef}
                className="photo-annotator-shape-actions"
                style={{ display: 'none' }}
              >
                <button
                  type="button"
                  className="photo-annotator-shape-actions-btn"
                  onClick={handleCopySelected}
                  title="Copy"
                  aria-label="Copy"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={cn(
                    'photo-annotator-shape-actions-btn',
                    moveHeld && 'is-active'
                  )}
                  onPointerDown={handleMovePointerDown}
                  title="Move"
                  aria-label="Move"
                >
                  <Move className="h-4 w-4" />
                </button>
                {selectedObject?.type === 'text' && (
                  <button
                    type="button"
                    className="photo-annotator-shape-actions-btn"
                    onClick={() => openTextEditor(selectedId)}
                    title="Edit"
                    aria-label="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  className="photo-annotator-shape-actions-btn photo-annotator-shape-actions-btn--danger"
                  onClick={handleDeleteSelected}
                  title="Delete"
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        ) : null}
      </div>

      <div className="photo-annotator-toolbar">
        <div className="photo-annotator-toolbar-primary">
          <div className="photo-annotator-tool-anchor" ref={shapesBtnRef}>
            <button
              type="button"
              className={cn(
                'photo-annotator-tool-btn photo-annotator-tool-btn--shape',
                mode === 'shape' && 'is-active'
              )}
              onClick={() => {
                setColorMenuOpen(false)
                setStrokeMenuOpen(false)
                setShapesMenuOpen((v) => !v)
              }}
              title={activeShape.label}
              aria-label={`Shape: ${activeShape.label}`}
            >
              <ActiveShapeIcon className="h-6 w-6" />
              <ChevronDown className="h-4 w-4 opacity-60" />
            </button>
            {shapesMenuOpen && (
              <div className="photo-annotator-popover">
                {SHAPE_OPTIONS.map(({ id, Icon, label }) => (
                  <button
                    key={id}
                    type="button"
                    className={cn(
                      'photo-annotator-popover-btn',
                      shapeKind === id && 'is-active'
                    )}
                    onClick={() => selectShapeKind(id)}
                    title={label}
                  >
                    <Icon className="h-6 w-6" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            className={cn(
              'photo-annotator-tool-btn photo-annotator-tool-btn--text',
              mode === 'text' && 'is-active'
            )}
            aria-pressed={mode === 'text'}
            onClick={() => {
              setShapesMenuOpen(false)
              setColorMenuOpen(false)
              setStrokeMenuOpen(false)
              setShapeKind(DEFAULT_SHAPE)
              setMode((m) => (m === 'text' ? 'idle' : 'text'))
              clearSelection()
            }}
            title="Text"
          >
            <Type className="h-6 w-6" />
          </button>

          <div className="photo-annotator-tool-anchor" ref={colorBtnRef}>
            <button
              type="button"
              className="photo-annotator-tool-btn photo-annotator-tool-btn--color"
              onClick={() => {
                setShapesMenuOpen(false)
                setStrokeMenuOpen(false)
                setColorMenuOpen((v) => !v)
              }}
              title="Color"
            >
              <span className="photo-annotator-color-dot" style={{ backgroundColor: color }} />
              <ChevronDown className="h-4 w-4 opacity-60" />
            </button>
            {colorMenuOpen && (
              <div className="photo-annotator-popover photo-annotator-popover--colors">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={cn('photo-annotator-swatch', color === c && 'is-active')}
                    style={{ '--annotator-swatch-color': c }}
                    onClick={() => {
                      setColor(c)
                      setColorMenuOpen(false)
                    }}
                    title={c}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="photo-annotator-tool-anchor" ref={strokeBtnRef}>
            <button
              type="button"
              className="photo-annotator-tool-btn photo-annotator-tool-btn--stroke"
              onClick={() => {
                setShapesMenuOpen(false)
                setColorMenuOpen(false)
                setStrokeMenuOpen((v) => !v)
              }}
              title="Line thickness"
              aria-label={`Line thickness: ${strokeSizeLabel(strokeWidth)}`}
            >
              <span className="photo-annotator-stroke-size-label">{strokeSizeLabel(strokeWidth)}</span>
              <ChevronDown className="h-4 w-4 opacity-60" />
            </button>
            {strokeMenuOpen && (
              <div className="photo-annotator-popover photo-annotator-popover--stroke">
                <div className="photo-annotator-stroke-list" role="listbox" aria-label="Line thickness">
                  {STROKE_OPTIONS.map(({ id, value }) => (
                    <button
                      key={id}
                      type="button"
                      role="option"
                      aria-selected={strokeWidth === value}
                      className={cn(
                        'photo-annotator-stroke-option',
                        strokeWidth === value && 'is-active',
                      )}
                      onClick={() => {
                        setStrokeWidth(value)
                        setStrokeMenuOpen(false)
                      }}
                      title={`${id} (${value}px)`}
                      aria-label={`${id} line thickness, ${value} pixels`}
                    >
                      <span
                        className="photo-annotator-stroke-preview"
                        style={{ height: Math.max(2, value), backgroundColor: color }}
                      />
                      <span className="photo-annotator-stroke-option-label">{id}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="photo-annotator-toolbar-history">
          <button
            type="button"
            className="photo-annotator-tool-btn"
            onClick={handleUndo}
            disabled={!canUndo}
            title="Undo"
            aria-label="Undo"
          >
            <Undo2 className="h-6 w-6" />
          </button>
          <button
            type="button"
            className="photo-annotator-tool-btn"
            onClick={handleRedo}
            disabled={!canRedo}
            title="Redo"
            aria-label="Redo"
          >
            <Redo2 className="h-6 w-6" />
          </button>
        </div>
      </div>
      </div>
    </div>,
    getModalPortalContainer()
  )
}
