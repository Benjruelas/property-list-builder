import { describe, expect, it } from 'vitest'
import { mergeLeadsByUpdatedAt } from '../leadRepo.js'

describe('mergeLeadsByUpdatedAt', () => {
  it('keeps the lead copy with the newest updatedAt', () => {
    const stale = {
      id: 'lead_1',
      firstName: 'Jane',
      photos: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const fresh = {
      id: 'lead_1',
      firstName: 'Jane',
      photos: [{ id: 'photo_1' }],
      updatedAt: '2026-02-01T00:00:00.000Z',
    }
    expect(mergeLeadsByUpdatedAt([stale], [fresh])).toEqual([fresh])
    expect(mergeLeadsByUpdatedAt([fresh], [stale])).toEqual([fresh])
  })

  it('includes leads that exist on only one side', () => {
    const imported = { id: 'lead_new', firstName: 'New', updatedAt: '2026-03-01T00:00:00.000Z' }
    const existing = {
      id: 'lead_old',
      firstName: 'Old',
      photos: [{ id: 'photo_1' }],
      updatedAt: '2026-02-01T00:00:00.000Z',
    }
    const merged = mergeLeadsByUpdatedAt([imported], [existing])
    expect(merged).toHaveLength(2)
    expect(merged).toEqual(expect.arrayContaining([imported, existing]))
  })
})
