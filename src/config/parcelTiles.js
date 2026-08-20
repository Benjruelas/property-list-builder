/**
 * LandRecords vector tiles are a sparse pyramid and, in some metros, use two
 * MVT layer names in the same TMS set:
 *   - `parcel_us` — full assessor schema (owner, situs, parcelid)
 *   - `parcels`   — reduced schema (lrid + values, no situs/owner)
 *
 * Cedar Hill, TX is majority `parcels`; downtown Dallas is majority `parcel_us`.
 * Painting only `parcel_us` leaves checkerboard holes that look location-specific.
 */

export const PARCEL_SOURCE_MIN_ZOOM = 14
export const PARCEL_LAYER_MIN_ZOOM = 15
export const PARCEL_TILE_MAXZOOM = 16

export const PARCEL_SOURCE_ID = 'parcels'
export const PARCEL_SOURCE_LAYERS = ['parcel_us', 'parcels']

export const PARCEL_LABEL_SOURCE = 'parcels-label-pts'
export const PARCEL_LABEL_LAYER = 'parcels-label'

export function parcelFillLayerId(sourceLayer) {
  return sourceLayer === 'parcel_us' ? 'parcels-fill' : `parcels-fill-${sourceLayer}`
}

export function parcelLineLayerId(sourceLayer) {
  return sourceLayer === 'parcel_us' ? 'parcels-line' : `parcels-line-${sourceLayer}`
}

export const PARCEL_FILL_LAYERS = PARCEL_SOURCE_LAYERS.map(parcelFillLayerId)
export const PARCEL_LINE_LAYERS = PARCEL_SOURCE_LAYERS.map(parcelLineLayerId)

export function parcelPromoteId() {
  return Object.fromEntries(PARCEL_SOURCE_LAYERS.map((layer) => [layer, 'lrid']))
}

export function parcelPromoteIdMatches(actual) {
  if (!actual || typeof actual !== 'object') return false
  return PARCEL_SOURCE_LAYERS.every((layer) => actual[layer] === 'lrid')
}
