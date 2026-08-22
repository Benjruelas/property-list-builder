/**
 * Must stay aligned with PARCEL_SOURCE_MIN_ZOOM in src/config/parcelTiles.js.
 * Below this zoom the map never requests tiles; at this zoom there is no parent
 * to keep, so empty tiles are 204. Above it they are 410 so MapLibre keeps parents.
 */
export const PARCEL_SOURCE_MIN_ZOOM = 14

/** Do not cache these as empty; MapLibre should keep parents / retry. */
export const TRANSIENT_PARCEL_UPSTREAM_STATUSES = new Set([
  401, 403, 408, 429, 500, 502, 503, 504,
])

/** Same-URL retry helps for these. 401/403 are WAF/auth — try the next origin URL. */
export const RETRYABLE_PARCEL_UPSTREAM_STATUSES = new Set([
  408, 429, 500, 502, 503, 504,
])

/** HTTP status for a cached/upstream empty parcel tile at zoom `zi`. */
export function emptyParcelTileStatus(zi, minZoom = PARCEL_SOURCE_MIN_ZOOM) {
  if (Number.isFinite(zi) && zi > minZoom) return 410
  return 204
}

export function isTransientParcelUpstreamStatus(status) {
  return TRANSIENT_PARCEL_UPSTREAM_STATUSES.has(Number(status))
}

export function isRetryableParcelUpstreamStatus(status) {
  return RETRYABLE_PARCEL_UPSTREAM_STATUSES.has(Number(status))
}

/**
 * MapLibre: 410 keeps parent tiles (above minzoom). At minzoom there is no
 * parent, so 503 lets the client retry without caching a blank hole.
 */
export function transientParcelTileStatus(zi, minZoom = PARCEL_SOURCE_MIN_ZOOM) {
  if (Number.isFinite(zi) && zi > minZoom) return 410
  return 503
}
