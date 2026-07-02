import { describe, expect, it } from 'vitest'
import {
  applyPinchScale,
  clampPan,
  clampScale,
  isZoomed,
  MAX_SCALE,
  MIN_SCALE,
  shouldAllowGallerySwipe,
  touchDistance,
  wheelScaleDelta,
} from '@/utils/zoomableImage'

describe('clampScale', () => {
  it('clamps between min and max scale', () => {
    expect(clampScale(0.5)).toBe(MIN_SCALE)
    expect(clampScale(2)).toBe(2)
    expect(clampScale(10)).toBe(MAX_SCALE)
  })
})

describe('isZoomed', () => {
  it('returns true only above threshold', () => {
    expect(isZoomed(1)).toBe(false)
    expect(isZoomed(1.02)).toBe(true)
  })
})

describe('shouldAllowGallerySwipe', () => {
  it('allows swipe with one finger at base scale', () => {
    expect(shouldAllowGallerySwipe({ scale: 1, touchCount: 1 })).toBe(true)
  })

  it('blocks swipe when zoomed or using multiple touches', () => {
    expect(shouldAllowGallerySwipe({ scale: 2, touchCount: 1 })).toBe(false)
    expect(shouldAllowGallerySwipe({ scale: 1, touchCount: 2 })).toBe(false)
  })
})

describe('touchDistance', () => {
  it('computes distance between two touch points', () => {
    const d = touchDistance(
      { clientX: 0, clientY: 0 },
      { clientX: 3, clientY: 4 },
    )
    expect(d).toBe(5)
  })
})

describe('applyPinchScale', () => {
  it('scales relative to pinch distance ratio', () => {
    expect(applyPinchScale({
      startScale: 1,
      startDistance: 100,
      currentDistance: 200,
    })).toBe(2)

    expect(applyPinchScale({
      startScale: 2,
      startDistance: 200,
      currentDistance: 100,
    })).toBe(1)
  })
})

describe('wheelScaleDelta', () => {
  it('zooms in on negative delta and out on positive delta', () => {
    expect(wheelScaleDelta(-1, 1)).toBeCloseTo(1.1)
    expect(wheelScaleDelta(1, 2)).toBeCloseTo(1.8)
  })
})

describe('clampPan', () => {
  it('resets pan at base scale', () => {
    expect(clampPan({
      translateX: 50,
      translateY: 50,
      scale: 1,
      containerWidth: 300,
      containerHeight: 300,
      imageWidth: 200,
      imageHeight: 200,
    })).toEqual({ translateX: 0, translateY: 0 })
  })

  it('clamps pan so the image cannot drift fully off-screen', () => {
    const result = clampPan({
      translateX: 500,
      translateY: -500,
      scale: 2,
      containerWidth: 300,
      containerHeight: 300,
      imageWidth: 200,
      imageHeight: 200,
    })

    expect(result.translateX).toBe(50)
    expect(result.translateY).toBe(-50)
  })
})
