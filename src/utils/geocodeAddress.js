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

function detailHasCoords(detail) {
  const lat = detail?.lat
  const lng = detail?.lng
  if (lat == null || lng == null || lat === '' || lng === '') return false
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
}

function addressDetailsForGeocode(lead) {
  if (Array.isArray(lead?.addressDetails) && lead.addressDetails.length > 0) {
    return lead.addressDetails.map((detail) => ({
      ...detail,
      value: String(detail?.value || detail?.address || '').trim(),
    }))
  }
  const address = String(lead?.address || '').trim()
  if (!address) return []
  return [{
    value: address,
    primary: true,
    lat: lead?.lat ?? null,
    lng: lead?.lng ?? null,
  }]
}

/**
 * Fill lat/lng on import payloads when an address is present.
 * Geocodes each addressDetails entry. Failures stay list-only (no coords).
 * Does not look up parcels.
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

  async function geocodeDetail(detail) {
    const value = String(detail?.value || '').trim()
    if (!value || detailHasCoords(detail)) return detail
    const geo = await geocode(value)
    if (!geo) return detail
    return { ...detail, value, lat: geo.lat, lng: geo.lng }
  }

  async function worker() {
    while (next < list.length) {
      const idx = next
      next += 1
      const lead = list[idx]
      const details = addressDetailsForGeocode(lead)
      if (!details.length) {
        results[idx] = lead
      } else {
        const nextDetails = []
        for (const detail of details) {
          nextDetails.push(await geocodeDetail(detail))
        }
        const primary = nextDetails.find((d) => d.primary) || nextDetails[0]
        const nextLead = {
          ...lead,
          address: primary?.value || lead.address,
          lat: primary?.lat ?? lead.lat,
          lng: primary?.lng ?? lead.lng,
        }
        if (Array.isArray(lead.addressDetails) && lead.addressDetails.length > 0) {
          nextLead.addressDetails = nextDetails
        }
        results[idx] = nextLead
      }
      done += 1
      onProgress?.(done, list.length)
    }
  }

  const workers = Math.min(Math.max(1, concurrency), list.length || 1)
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return results
}
