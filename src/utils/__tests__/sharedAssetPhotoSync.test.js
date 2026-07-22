import { describe, it, expect } from 'vitest'
import {
  leadNeedsPhotoHydrate,
  collectLeadsNeedingPhotoHydrate,
} from '../leads'

describe('leadNeedsPhotoHydrate', () => {
  it('does not hydrate after optimistic delete keeps photoCount in sync', () => {
    const lead = {
      id: 'lead_1',
      _listView: true,
      photoCount: 2,
      photos: [
        { id: 'p1', thumbnailKey: 'lead-photos/u1/l1/p1/thumb.jpg' },
        { id: 'p3', thumbnailKey: 'lead-photos/u1/l1/p3/thumb.jpg' },
      ],
    }
    expect(leadNeedsPhotoHydrate(lead)).toBe(false)
  })

  it('requires hydration when server photoCount exceeds cached photos', () => {
    const lead = {
      id: 'lead_1',
      _listView: true,
      photoCount: 3,
      photos: [{ id: 'p1' }, { id: 'p2' }],
    }
    expect(leadNeedsPhotoHydrate(lead)).toBe(true)
  })

  it('requires hydration when cached photos were dropped as stale', () => {
    const lead = { id: 'lead_1', _listView: true, photoCount: 1, photos: undefined }
    expect(leadNeedsPhotoHydrate(lead)).toBe(true)
  })

  it('skips hydration during local upload races when server count is lower', () => {
    const lead = {
      id: 'lead_1',
      _listView: true,
      photoCount: 2,
      photos: [{ id: 'p1' }, { id: 'p2' }, { id: 'pending' }],
    }
    expect(leadNeedsPhotoHydrate(lead, { pendingUploadCount: 1 })).toBe(false)
  })

  it('hydrates deletions when server count is lower and no uploads are pending', () => {
    const lead = {
      id: 'lead_1',
      _listView: true,
      photoCount: 1,
      photos: [{ id: 'p1' }, { id: 'p2' }],
    }
    expect(leadNeedsPhotoHydrate(lead)).toBe(true)
  })

  it('does not hydrate when counts match and photos have storage keys', () => {
    const lead = {
      id: 'lead_1',
      _listView: true,
      photoCount: 2,
      photos: [
        { id: 'p1', thumbnailKey: 'lead-photos/u1/l1/p1/thumb.jpg' },
        { id: 'p2', thumbnailKey: 'lead-photos/u1/l1/p2/thumb.jpg' },
      ],
    }
    expect(leadNeedsPhotoHydrate(lead)).toBe(false)
  })

  it('requires hydration when cached photos are id-only stubs', () => {
    const lead = {
      id: 'lead_1',
      _listView: true,
      photoCount: 2,
      photos: [{ id: 'p1' }, { id: 'p2' }],
    }
    expect(leadNeedsPhotoHydrate(lead)).toBe(true)
  })
})

describe('collectLeadsNeedingPhotoHydrate', () => {
  const leads = [
    { id: 'lead_a', _listView: true, photoCount: 2, photos: [{ id: 'p1' }] },
    { id: 'lead_b', _listView: true, photoCount: 1, photos: [{ id: 'p2' }] },
    { id: 'lead_c', _listView: true, photoCount: 3, photos: [{ id: 'p3' }] },
  ]

  it('prioritizes open lead ids and limits batch size', () => {
    const ids = collectLeadsNeedingPhotoHydrate(leads, {
      priorityLeadIds: ['lead_c'],
      limit: 2,
    })
    expect(ids).toEqual(['lead_c', 'lead_a'])
  })
})
