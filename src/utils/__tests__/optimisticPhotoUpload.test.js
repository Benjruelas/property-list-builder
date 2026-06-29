import { describe, it, expect } from 'vitest'
import {
  createPendingPhoto,
  isPendingPhoto,
  replacePhotoInList,
  removePhotoFromList,
  insertPhotoInList,
  updatePhotoInList,
  persistedPhotos,
  estimatePhotoBytes,
  mergePhotosFromPoll,
  stripClientPhotoFields,
  UPLOAD_STATUS,
} from '../optimisticPhotoUpload'

describe('optimisticPhotoUpload', () => {
  it('createPendingPhoto returns client-only upload record', () => {
    const pending = createPendingPhoto({
      localPreviewUrl: 'blob:http://local/1',
      estimatedBytes: 1200,
      capturedByUid: 'user_1',
    })
    expect(pending.id).toMatch(/^pending_/)
    expect(pending._uploadStatus).toBe(UPLOAD_STATUS.UPLOADING)
    expect(pending._localPreviewUrl).toBe('blob:http://local/1')
    expect(pending.size).toBe(1200)
    expect(isPendingPhoto(pending)).toBe(true)
  })

  it('replacePhotoInList swaps pending entry for server photo', () => {
    const pending = createPendingPhoto({ localPreviewUrl: 'data:image/jpeg;base64,abc' })
    const server = { id: 'photo_1', key: 'lead-photos/u/l/p/original.jpg', size: 900 }
    const next = replacePhotoInList([pending, { id: 'photo_0', key: 'k' }], pending.id, server)
    expect(next).toHaveLength(2)
    expect(next[0]).toEqual(server)
    expect(next[1].id).toBe('photo_0')
  })

  it('removePhotoFromList and updatePhotoInList work on pending ids', () => {
    const pending = createPendingPhoto({ localPreviewUrl: 'blob:x' })
    const removed = removePhotoFromList([pending], pending.id)
    expect(removed).toHaveLength(0)
    const updated = updatePhotoInList([pending], pending.id, { _uploadStatus: UPLOAD_STATUS.FAILED })
    expect(updated[0]._uploadStatus).toBe(UPLOAD_STATUS.FAILED)
  })

  it('persistedPhotos excludes pending records', () => {
    const pending = createPendingPhoto({ localPreviewUrl: 'blob:x' })
    const list = persistedPhotos([pending, { id: 'p1', key: 'k1' }])
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('p1')
  })

  it('insertPhotoInList restores photo at original index', () => {
    const a = { id: 'a' }
    const b = { id: 'b' }
    const c = { id: 'c' }
    expect(insertPhotoInList([a, c], b, 1).map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('estimatePhotoBytes handles data URLs', () => {
    const bytes = estimatePhotoBytes('data:image/jpeg;base64,AAAA')
    expect(bytes).toBeGreaterThan(0)
  })

  it('stripClientPhotoFields removes client-only keys', () => {
    expect(stripClientPhotoFields({
      id: 'p1',
      key: 'k',
      _freshThumbUrl: 'data:x',
      _uploadStatus: 'uploading',
    })).toEqual({ id: 'p1', key: 'k' })
  })

  it('mergePhotosFromPoll keeps pending uploads and fresh thumbs', () => {
    const prev = [
      { id: 'pending_1', _uploadStatus: UPLOAD_STATUS.UPLOADING, _localPreviewUrl: 'data:x' },
      { id: 'p1', key: 'k', _freshThumbUrl: 'data:fresh' },
    ]
    const incoming = [{ id: 'p1', key: 'k', thumbnailKey: 'kt' }]
    const merged = mergePhotosFromPoll(prev, incoming)
    expect(merged).toHaveLength(2)
    expect(merged[0]._freshThumbUrl).toBe('data:fresh')
    expect(merged[1].id).toBe('pending_1')
  })
})
