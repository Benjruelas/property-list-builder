import { getTextLayoutLines, DEFAULT_TEXT_FONT_SIZE } from './annotationGeometry'

const DEFAULT_COLOR = '#ef4444'
const DEFAULT_STROKE = 3

export function renderFlatImage(image, objects, width, height) {
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
      const fontSize = obj.fontSize || DEFAULT_TEXT_FONT_SIZE
      const boxWidth = obj.width || 280
      const boxHeight = obj.height || fontSize * 1.5
      ctx.font = `${fontSize}px sans-serif`
      ctx.fillStyle = obj.fill || obj.stroke || DEFAULT_COLOR
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const lines = getTextLayoutLines(obj.text, fontSize, boxWidth)
      const lineHeight = fontSize * 1.2
      const blockHeight = lines.length * lineHeight
      const startY = obj.y + (boxHeight - blockHeight) / 2 + lineHeight / 2
      lines.forEach((line, index) => {
        ctx.fillText(line, obj.x + boxWidth / 2, startY + index * lineHeight)
      })
    }
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.9)
  })
}
