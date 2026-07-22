import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  ANNOTATOR_COLORS,
  DEFAULT_ANNOTATOR_COLOR,
  DEFAULT_STROKE_WIDTH,
  loadPhotoAnnotatorPrefs,
  savePhotoAnnotatorPrefs,
  strokeSizeLabel,
} from '../photoAnnotatorPrefs'

describe('photoAnnotatorPrefs', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      store: {},
      getItem(key) {
        return this.store[key] ?? null
      },
      setItem(key, value) {
        this.store[key] = value
      },
    })
  })

  it('defaults stroke label to M', () => {
    expect(strokeSizeLabel(10)).toBe('M')
    expect(strokeSizeLabel(5)).toBe('S')
    expect(strokeSizeLabel(15)).toBe('L')
  })

  it('persists color and stroke width', () => {
    savePhotoAnnotatorPrefs({ color: ANNOTATOR_COLORS[1], strokeWidth: 15 })
    expect(loadPhotoAnnotatorPrefs()).toEqual({
      color: ANNOTATOR_COLORS[1],
      strokeWidth: 15,
    })
  })

  it('falls back when stored values are invalid', () => {
    localStorage.setItem('photo_annotator_prefs_v1', JSON.stringify({ color: '#000', strokeWidth: 99 }))
    expect(loadPhotoAnnotatorPrefs()).toEqual({
      color: DEFAULT_ANNOTATOR_COLOR,
      strokeWidth: DEFAULT_STROKE_WIDTH,
    })
  })
})
