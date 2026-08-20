import { describe, it, expect } from 'vitest'
import { resolveParcelId, collectParcelIdCandidates, mapProperties, mergeParcelProperties } from '../parcelPropertyMap'

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

describe('mapProperties', () => {
  it('keeps assessor fields and drops GIS internals from the reduced parcels layer', () => {
    const mapped = mapProperties({
      lrid: '6febee98-daf4-2654-febc-86aba726eeba',
      ownername: 'JETER HINDA MARCELLA',
      parcelstate: 'TX',
      totalvalue: 305880,
      usecode: '1',
      elevavg: 248.88,
      placefp: '13492',
      surfpointx: -96.95,
      accesstype: 'OPEN',
    })
    expect(mapped.PROP_ID).toBe('6febee98-daf4-2654-febc-86aba726eeba')
    expect(mapped.OWNER_NAME).toBe('JETER HINDA MARCELLA')
    expect(mapped.SITUS_STATE).toBe('TX')
    expect(mapped.MKT_VAL).toBe(305880)
    expect(mapped.ELEVAVG).toBeUndefined()
    expect(mapped.PLACEFP).toBeUndefined()
    expect(mapped.SURFPOINTX).toBeUndefined()
    expect(mapped.ACCESSTYPE).toBeUndefined()
  })
})

describe('mergeParcelProperties', () => {
  it('fills empty tile fields without overwriting situs', () => {
    const merged = mergeParcelProperties(
      { PROP_ID: 'aaa', SITUS_ADDR: '123 MAIN', OWNER_NAME: '' },
      { PROP_ID: 'aaa', SITUS_ADDR: 'WRONG ST', OWNER_NAME: 'JANE DOE', MKT_VAL: 100 },
    )
    expect(merged.SITUS_ADDR).toBe('123 MAIN')
    expect(merged.OWNER_NAME).toBe('JANE DOE')
    expect(merged.MKT_VAL).toBe(100)
  })
})
