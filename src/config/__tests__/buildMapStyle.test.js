import { describe, it, expect } from 'vitest'
import { buildMapStyle, buildEmptyMapStyle } from '../buildMapStyle'
import { getMapboxFallbackSource } from '../mapProviders'

describe('buildMapStyle', () => {
  it('builds a single raster basemap layer without terrain', () => {
    const source = {
      tileUrl: 'https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=test',
      tileSize: 512,
      maxzoom: 22,
      attribution: '&copy; Google',
      provider: 'google',
    }
    const style = buildMapStyle(source, 'satellite')
    expect(style.version).toBe(8)
    expect(style.sources.basemap.tiles[0]).toContain('tile.googleapis.com')
    expect(style.layers).toHaveLength(1)
    expect(style.layers[0].id).toBe('basemap-layer')
    expect(style.terrain).toBeUndefined()
  })

  it('empty style has no sources', () => {
    const style = buildEmptyMapStyle()
    expect(style.sources).toEqual({})
    expect(style.layers).toEqual([])
  })
})

describe('getMapboxFallbackSource', () => {
  it('returns mapbox raster config or null based on env token', () => {
    const source = getMapboxFallbackSource('satellite')
    const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
    if (token) {
      expect(source?.provider).toBe('mapbox')
      expect(source?.tileUrl).toContain('mapbox.com')
      expect(source?.tileUrl).toContain(token)
    } else {
      expect(source).toBeNull()
    }
  })
})
