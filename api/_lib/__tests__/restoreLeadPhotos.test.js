import { describe, expect, it } from 'vitest'
import { parseLeadPhotoKey, indexLeadPhotoObjects } from '../restoreLeadPhotos.js'

describe('parseLeadPhotoKey', () => {
  it('parses lead photo object keys', () => {
    expect(parseLeadPhotoKey('lead-photos/u1/lead_1/photo_1/original.jpg')).toEqual({
      ownerUid: 'u1',
      leadId: 'lead_1',
      photoId: 'photo_1',
      variant: 'original',
      key: 'lead-photos/u1/lead_1/photo_1/original.jpg',
    })
  })

  it('ignores non-photo keys', () => {
    expect(parseLeadPhotoKey('deal-photos/u1/deal_1/p1/original.jpg')).toBeNull()
    expect(parseLeadPhotoKey('lead-photos/u1/lead_1/photo_1/preview.jpg')).toBeNull()
  })
})

describe('indexLeadPhotoObjects', () => {
  it('groups variants under one photo id', () => {
    const groups = indexLeadPhotoObjects([
      { key: 'lead-photos/u1/lead_1/p1/original.jpg', size: 1000, lastModified: '2026-02-01T00:00:00.000Z' },
      { key: 'lead-photos/u1/lead_1/p1/thumbnail.jpg', size: 100, lastModified: '2026-02-01T00:00:00.000Z' },
    ])
    expect(groups.size).toBe(1)
    const group = [...groups.values()][0]
    expect(group.original).toContain('original.jpg')
    expect(group.thumbnail).toContain('thumbnail.jpg')
    expect(group.originalSize).toBe(1000)
    expect(group.thumbnailSize).toBe(100)
  })
})
