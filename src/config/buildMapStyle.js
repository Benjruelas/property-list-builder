import { CARTO_LABEL_ATTRIBUTION, CARTO_LABEL_TILES, GLYPHS_URL } from './mapProviders'

/** Minimal style shown while basemap session loads (covered by AppLoadingScreen). */
export function buildEmptyMapStyle() {
  return {
    version: 8,
    sources: {},
    layers: [],
    glyphs: GLYPHS_URL,
  }
}

/**
 * Build a MapLibre GL style from a single raster basemap source.
 * @param {{ tileUrl: string, tileSize: number, maxzoom: number, attribution: string, provider: string }} basemapSource
 * @param {'satellite' | 'street' | 'hybrid'} mapStyleSetting
 */
export function buildMapStyle(basemapSource, mapStyleSetting) {
  const sourceId = 'basemap'
  const layerId = 'basemap-layer'

  const sources = {
    [sourceId]: {
      type: 'raster',
      tiles: [basemapSource.tileUrl],
      tileSize: basemapSource.tileSize,
      maxzoom: basemapSource.maxzoom,
      attribution: basemapSource.attribution,
    },
  }

  const layers = [
    {
      id: layerId,
      type: 'raster',
      source: sourceId,
    },
  ]

  // Satellite and hybrid imagery has no baked-in labels — overlay CARTO label tiles.
  const labelTiles = mapStyleSetting !== 'street' ? CARTO_LABEL_TILES[mapStyleSetting] : null
  if (labelTiles) {
    sources['carto-labels'] = {
      type: 'raster',
      tiles: [labelTiles],
      tileSize: 256,
      maxzoom: 19,
      attribution: CARTO_LABEL_ATTRIBUTION,
    }
    layers.push({
      id: 'carto-labels-layer',
      type: 'raster',
      source: 'carto-labels',
    })
  }

  return {
    version: 8,
    sources,
    layers,
    glyphs: GLYPHS_URL,
  }
}
