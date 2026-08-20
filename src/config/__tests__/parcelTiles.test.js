import { describe, it, expect } from 'vitest'
import {
  PARCEL_SOURCE_LAYERS,
  PARCEL_FILL_LAYERS,
  PARCEL_LINE_LAYERS,
  PARCEL_SOURCE_MIN_ZOOM,
  PARCEL_LAYER_MIN_ZOOM,
  parcelFillLayerId,
  parcelLineLayerId,
  parcelPromoteId,
  parcelPromoteIdMatches,
} from '../parcelTiles'

describe('parcelTiles', () => {
  it('paints both LandRecords MVT layer names so mixed tiles like Cedar Hill render', () => {
    expect(PARCEL_SOURCE_LAYERS).toEqual(['parcel_us', 'parcels'])
    expect(parcelFillLayerId('parcel_us')).toBe('parcels-fill')
    expect(parcelFillLayerId('parcels')).toBe('parcels-fill-parcels')
    expect(parcelLineLayerId('parcel_us')).toBe('parcels-line')
    expect(parcelLineLayerId('parcels')).toBe('parcels-line-parcels')
    expect(PARCEL_FILL_LAYERS).toEqual(['parcels-fill', 'parcels-fill-parcels'])
    expect(PARCEL_LINE_LAYERS).toEqual(['parcels-line', 'parcels-line-parcels'])
  })

  it('promotes lrid on every source layer for feature-state', () => {
    const spec = parcelPromoteId()
    expect(spec).toEqual({ parcel_us: 'lrid', parcels: 'lrid' })
    expect(parcelPromoteIdMatches(spec)).toBe(true)
    expect(parcelPromoteIdMatches({ parcel_us: 'lrid' })).toBe(false)
    expect(parcelPromoteIdMatches(null)).toBe(false)
  })

  it('keeps outlines off until z15 while allowing z14 parents for sparse holes', () => {
    expect(PARCEL_SOURCE_MIN_ZOOM).toBe(14)
    expect(PARCEL_LAYER_MIN_ZOOM).toBe(15)
    expect(PARCEL_SOURCE_MIN_ZOOM).toBeLessThan(PARCEL_LAYER_MIN_ZOOM)
  })
})
