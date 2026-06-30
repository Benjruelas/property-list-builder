export const MIN_RADIUS = 4
export const MIN_BOX_SIZE = 4
export const MIN_TEXT_WIDTH = 120
export const MIN_TEXT_HEIGHT = 72
export const DEFAULT_TEXT_WIDTH = 280
export const DEFAULT_TEXT_HEIGHT = 96
export const MIN_TEXT_FONT_SIZE = 12
export const DEFAULT_TEXT_FONT_SIZE = 72
export const TEXT_MAX_WIDTH_RATIO = 0.85
export const TEXT_SINGLE_LINE_MIN_WIDTH_RATIO = 0.5

export const ANNOTATION_DEFAULT_STROKE = 3

/** Image-space stroke width → stage/canvas pixels (matches editor preview at any zoom). */
export function scaledAnnotationStrokeWidth(strokeWidth, scale) {
  return (strokeWidth ?? ANNOTATION_DEFAULT_STROKE) * scale
}

export function annotationArrowHeadSize(strokeWidth, scale) {
  return Math.max(6, (strokeWidth ?? ANNOTATION_DEFAULT_STROKE) * 3 * scale)
}

export function getMaxTextWidth(imageWidth) {
  if (!imageWidth || imageWidth <= 0) return undefined
  return imageWidth * TEXT_MAX_WIDTH_RATIO
}

export function wrapTextLines(text, fontSize, boxWidth) {
  const padding = fontSize * 0.35
  const contentWidth = Math.max(fontSize, boxWidth - padding * 2)
  const avgCharWidth = fontSize * 0.58
  const charsPerLine = Math.max(1, Math.floor(contentWidth / avgCharWidth))
  const raw = String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const explicitLines = raw.length ? raw.split('\n') : ['']
  const wrapped = []

  for (const line of explicitLines) {
    if (!line) {
      wrapped.push('')
      continue
    }
    let start = 0
    while (start < line.length) {
      wrapped.push(line.slice(start, start + charsPerLine))
      start += charsPerLine
    }
  }

  return wrapped.length ? wrapped : ['']
}

function textExplicitLines(text) {
  const raw = String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  return raw.length ? raw.split('\n') : ['']
}

function textUncappedWidth(explicitLines, fontSize) {
  const padding = fontSize * 0.35
  const avgCharWidth = fontSize * 0.58
  let maxLineWidth = 0
  for (const line of explicitLines) {
    maxLineWidth = Math.max(maxLineWidth, line.length * avgCharWidth)
  }
  return Math.max(MIN_TEXT_WIDTH, maxLineWidth + padding * 2)
}

export function shouldWrapTextToWidth(text, fontSize, boxWidth) {
  const explicitLines = textExplicitLines(text)
  return textUncappedWidth(explicitLines, fontSize) > boxWidth + 0.5
}

export function getTextLayoutLines(text, fontSize, boxWidth) {
  const explicitLines = textExplicitLines(text)
  if (!shouldWrapTextToWidth(text, fontSize, boxWidth)) {
    return explicitLines
  }
  return wrapTextLines(text, fontSize, boxWidth)
}

export function cloneAnnotationObjectSnapshot(obj) {
  if (!obj) return obj
  const copy = { ...obj }
  if (Array.isArray(obj.points)) copy.points = [...obj.points]
  return copy
}

export function cloneObjects(objects) {
  if (!Array.isArray(objects)) return []
  return objects.map(cloneAnnotationObjectSnapshot)
}

export function clientToImageCoords(stage, scale, clientX, clientY) {
  if (!stage) return null
  const rect = stage.container().getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  const x = ((clientX - rect.left) / rect.width) * stage.width()
  const y = ((clientY - rect.top) / rect.height) * stage.height()
  return { x: x / scale, y: y / scale }
}

export function circleCenter(obj) {
  return {
    x: obj.x + obj.radius,
    y: obj.y + obj.radius,
  }
}

