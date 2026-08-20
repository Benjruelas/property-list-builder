/**
 * Must stay aligned with PARCEL_SOURCE_MIN_ZOOM in src/config/parcelTiles.js.
 * Below this zoom the map never requests tiles; at this zoom there is no parent
 * to keep, so empty tiles are 204. Above it they are 410 so MapLibre keeps parents.
 */
export const PARCEL_SOURCE_MIN_ZOOM = 14

/** HTTP status for a cached/upstream empty parcel tile at zoom `zi`. */
export function emptyParcelTileStatus(zi, minZoom = PARCEL_SOURCE_MIN_ZOOM) {
  if (Number.isFinite(zi) && zi > minZoom) return 410
  return 204
}
