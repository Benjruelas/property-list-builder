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