export function getHandlePositions(obj) {
  if (obj.type === 'circle') {
    const c = circleCenter(obj)
    const angle = obj.radiusAngle ?? 0
    return [{ id: 'radius', x: c.x + obj.radius * Math.cos(angle), y: c.y + obj.radius * Math.sin(angle) }]
  }
  if (obj.type === 'rect' || obj.type === 'text') {
    const w = obj.width ?? DEFAULT_TEXT_WIDTH
    const h = obj.height ?? DEFAULT_TEXT_HEIGHT
    return [
      { id: 'nw', x: obj.x, y: obj.y },
      { id: 'ne', x: obj.x + w, y: obj.y },
      { id: 'sw', x: obj.x, y: obj.y + h },
      { id: 'se', x: obj.x + w, y: obj.y + h },
    ]
  }
  if (obj.type === 'arrow' || obj.type === 'line') {
    const pts = obj.points || [0, 0, 0, 0]
    return [
      { id: 'start', x: pts[0], y: pts[1] },
      { id: 'end', x: pts[2], y: pts[3] },
    ]
  }
  return []
}

export function applyMove(obj, dx, dy) {
  if (obj.type === 'circle' || obj.type === 'rect' || obj.type === 'text') {
    return { ...obj, x: obj.x + dx, y: obj.y + dy }
  }
  if (obj.type === 'arrow' || obj.type === 'line') {
    const pts = obj.points || [0, 0, 0, 0]
    return {
      ...obj,
      points: [pts[0] + dx, pts[1] + dy, pts[2] + dx, pts[3] + dy],
    }
  }
  return obj
}

/** Resize from drag-start snapshot + pointer — avoids compounding drift/jump per frame. */
export function applyResize(snapshot, handleId, pointerX, pointerY) {
  if (snapshot.type === 'circle' && handleId === 'radius') {
    const centerX = snapshot.x + snapshot.radius
    const centerY = snapshot.y + snapshot.radius
    const dx = pointerX - centerX
    const dy = pointerY - centerY
    const radius = Math.max(MIN_RADIUS, Math.hypot(dx, dy))
    const radiusAngle = Math.atan2(dy, dx)
    return {
      ...snapshot,
      x: centerX - radius,
      y: centerY - radius,
      radius,
      radiusAngle,
    }
  }

  if (snapshot.type === 'text') {
    return applyTextProportionalResize(snapshot, handleId, pointerX, pointerY)
  }

  if (snapshot.type === 'rect') {
    const minW = snapshot.type === 'text' ? MIN_TEXT_WIDTH : MIN_BOX_SIZE
    const minH = snapshot.type === 'text' ? MIN_TEXT_HEIGHT : MIN_BOX_SIZE
    const startX = snapshot.x
    const startY = snapshot.y
    const startW = snapshot.width ?? DEFAULT_TEXT_WIDTH
    const startH = snapshot.height ?? DEFAULT_TEXT_HEIGHT
    const anchorRight = startX + startW
    const anchorBottom = startY + startH

    if (handleId === 'se') {
      return {
        ...snapshot,
        x: startX,
        y: startY,
        width: Math.max(minW, pointerX - startX),
        height: Math.max(minH, pointerY - startY),
      }
    }
    if (handleId === 'sw') {
      const newX = Math.min(pointerX, anchorRight - minW)
      return {
        ...snapshot,
        x: newX,
        y: startY,
        width: anchorRight - newX,
        height: Math.max(minH, pointerY - startY),
      }
    }
    if (handleId === 'ne') {
      const newY = Math.min(pointerY, anchorBottom - minH)
      return {
        ...snapshot,
        x: startX,
        y: newY,
        width: Math.max(minW, pointerX - startX),
        height: anchorBottom - newY,
      }
    }
    if (handleId === 'nw') {
      const newX = Math.min(pointerX, anchorRight - minW)
      const newY = Math.min(pointerY, anchorBottom - minH)
      return {
        ...snapshot,
        x: newX,
        y: newY,
        width: anchorRight - newX,
        height: anchorBottom - newY,
      }
    }
  }

  if (snapshot.type === 'arrow' || snapshot.type === 'line') {
    const pts = [...(snapshot.points || [0, 0, 0, 0])]
    if (handleId === 'start') {
      pts[0] = pointerX
      pts[1] = pointerY
    } else if (handleId === 'end') {
      pts[2] = pointerX
      pts[3] = pointerY
    }
    return { ...snapshot, points: pts }
  }

  return snapshot
}

