/**
 * Popup-ready address from LandRecords-mapped properties.
 * When assessor situs is missing (e.g. Clark County NV), returns an honest
 * "No street address" title plus area/county subtitle — not city/state as title.
 */
export function resolveParcelDisplayAddress(properties = {}) {
  const situs = (properties.SITUS_ADDR || properties.SITE_ADDR || properties.ADDRESS || '').trim()
  const city = (properties.SITUS_CITY || properties.PROP_CITY || properties.CITY || '').trim()
  const state = (properties.SITUS_STATE || properties.PROP_STATE || properties.STATE || '').trim()
  const zip = String(properties.SITUS_ZIP || properties.PROP_ZIP || properties.ZIP || '').trim()
  const county = (properties.COUNTY || '').trim()

  if (situs) {
    return { title: situs, subtitle: '', fullAddress: situs, hasStreetAddress: true }
  }

  const tail = state && zip ? `${state} ${zip}` : (state || zip)
  const area = [city, tail].filter(Boolean).join(', ')
  const subtitleParts = []
  if (area) subtitleParts.push(area)
  if (county) subtitleParts.push(`${county} County`)
  const subtitle = subtitleParts.join(' · ')

  return {
    title: 'No street address',
    subtitle,
    fullAddress: subtitle || 'No address',
    hasStreetAddress: false,
  }
}

/** Best-effort single-line address for lists, skip trace, exports. */
export function addressFromProperties(properties = {}) {
  const { title, hasStreetAddress, fullAddress } = resolveParcelDisplayAddress(properties)
  return hasStreetAddress ? title : (fullAddress || 'No address')
}

/**
 * Reverse geocode a point to a city/locality using Mapbox (client-side token).
 */
export async function reverseGeocodeCity(lat, lng) {
  const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
  if (!token || typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
    return ''
  }
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(lng)},${encodeURIComponent(lat)}.json?access_token=${encodeURIComponent(token)}&types=place,locality&limit=1`
    const r = await fetch(url)
    if (!r.ok) return ''
    const data = await r.json()
    const f = data.features?.[0]
    if (!f) return ''
    return (f.text || '').trim() || (f.place_name || '').split(',')[0].trim() || ''
  } catch {
    return ''
  }
}
