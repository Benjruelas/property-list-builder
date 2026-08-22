import { describe, it, expect } from 'vitest'
import {
  emptyParcelTileStatus,
  isTransientParcelUpstreamStatus,
  transientParcelTileStatus,
  PARCEL_SOURCE_MIN_ZOOM,
} from '../parcelTileEmpty.js'

describe('emptyParcelTileStatus', () => {
  it('returns 204 at the source min zoom where no parent exists', () => {
    expect(PARCEL_SOURCE_MIN_ZOOM).toBe(14)
    expect(emptyParcelTileStatus(14)).toBe(204)
    expect(emptyParcelTileStatus(NaN)).toBe(204)
  })

  it('returns 410 above min zoom so MapLibre keeps parent tiles (Cedar Hill sparse z15/z16 holes)', () => {
    expect(emptyParcelTileStatus(15)).toBe(410)
    expect(emptyParcelTileStatus(16)).toBe(410)
    expect(emptyParcelTileStatus(17)).toBe(410)
  })
})

describe('transient LandRecords upstream', () => {
  it('treats origin 403/429/5xx as retryable — never as a cached empty tile', () => {
    expect(isTransientParcelUpstreamStatus(403)).toBe(true)
    expect(isTransientParcelUpstreamStatus(429)).toBe(true)
    expect(isTransientParcelUpstreamStatus(502)).toBe(true)
    expect(isTransientParcelUpstreamStatus(404)).toBe(false)
    expect(isTransientParcelUpstreamStatus(204)).toBe(false)
    expect(isTransientParcelUpstreamStatus(200)).toBe(false)
  })

  it('keeps parent tiles above minzoom and asks MapLibre to retry at minzoom', () => {
    expect(transientParcelTileStatus(14)).toBe(503)
    expect(transientParcelTileStatus(15)).toBe(410)
    expect(transientParcelTileStatus(17)).toBe(410)
    expect(transientParcelTileStatus(NaN)).toBe(503)
  })
})