export function applyTextProportionalResize(snapshot, handleId, pointerX, pointerY) {
  const startX = snapshot.x
  const startY = snapshot.y
  const startW = snapshot.width ?? DEFAULT_TEXT_WIDTH
  const startH = snapshot.height ?? DEFAULT_TEXT_HEIGHT
  const startFont = snapshot.fontSize ?? DEFAULT_TEXT_FONT_SIZE
  const anchorRight = startX + startW
  const anchorBottom = startY + startH

  let scaleX = 1
  let scaleY = 1

  if (handleId === 'se') {
    scaleX = (pointerX - startX) / startW
    scaleY = (pointerY - startY) / startH
  } else if (handleId === 'sw') {
    scaleX = (anchorRight - pointerX) / startW
    scaleY = (pointerY - startY) / startH
  } else if (handleId === 'ne') {
    scaleX = (pointerX - startX) / startW
    scaleY = (anchorBottom - pointerY) / startH
  } else if (handleId === 'nw') {
    scaleX = (anchorRight - pointerX) / startW
    scaleY = (anchorBottom - pointerY) / startH
  } else {
    return snapshot
  }

  const minScale = Math.max(
    MIN_TEXT_WIDTH / startW,
    MIN_TEXT_HEIGHT / startH,
    MIN_TEXT_FONT_SIZE / startFont
  )
  const scale = Math.max(minScale, Math.min(scaleX, scaleY))

  const newW = startW * scale
  const newH = startH * scale
  const newFont = startFont * scale

  let newX = startX
  let newY = startY
  if (handleId === 'sw' || handleId === 'nw') {
    newX = anchorRight - newW
  }
  if (handleId === 'ne' || handleId === 'nw') {
    newY = anchorBottom - newH
  }

  return {
    ...snapshot,
    x: newX,
    y: newY,
    width: newW,
    height: newH,
    fontSize: newFont,
  }
}

export function fitTextObjectBounds(text, fontSize = DEFAULT_TEXT_FONT_SIZE, maxWidth, options = {}) {
  const { measuring = false } = options
  const padding = fontSize * 0.35
  const raw = String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const content = measuring ? raw : normalizeTextContent(text)
  const explicitLines = content.length ? content.split('\n') : ['']
  const lineHeight = fontSize * 1.2
  const uncappedWidth = textUncappedWidth(explicitLines, fontSize)
  let width = uncappedWidth
  const isSingleExplicitLine = explicitLines.length === 1
  if (isSingleExplicitLine && maxWidth) {
    const minWidth = Math.max(MIN_TEXT_WIDTH, maxWidth * TEXT_SINGLE_LINE_MIN_WIDTH_RATIO)
    width = Math.min(Math.max(width, minWidth), maxWidth)
  } else if (maxWidth) {
    width = Math.min(Math.max(width, MIN_TEXT_WIDTH), maxWidth)
  }

  const layoutLines = shouldWrapTextToWidth(content, fontSize, width)
    ? wrapTextLines(content, fontSize, width)
    : explicitLines

  return {
    width,
    height: Math.max(MIN_TEXT_HEIGHT, layoutLines.length * lineHeight + padding * 2),
  }
}

export function createDefaultTextObject({ id, x, y, fill, maxWidth }) {
  const fontSize = DEFAULT_TEXT_FONT_SIZE
  const { width, height } = fitTextObjectBounds('Text', fontSize, maxWidth)
  return {
    id,
    type: 'text',
    x,
    y,
    text: 'Text',
    fill,
    fontSize,
    width,
    height,
  }
}

export function estimateTextBoxHeight(text, width, fontSize) {
  if (!text) return MIN_TEXT_HEIGHT
  const avgCharWidth = fontSize * 0.55
  const charsPerLine = Math.max(1, Math.floor(width / avgCharWidth))
  const lines = String(text).split('\n')
  let totalLines = 0
  for (const line of lines) {
    totalLines += Math.max(1, Math.ceil(line.length / charsPerLine))
  }
  return Math.max(MIN_TEXT_HEIGHT, totalLines * fontSize * 1.25)
}

export function normalizeTextContent(text) {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const trimmed = normalized.replace(/\s+$/, '')
  return trimmed || 'Text'
}

export function textDisplayLines(text) {
  return normalizeTextContent(text).split('\n')
}
