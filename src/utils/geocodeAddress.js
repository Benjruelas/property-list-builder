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

/**
 * Fill lat/lng on import payloads when an address is present.
 * Failures stay list-only (no coords). Does not look up parcels.
 */
export async function geocodeLeadsForImport(leads, {
  concurrency = 4,
  onProgress,
  geocode = geocodeAddressForLead,
} = {}) {
  const list = Array.isArray(leads) ? leads : []
  const results = new Array(list.length)
  let next = 0
  let done = 0

  async function worker() {
    while (next < list.length) {
      const idx = next
      next += 1
      const lead = list[idx]
      const hasCoords = Number.isFinite(Number(lead?.lat)) && Number.isFinite(Number(lead?.lng))
      const address = String(lead?.address || '').trim()
      if (!hasCoords && address) {
        const geo = await geocode(address)
        results[idx] = geo
          ? { ...lead, lat: geo.lat, lng: geo.lng }
          : lead
      } else {
        results[idx] = lead
      }
      done += 1
      onProgress?.(done, list.length)
    }
  }

  const workers = Math.min(Math.max(1, concurrency), list.length || 1)
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return results
}
