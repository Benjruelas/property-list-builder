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
    expect(style.layers).toHaveLength(2)
    expect(style.layers[0].id).toBe('basemap-layer')
    expect(style.layers[1].id).toBe('carto-labels-layer')
    expect(style.sources['carto-labels'].tiles[0]).toContain('light_only_labels')
    expect(style.terrain).toBeUndefined()
  })

  it('adds voyager labels for hybrid and none for street', () => {
    const source = {
      tileUrl: 'https://example.com/{z}/{x}/{y}',
      tileSize: 512,
      maxzoom: 22,
      attribution: 'test',
      provider: 'google',
    }
    const hybrid = buildMapStyle(source, 'hybrid')
    expect(hybrid.layers).toHaveLength(2)
    expect(hybrid.sources['carto-labels'].tiles[0]).toContain('voyager_only_labels')

    const street = buildMapStyle(source, 'street')
    expect(street.layers).toHaveLength(1)
    expect(street.sources['carto-labels']).toBeUndefined()
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
