import { describe, it, expect } from 'vitest'
import { parcelTileUrl } from '../mapProviders'

describe('parcelTileUrl', () => {
  it('busts caches after transient-403 / maxzoom-17 handling', () => {
    expect(parcelTileUrl()).toBe('/api/tiles?z={z}&x={x}&y={y}&v=4')
  })
})
