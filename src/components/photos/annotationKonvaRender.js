import Konva from 'konva'
import {
  DEFAULT_TEXT_FONT_SIZE,
  scaledAnnotationStrokeWidth,
  annotationArrowHeadSize,
} from './annotationGeometry'

export const DEFAULT_COLOR = '#ef4444'
export const DEFAULT_STROKE = 3

export { scaledAnnotationStrokeWidth as scaledStrokeWidth, annotationArrowHeadSize as arrowHeadSize }

/** Imperative Konva render — shared by editor export and flat JPEG bake. */
export function appendAnnotationObject(layer, obj, scale = 1) {
  if (!obj || !layer) return

  if (obj.type === 'circle') {
    layer.add(new Konva.Circle({
      x: (obj.x + obj.radius) * scale,
      y: (obj.y + obj.radius) * scale,
      radius: obj.radius * scale,
      stroke: obj.stroke || DEFAULT_COLOR,
      strokeWidth: scaledAnnotationStrokeWidth(obj.strokeWidth, scale),
      listening: false,
    }))
    return
  }

  if (obj.type === 'rect') {
    layer.add(new Konva.Rect({
      x: obj.x * scale,
      y: obj.y * scale,
      width: obj.width * scale,
      height: obj.height * scale,
      stroke: obj.stroke || DEFAULT_COLOR,
      strokeWidth: scaledAnnotationStrokeWidth(obj.strokeWidth, scale),
      listening: false,
    }))
    return
  }

  if (obj.type === 'arrow') {
    const head = annotationArrowHeadSize(obj.strokeWidth, scale)
    layer.add(new Konva.Arrow({
      points: (obj.points || []).map((v) => v * scale),
      stroke: obj.stroke || DEFAULT_COLOR,
      strokeWidth: scaledAnnotationStrokeWidth(obj.strokeWidth, scale),
      fill: obj.stroke || DEFAULT_COLOR,
      pointerLength: head,
      pointerWidth: head,
      listening: false,
    }))
    return
  }

  if (obj.type === 'line') {
    layer.add(new Konva.Line({
      points: (obj.points || []).map((v) => v * scale),
      stroke: obj.stroke || DEFAULT_COLOR,
      strokeWidth: scaledAnnotationStrokeWidth(obj.strokeWidth, scale),
      listening: false,
    }))
    return
  }

  if (obj.type === 'text') {
    layer.add(new Konva.Text({
      x: obj.x * scale,
      y: obj.y * scale,
      width: obj.width * scale,
      height: obj.height * scale,
      text: obj.text || '',
      fontSize: (obj.fontSize || DEFAULT_TEXT_FONT_SIZE) * scale,
      fill: obj.fill || obj.stroke || DEFAULT_COLOR,
      align: 'center',
      verticalAlign: 'middle',
      wrap: 'word',
      listening: false,
    }))
  }
}
