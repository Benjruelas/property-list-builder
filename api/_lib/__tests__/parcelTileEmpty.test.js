import { describe, it, expect } from 'vitest'
import { emptyParcelTileStatus, PARCEL_SOURCE_MIN_ZOOM } from '../parcelTileEmpty.js'

describe('emptyParcelTileStatus', () => {
  it('returns 204 at the source min zoom where no parent exists', () => {
    expect(PARCEL_SOURCE_MIN_ZOOM).toBe(14)
    expect(emptyParcelTileStatus(14)).toBe(204)
    expect(emptyParcelTileStatus(NaN)).toBe(204)
  })

  it('returns 410 above min zoom so MapLibre keeps parent tiles (Cedar Hill sparse z15/z16 holes)', () => {
    expect(emptyParcelTileStatus(15)).toBe(410)
    expect(emptyParcelTileStatus(16)).toBe(410)
  })
})
