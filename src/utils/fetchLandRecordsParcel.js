import { mapProperties, canonicalParcelId } from './parcelPropertyMap'
import { propertiesMatchRequestedLrid } from './parcelLookup.js'

/**
 * Fetch full parcel attributes from LandRecords via /api/parcel (WMS/WFS proxy).
 * Nationwide vector tiles often have situs/values but no ownername — still call
 * WFS. Never accept a WMS hit for a different lrid (overlapping school/city polygons).
 */
export async function fetchLandRecordsParcel({ lat, lng, lrid, signal }) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
    return null
  }
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
  })
  if (lrid) params.set('lrid', lrid)

  let res
  try {
    res = await fetch(`/api/parcel?${params}`, { signal })
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    return null
  }
  if (!res.ok) return null

  const data = await res.json()
  const raw = data?.properties
  if (!raw || typeof raw !== 'object') return null
  if (!propertiesMatchRequestedLrid(raw, lrid)) return null

  const properties = mapProperties(raw)
  const parcelId = canonicalParcelId(raw) || properties.PROP_ID || lrid || ''

  return {
    properties,
    parcelId,
    source: data.source || 'unknown',
    raw,
  }
}
