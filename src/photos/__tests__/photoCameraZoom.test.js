/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import {
  ZOOM_PRESETS,
  MAX_ZOOM,
  displayScaleForZoom,
  trackZoomForFactor,
} from '@/photos/PhotoCaptureModal'

describe('photo camera zoom', () => {
  it('exposes main-lens 1x plus wider tele presets', () => {
    expect(ZOOM_PRESETS).toEqual([0.5, 1, 2, 3, 5])
    expect(MAX_ZOOM).toBe(5)
  })

  it('keeps CSS scale at 1x for true main-lens FOV', () => {
    expect(displayScaleForZoom(1)).toBe(1)
    expect(displayScaleForZoom(0.5)).toBe(1)
    expect(displayScaleForZoom(1, { min: 0.5, max: 5, step: 0.1 })).toBe(1)
  })

  it('uses CSS digital zoom when hardware zoom is unavailable', () => {
    expect(displayScaleForZoom(2)).toBe(2)
    expect(displayScaleForZoom(3)).toBe(3)
    expect(displayScaleForZoom(5)).toBe(5)
  })

  it('prefers hardware zoom inside the track range and CSS only past max', () => {
    const range = { min: 1, max: 2, step: 0.1 }
    expect(displayScaleForZoom(1.5, range)).toBe(1)
    expect(displayScaleForZoom(2, range)).toBe(1)
    expect(displayScaleForZoom(4, range)).toBe(2)
  })

  it('maps UI zoom onto the track zoom constraint', () => {
    const wide = { min: 0.5, max: 5, step: 0.1 }
    expect(trackZoomForFactor(0.5, wide)).toBe(0.5)
    expect(trackZoomForFactor(1, wide)).toBe(1)
    expect(trackZoomForFactor(3, wide)).toBe(3)
    expect(trackZoomForFactor(8, wide)).toBe(5)
    expect(trackZoomForFactor(2, null)).toBeNull()
  })
})
