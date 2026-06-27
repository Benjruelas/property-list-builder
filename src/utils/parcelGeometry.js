/** @returns {number|null} */
function finiteNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Average of outer ring vertices (lng, lat). */
export function centroidFromGeometry(geometry) {
  if (!geometry?.coordinates) return null

  const rings = []
  if (geometry.type === 'Polygon') {
    if (geometry.coordinates[0]?.length) rings.push(geometry.coordinates[0])
  } else if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) {
      if (poly?.[0]?.length) rings.push(poly[0])
    }
  }
  if (!rings.length) return null

  let sumLng = 0
  let sumLat = 0
  let count = 0
  for (const ring of rings) {
    let coords = ring
    if (coords.length > 1) {
      const first = coords[0]
      const last = coords[coords.length - 1]
      if (first[0] === last[0] && first[1] === last[1]) {
        coords = coords.slice(0, -1)
      }
    }
    for (const coord of coords) {
      if (!Array.isArray(coord) || coord.length < 2) continue
      const lng = finiteNum(coord[0])
      const lat = finiteNum(coord[1])
      if (lng == null || lat == null) continue
      sumLng += lng
      sumLat += lat
      count += 1
    }
  }
  if (!count) return null
  return { lat: sumLat / count, lng: sumLng / count }
}

/** Tile / canonical property centroid fields. */
export function centroidFromProperties(properties) {
  if (!properties) return null
  const lat =
    finiteNum(properties.centroidy)
    ?? finiteNum(properties.CENTROIDY)
    ?? finiteNum(properties.LATITUDE)
    ?? finiteNum(properties.latitude)
    ?? finiteNum(properties.lat)
  const lng =
    finiteNum(properties.centroidx)
    ?? finiteNum(properties.CENTROIDX)
    ?? finiteNum(properties.LONGITUDE)
    ?? finiteNum(properties.longitude)
    ?? finiteNum(properties.lon)
    ?? finiteNum(properties.lng)
  if (lat == null || lng == null) return null
  return { lat, lng }
}

/**
 * Best map anchor for a parcel: polygon centroid → tile centroid → props → fallback coords.
 * @returns {{ lat: number, lng: number } | null}
 */
export function resolveParcelCenter(input = {}) {
  const fromGeometry = centroidFromGeometry(input.geometry)
  if (fromGeometry) return fromGeometry

  const fromProps = centroidFromProperties(input.properties)
  if (fromProps) return fromProps

  const lat =
    finiteNum(input.lat)
    ?? finiteNum(input.latlng?.lat)
  const lng =
    finiteNum(input.lng)
    ?? finiteNum(input.latlng?.lng)
  if (lat != null && lng != null) return { lat, lng }

  return null
}
