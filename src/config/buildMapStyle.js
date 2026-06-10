import { GLYPHS_URL } from './mapProviders'

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

  return {
    version: 8,
    sources: {
      [sourceId]: {
        type: 'raster',
        tiles: [basemapSource.tileUrl],
        tileSize: basemapSource.tileSize,
        maxzoom: basemapSource.maxzoom,
        attribution: basemapSource.attribution,
      },
    },
    layers: [
      {
        id: layerId,
        type: 'raster',
        source: sourceId,
      },
    ],
    glyphs: GLYPHS_URL,
  }
}
