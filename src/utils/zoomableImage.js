export const MIN_SCALE = 1
export const MAX_SCALE = 4
export const DOUBLE_TAP_SCALE = 2
export const ZOOMED_THRESHOLD = 1.01

export function touchDistance(t1, t2) {
  const dx = t2.clientX - t1.clientX
  const dy = t2.clientY - t1.clientY
  return Math.hypot(dx, dy)
}

export function touchCenter(t1, t2) {
  return {
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2,
  }
}

export function clampScale(scale) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

export function isZoomed(scale) {
  return scale > ZOOMED_THRESHOLD
}

export function shouldAllowGallerySwipe({ scale, touchCount }) {
  return touchCount === 1 && !isZoomed(scale)
}

export function getGalleryDragAxis({ deltaX, deltaY, intentThreshold = 8 }) {
  if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < intentThreshold) return null
  return Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical'
}

export function getGallerySwipeAction({
  deltaX,
  deltaY,
  elapsedMs,
  canGoPrev,
  canGoNext,
  distanceThreshold = 48,
  velocityThreshold = 0.45,
}) {
  if (Math.abs(deltaX) <= Math.abs(deltaY)) return null

  const velocity = elapsedMs > 0 ? Math.abs(deltaX) / elapsedMs : 0
  const hasEnoughIntent = Math.abs(deltaX) >= distanceThreshold
    || (Math.abs(deltaX) >= 16 && velocity >= velocityThreshold)

  if (!hasEnoughIntent) return null
  if (deltaX > 0) return canGoPrev ? 'prev' : null
  return canGoNext ? 'next' : null
}

export function clampPan({
  translateX,
  translateY,
  scale,
  containerWidth,
  containerHeight,
  imageWidth,
  imageHeight,
}) {
  if (scale <= MIN_SCALE || !containerWidth || !containerHeight || !imageWidth || !imageHeight) {
    return { translateX: 0, translateY: 0 }
  }

  const scaledW = imageWidth * scale
  const scaledH = imageHeight * scale
  const maxX = Math.max(0, (scaledW - containerWidth) / 2)
  const maxY = Math.max(0, (scaledH - containerHeight) / 2)

  return {
    translateX: Math.min(maxX, Math.max(-maxX, translateX)),
    translateY: Math.min(maxY, Math.max(-maxY, translateY)),
  }
}

export function applyPinchScale({
  startScale,
  startDistance,
  currentDistance,
}) {
  if (!startDistance) return clampScale(startScale)
  return clampScale(startScale * (currentDistance / startDistance))
}

export function wheelScaleDelta(deltaY, currentScale) {
  const factor = deltaY < 0 ? 1.1 : 0.9
  return clampScale(currentScale * factor)
}
