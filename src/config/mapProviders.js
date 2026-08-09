/** Map style settings (Settings panel) → Google session API mapType param */
export const MAP_STYLE_SETTINGS = ['satellite', 'street', 'hybrid']

export const GLYPHS_URL = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf'

/** Raster label overlays for satellite / hybrid (street basemaps include labels). */
export const CARTO_LABEL_TILES = {
  satellite: 'https://a.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}@2x.png',
  hybrid: 'https://a.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png',
}
export const CARTO_LABEL_ATTRIBUTION = '&copy; OpenStreetMap &copy; CARTO'

/** Same-origin parcel vector tiles (LandRecords via R2 cache). */
export function parcelTileUrl() {
  // `v=3`: bust SW/browser caches after sparse-pyramid empty-tile status change.
  if (typeof window === 'undefined') return '/api/tiles?z={z}&x={x}&y={y}&v=3'
  return `${window.location.origin}/api/tiles?z={z}&x={x}&y={y}&v=3`
}

const MAPBOX_TOKEN = () => import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || ''

/**
 * Mapbox raster fallback when Google session is unavailable.
 * @param {'satellite' | 'street' | 'hybrid'} mapStyleSetting
 * @returns {{ tileUrl: string, tileSize: number, maxzoom: number, attribution: string, provider: 'mapbox' } | null}
 */
export function getMapboxFallbackSource(mapStyleSetting) {
  const token = MAPBOX_TOKEN()
  if (!token) return null

  if (mapStyleSetting === 'street') {
    return {
      provider: 'mapbox',
      tileUrl: `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/{z}/{x}/{y}@2x?access_token=${token}`,
      tileSize: 512,
      maxzoom: 22,
      attribution: '&copy; Mapbox &copy; OpenStreetMap',
    }
  }

  return {
    provider: 'mapbox',
    tileUrl: `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${token}`,
    tileSize: 512,
    maxzoom: 22,
    attribution: '&copy; Mapbox &copy; Maxar Technologies &copy; Airbus',
  }
}

/**
 * @param {{ tileUrl: string, tileSize?: number, maxzoom?: number, attribution?: string, provider: string }} source
 */
export function normalizeGoogleSource(source) {
  return {
    provider: source.provider || 'google',
    tileUrl: source.tileUrl,
    tileSize: source.tileSize ?? 512,
    maxzoom: source.maxzoom ?? 22,
    attribution: source.attribution ?? '&copy; Google',
  }
}
