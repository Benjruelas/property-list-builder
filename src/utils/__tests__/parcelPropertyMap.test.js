import { describe, it, expect } from 'vitest'
import { resolveParcelId, collectParcelIdCandidates } from '../parcelPropertyMap'

describe('resolveParcelId', () => {
  it('prefers PROP_ID over stale list tile id', () => {
    const parcel = {
      id: '33.123456-117.654321',
      properties: { PROP_ID: 'LR-998877' },
    }
    expect(resolveParcelId(parcel)).toBe('LR-998877')
    expect(collectParcelIdCandidates(parcel)).toContain('LR-998877')
    expect(collectParcelIdCandidates(parcel)).toContain('33.123456-117.654321')
  })

  it('falls back to parcel.id when no property ids exist', () => {
    expect(resolveParcelId({ id: 'abc-123' })).toBe('abc-123')
  })

  it('skips synthetic list placeholder ids when property id exists', () => {
    const parcel = {
      id: 'parcel-1710000000000',
      properties: { PROP_ID: '5551212' },
    }
    expect(resolveParcelId(parcel)).toBe('5551212')
  })
})
