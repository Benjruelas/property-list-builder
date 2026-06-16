/**
 * One-shot Mapbox forward geocode for address → coordinates.
 */

const getMapboxToken = () => import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || ''

export async function geocodeAddressForLead(address) {
  const trimmed = String(address || '').trim()
  const accessToken = getMapboxToken()
  if (!trimmed || !accessToken) return null

  try {
    const encoded = encodeURIComponent(trimmed)
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${accessToken}&limit=1&country=us&types=address,poi`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const feature = data?.features?.[0]
    const center = feature?.center
    if (!Array.isArray(center) || center.length < 2) return null
    const lng = Number(center[0])
    const lat = Number(center[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return {
      lat,
      lng,
      address: feature.place_name || trimmed,
    }
  } catch {
    return null
  }
}
