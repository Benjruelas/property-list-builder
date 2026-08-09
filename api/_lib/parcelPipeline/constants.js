/** KV keys and shared constants for the county parcel ownership pipeline. */

export const CATALOG_KV_KEY = 'parcel_pipeline:catalog'
export const CATALOG_META_KV_KEY = 'parcel_pipeline:catalog_meta'
export const COUNTY_KV_PREFIX = 'parcel_pipeline:county:'
export const CLAIM_LOCK_KV_KEY = 'parcel_pipeline:claim_lock'

export const OWNED_TILE_PREFIX = 'owned/tiles'
export const LEGACY_TILE_PREFIX = 'tiles'

export const STATUSES = Object.freeze([
  'needs_source',
  'ready',
  'running',
  'complete',
  'failed',
  'no_public_source',
])

export const SOURCE_TYPES = Object.freeze(['arcgis', 'geojson', 'shapefile', 'none'])

/** MapLibre / tippecanoe layer name — must match PMTilesParcelLayer SOURCE_LAYER. */
export const PARCEL_SOURCE_LAYER = 'parcel_us'

export const PARCEL_MIN_ZOOM = 15
export const PARCEL_MAX_ZOOM = 16

/** Claim lease so stuck "running" counties can be reclaimed. */
export const CLAIM_LEASE_MS = 2 * 60 * 60 * 1000
