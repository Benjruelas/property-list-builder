import { Circle as KonvaCircle } from 'react-konva'
import { getHandlePositions } from './annotationGeometry'

export const HANDLE_RADIUS = 8

export function AnnotationHandleLayer({
  obj,
  scale,
  disabled = false,
  onResizeStart,
}) {
  if (!obj || disabled) return null

  const handles = getHandlePositions(obj)

  const startResize = (handleId, e) => {
    e.cancelBubble = true
    e.evt?.preventDefault?.()
    e.evt?.stopPropagation?.()
    onResizeStart?.(obj.id, handleId, e)
  }

  return handles.map((handle) => (
    <KonvaCircle
      key={`${obj.id}-${handle.id}`}
      name="annotation-handle"
      x={handle.x * scale}
      y={handle.y * scale}
      radius={HANDLE_RADIUS}
      fill="#ffffff"
      stroke="#93c5fd"
      strokeWidth={2}
      hitStrokeWidth={16}
      onMouseDown={(e) => startResize(handle.id, e)}
      onTouchStart={(e) => startResize(handle.id, e)}
    />
  ))
}
