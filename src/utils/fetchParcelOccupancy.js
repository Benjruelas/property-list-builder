const occupancyByLrid = new Map()
const MAX_CACHE = 2500

export function getCachedOccupancy(lrid) {
  if (!lrid) return null
  return occupancyByLrid.get(String(lrid)) || null
}

export function occupancyCacheSize() {
  return occupancyByLrid.size
}

export function rememberOccupancyMap(occupancy = {}) {
  for (const [lrid, value] of Object.entries(occupancy)) {
    if (!lrid || !value || typeof value !== 'object') continue
    occupancyByLrid.set(String(lrid), {
      owneraddr: value.owneraddr || '',
      homestead_exemption: value.homestead_exemption || '',
    })
  }
  while (occupancyByLrid.size > MAX_CACHE) {
    const oldest = occupancyByLrid.keys().next().value
    occupancyByLrid.delete(oldest)
  }
}

export function occupancyCacheSnapshot() {
  return occupancyByLrid
}

export function clearOccupancyCache() {
  occupancyByLrid.clear()
}

function roundBound(n) {
  return Math.round(Number(n) * 1e4) / 1e4
}

/** Fetch mailing/homestead for the viewport so house-number labels can show OO icons. */
export async function fetchViewportOccupancy({ west, south, east, north, signal }) {
  if (![west, south, east, north].every(Number.isFinite)) return {}
  const params = new URLSearchParams({
    west: String(roundBound(west)),
    south: String(roundBound(south)),
    east: String(roundBound(east)),
    north: String(roundBound(north)),
  })
  const res = await fetch(`/api/parcel-bbox?${params}`, { signal })
  if (!res.ok) return {}
  const data = await res.json()
  const occupancy = data?.occupancy && typeof data.occupancy === 'object' ? data.occupancy : {}
  rememberOccupancyMap(occupancy)
  return occupancy
}
