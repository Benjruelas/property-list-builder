import { describe, it, expect } from 'vitest'
import { tileBounds } from '../pmtilesR2.js'

describe('tileBounds', () => {
  it('returns sane WGS84 bbox for a mid-latitude tile', () => {
    const b = tileBounds(15, 5400, 11800)
    expect(b.west).toBeLessThan(b.east)
    expect(b.south).toBeLessThan(b.north)
    expect(b.west).toBeGreaterThanOrEqual(-180)
    expect(b.east).toBeLessThanOrEqual(180)
    expect(b.south).toBeGreaterThanOrEqual(-85.1)
    expect(b.north).toBeLessThanOrEqual(85.1)
  })
})
