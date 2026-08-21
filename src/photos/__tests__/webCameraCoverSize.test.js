/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  PHOTO_CAMERA_COVER_VAR,
  computeWebCameraCoverSizePx,
} from '@/photos/PhotoCaptureModal'

describe('web camera cover size', () => {
  const originalScreen = window.screen
  const originalInnerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth')
  const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight')

  beforeEach(() => {
    Object.defineProperty(window, 'screen', {
      configurable: true,
      value: { width: 390, height: 844 },
    })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 })
  })

  afterEach(() => {
    Object.defineProperty(window, 'screen', { configurable: true, value: originalScreen })
    if (originalInnerWidth) Object.defineProperty(window, 'innerWidth', originalInnerWidth)
    if (originalInnerHeight) Object.defineProperty(window, 'innerHeight', originalInnerHeight)
    document.documentElement.style.removeProperty(PHOTO_CAMERA_COVER_VAR)
  })

  it('uses a fixed long-edge cover larger than either viewport side', () => {
    const px = computeWebCameraCoverSizePx()
    expect(px).toBe(Math.ceil(844 * 1.2))
    expect(px).toBeGreaterThanOrEqual(844)
  })

  it('does not shrink when the layout viewport swaps to landscape', () => {
    const portrait = computeWebCameraCoverSizePx()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 844 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 390 })
    // screen.width/height stay portrait-stable on iPhone
    const landscape = computeWebCameraCoverSizePx()
    expect(landscape).toBe(portrait)
  })
})
