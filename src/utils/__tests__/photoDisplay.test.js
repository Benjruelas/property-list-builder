import { describe, it, expect } from 'vitest'
import {
  getPhotoAnnotationBaseKey,
  getPhotoPreviewKey,
  getPhotoThumbnailKey,
  getPhotoThumbnailFetchKeys,
  getPhotoThumbSourceToken,
  shouldUseLocalPhotoPreview,
} from '../photoDisplay'

describe('photoDisplay', () => {
  it('prefers annotated thumbnail key for gallery thumbnail', () => {
    const photo = {
      key: 'original',
      thumbnailKey: 'thumb',
      annotatedKey: 'annotated',
      annotatedThumbnailKey: 'annotated-thumb',
    }
    expect(getPhotoPreviewKey(photo)).toBe('annotated')
    expect(getPhotoThumbnailKey(photo)).toBe('annotated-thumb')
    expect(getPhotoAnnotationBaseKey(photo)).toBe('original')
    expect(getPhotoThumbnailFetchKeys(photo)).toEqual([
      'annotated-thumb',
      'annotated',
      'thumb',
      'original',
    ])
  })

  it('falls back to annotated key when no annotated thumbnail', () => {
    const photo = {
      key: 'original',
      thumbnailKey: 'thumb',
      annotatedKey: 'annotated',
    }
    expect(getPhotoThumbnailKey(photo)).toBe('annotated')
  })

  it('falls back to thumbnail then original', () => {
    expect(getPhotoThumbnailKey({ key: 'original', thumbnailKey: 'thumb' })).toBe('thumb')
    expect(getPhotoPreviewKey({ key: 'original' })).toBe('original')
  })

  it('uses local preview only before annotated save', () => {
    expect(shouldUseLocalPhotoPreview({ _localPreviewUrl: 'blob:1' })).toBe(true)
    expect(shouldUseLocalPhotoPreview({ _localPreviewUrl: 'blob:1', annotatedKey: 'ann' })).toBe(false)
    expect(shouldUseLocalPhotoPreview({ _localPreviewUrl: 'blob:1', _annotatedPreviewUrl: 'blob:2' })).toBe(false)
  })

  it('tracks annotated preview url in thumb source token', () => {
    const token = getPhotoThumbSourceToken({
      _annotatedPreviewUrl: 'data:image/jpeg;base64,abc',
      updatedAt: '2026-01-01',
    })
    expect(token).toContain('data:image/jpeg;base64,abc')
  })
})
