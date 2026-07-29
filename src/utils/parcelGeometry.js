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
export function resolveParcelCenter(input) {
  if (input == null || typeof input !== 'object') return null

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

/** Scan polygon / multipolygon rings for axis-aligned bbox. */
function bboxFromGeometry(geometry) {
  if (!geometry?.coordinates) return null
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  const scan = (coords) => {
    if (typeof coords[0] === 'number') {
      const lng = finiteNum(coords[0])
      const lat = finiteNum(coords[1])
      if (lng == null || lat == null) return
      minLng = Math.min(minLng, lng)
      maxLng = Math.max(maxLng, lng)
      minLat = Math.min(minLat, lat)
      maxLat = Math.max(maxLat, lat)
    } else {
      for (const c of coords) scan(c)
    }
  }
  scan(geometry.coordinates)
  if (minLng === Infinity) return null
  return { minLng, minLat, maxLng, maxLat }
}

/**
 * Geographic top-right (NE) of a parcel polygon, nudged slightly inward toward
 * the bbox center so map icons sit inside the parcel rather than on the edge.
 * @param {object} geometry GeoJSON Polygon or MultiPolygon
 * @param {number} [inwardFraction=0.1] Fraction of bbox width/height to pull inward (0–0.45)
 * @returns {{ lat: number, lng: number } | null}
 */
export function neCornerFromGeometry(geometry, inwardFraction = 0.1) {
  const bbox = bboxFromGeometry(geometry)
  if (!bbox) return null
  const { minLng, minLat, maxLng, maxLat } = bbox
  const width = maxLng - minLng
  const height = maxLat - minLat
  if (!(width > 0) || !(height > 0)) {
    return { lng: maxLng, lat: maxLat }
  }
  const t = Math.min(Math.max(Number(inwardFraction) || 0, 0), 0.45)
  return {
    lng: maxLng - width * t,
    lat: maxLat - height * t,
  }
}

/** Tiny geographic NE nudge when falling back to a centroid (~5–6 m). */
const CENTROID_NE_NUDGE_DEG = 0.00005

/**
 * Anchor for an owner-occupied map icon: inward NE corner, else tile centroid nudged NE.
 * @returns {{ lat: number, lng: number } | null}
 */
export function resolveOwnerOccupiedAnchor(geometry, properties) {
  const ne = neCornerFromGeometry(geometry)
  if (ne) return ne
  const c = centroidFromProperties(properties)
  if (!c) return null
  return {
    lng: c.lng + CENTROID_NE_NUDGE_DEG,
    lat: c.lat + CENTROID_NE_NUDGE_DEG,
  }
}
