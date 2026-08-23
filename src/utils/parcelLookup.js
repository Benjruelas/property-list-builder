/** Compare LandRecords parcel ids (lrid / parcelid) without case/whitespace drift. */
export function parcelIdsMatch(a, b) {
  if (a == null || b == null) return false
  const left = String(a).trim()
  const right = String(b).trim()
  if (!left || !right) return false
  return left.toLowerCase() === right.toLowerCase()
}

export function featureMatchesLrid(feature, lrid) {
  const props = feature?.properties
  if (!props || !lrid) return false
  return parcelIdsMatch(props.lrid, lrid) || parcelIdsMatch(props.LRID, lrid)
}

function bboxArea(geometry) {
  if (!geometry?.coordinates) return Infinity
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const scan = (coords) => {
    if (typeof coords[0] === 'number') {
      minX = Math.min(minX, coords[0])
      maxX = Math.max(maxX, coords[0])
      minY = Math.min(minY, coords[1])
      maxY = Math.max(maxY, coords[1])
      return
    }
    for (const c of coords) scan(c)
  }
  scan(geometry.coordinates)
  if (minX === Infinity) return Infinity
  return (maxX - minX) * (maxY - minY)
}

/**
 * Pick a WMS/WFS GeoJSON feature for a map click.
 * When `lrid` is known (vector-tile hit), only that record is valid — overlapping
 * school/city/floodplain polygons are why Cedar Hill "fallback" data looked wrong.
 * With no lrid, prefer the smallest footprint.
 */
export function pickParcelFeature(features, lrid) {
  const list = (Array.isArray(features) ? features : []).filter((f) => f?.properties)
  if (!list.length) return null
  if (lrid) return list.find((f) => featureMatchesLrid(f, lrid)) || null
  if (list.length === 1) return list[0]
  return [...list].sort((a, b) => bboxArea(a.geometry) - bboxArea(b.geometry))[0]
}

export function propertiesMatchRequestedLrid(properties, lrid) {
  if (!lrid) return true
  if (!properties) return false
  return parcelIdsMatch(properties.lrid, lrid) || parcelIdsMatch(properties.LRID, lrid)
}
