import { describe, it, expect } from 'vitest'
import {
  getPhotoAnnotationBaseKey,
  getPhotoPreviewKey,
  getPhotoThumbnailKey,
  getPhotoThumbnailFetchKeys,
  getPhotoThumbSourceToken,
  getAnnotatedDataPreviewUrl,
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

  it('ignores oversized camera data URLs that break img rendering', () => {
    const huge = `data:image/jpeg;base64,${'A'.repeat(700 * 1024)}`
    expect(shouldUseLocalPhotoPreview({ _localPreviewUrl: huge })).toBe(false)
    expect(shouldUseLocalPhotoPreview({ _localPreviewUrl: 'data:image/jpeg;base64,abc' })).toBe(true)
  })

  it('ignores a leftover local preview once the photo has a server key', () => {
    expect(shouldUseLocalPhotoPreview({
      _localPreviewUrl: 'data:image/jpeg;base64,stale',
      key: 'lead-photos/u/lead/photo/original.jpg',
    })).toBe(false)
  })

  it('uses a short thumb source token for local annotated preview', () => {
    const token = getPhotoThumbSourceToken({
      _annotatedPreviewUrl: 'data:image/jpeg;base64,abc',
      updatedAt: '2026-01-01',
    })
    expect(token).toBe('local-annotated:2026-01-01')
    expect(token.length).toBeLessThan(100)
  })

  it('does not treat non-data annotated preview as a local cache token', () => {
    expect(getPhotoThumbSourceToken({
      _annotatedPreviewUrl: 'blob:http://local/1',
      key: 'original',
      thumbnailKey: 'thumb',
      updatedAt: '2026-01-01',
    })).toBe('thumb:2026-01-01')
  })

  it('resolves annotated data preview from photo or pending ref', () => {
    const dataUrl = 'data:image/jpeg;base64,abc'
    expect(getAnnotatedDataPreviewUrl({ _annotatedPreviewUrl: dataUrl })).toBe(dataUrl)
    expect(getAnnotatedDataPreviewUrl({}, dataUrl)).toBe(dataUrl)
    expect(getAnnotatedDataPreviewUrl({ _annotatedPreviewUrl: dataUrl }, null, { skipLocalPreview: true })).toBeNull()
  })
})
