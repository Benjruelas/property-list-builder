const IEM_TILE_BASE = 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0'

/** Round a Date down to the nearest N minutes (NEXRAD volumes ~every 5 min). */
export function iemTimestamp(date) {
  const d = new Date(date)
  d.setUTCSeconds(0, 0)
  d.setUTCMinutes(Math.floor(d.getUTCMinutes() / 5) * 5)
  const pad = (n) => String(n).padStart(2, '0')
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes())
  )
}

/**
 * Build a UTC Date for the event. Uses evt.time_utc when present,
 * otherwise defaults to 21:00 UTC (afternoon CONUS hail).
 */
export function eventDateTimeUTC(evt) {
  if (!evt?.date) return null
  const [y, m, d] = evt.date.split('-').map(Number)
  if (!y || !m || !d) return null
  if (evt.time_utc) {
    const [hh, mm] = evt.time_utc.split(':').map(Number)
    return new Date(Date.UTC(y, m - 1, d, hh || 0, mm || 0))
  }
  return new Date(Date.UTC(y, m - 1, d, 21, 0))
}

/** NEXRAD n0r is archived from ~1995. Older events can't render. */
export function radarAvailableForEvent(evt) {
  return evt?.year >= 1995
}

export function nexradTileUrlForTimestamp(radarId, product, ts) {
  return `${IEM_TILE_BASE}/ridge::${radarId}-${product}-${ts}/{z}/{x}/{y}.png`
}

export function nexradTileUrl(evt, radarId = 'USCOMP', product = 'N0Q') {
  const dt = eventDateTimeUTC(evt)
  if (!dt) return null
  return nexradTileUrlForTimestamp(radarId, product, iemTimestamp(dt))
}

function isoUtc(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** Pick the scan timestamp closest to the event time from IEM. */
export async function resolveNearestScanTimestamp(evt, windowMinutes = 60) {
  const dt = eventDateTimeUTC(evt)
  if (!dt) return null

  const start = new Date(dt.getTime() - windowMinutes * 60 * 1000)
  const end = new Date(dt.getTime() + windowMinutes * 60 * 1000)
  const url = new URL('https://mesonet.agron.iastate.edu/json/radar.py')
  url.searchParams.set('operation', 'list')
  url.searchParams.set('radar', 'USCOMP')
  url.searchParams.set('product', 'N0Q')
  url.searchParams.set('start', isoUtc(start))
  url.searchParams.set('end', isoUtc(end))

  try {
    const res = await fetch(url.toString())
    if (!res.ok) return iemTimestamp(dt)
    const data = await res.json()
    const scans = data.scans || []
    if (!scans.length) return iemTimestamp(dt)

    const target = dt.getTime()
    let bestTs = scans[0].ts
    let bestDiff = Infinity
    for (const scan of scans) {
      const diff = Math.abs(new Date(scan.ts).getTime() - target)
      if (diff < bestDiff) {
        bestDiff = diff
        bestTs = scan.ts
      }
    }
    return iemTimestamp(new Date(bestTs))
  } catch {
    return iemTimestamp(dt)
  }
}

/** Resolve a tile URL, falling back to nearest archived scan if needed. */
export async function resolveRadarTileUrl(evt) {
  if (!evt || !radarAvailableForEvent(evt)) return null
  const ts = await resolveNearestScanTimestamp(evt)
  if (!ts) return null
  return nexradTileUrlForTimestamp('USCOMP', 'N0Q', ts)
}
