const IEM_TILE_BASE = 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0'

/** Hourly steps from N hours before the hail report through report time. */
export const STORM_TIMELINE_STEP_HOURS = 1
export const STORM_TIMELINE_LOOKBACK_HOURS = 24
/** @deprecated Use STORM_TIMELINE_LOOKBACK_HOURS — kept for callers expecting the old name. */
export const STORM_TIMELINE_RADIUS_HOURS = STORM_TIMELINE_LOOKBACK_HOURS

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

const SCAN_LIST_CACHE = new Map()
const TIMELINE_CACHE = new Map()
const SCAN_CACHE_TTL_MS = 10 * 60 * 1000

export function hailEventTimelineKey(evt) {
  if (!evt) return ''
  return `lb${STORM_TIMELINE_LOOKBACK_HOURS}|${evt.date}|${evt.time_utc ?? ''}|${evt.lat}|${evt.lng}|${evt.year}`
}

export function getCachedStormTimeline(evt) {
  const key = hailEventTimelineKey(evt)
  return key ? TIMELINE_CACHE.get(key) ?? null : null
}

async function fetchScanList(start, end) {
  const key = `${isoUtc(start)}|${isoUtc(end)}`
  const cached = SCAN_LIST_CACHE.get(key)
  if (cached && Date.now() - cached.fetchedAt < SCAN_CACHE_TTL_MS) {
    return cached.scans
  }

  const url = new URL('https://mesonet.agron.iastate.edu/json/radar.py')
  url.searchParams.set('operation', 'list')
  url.searchParams.set('radar', 'USCOMP')
  url.searchParams.set('product', 'N0Q')
  url.searchParams.set('start', isoUtc(start))
  url.searchParams.set('end', isoUtc(end))

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`IEM radar list: ${res.status}`)
  const data = await res.json()
  const scans = data.scans || []
  SCAN_LIST_CACHE.set(key, { scans, fetchedAt: Date.now() })
  return scans
}

function pickNearestScanTimestamp(scans, at) {
  if (!at || !scans?.length) return null

  const target = at.getTime()
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
}

/** Hour offsets from report time: -24 … 0 (hourly), scrubbing toward the storm. */
export function buildStormTimelineOffsets(
  lookbackHours = STORM_TIMELINE_LOOKBACK_HOURS,
  stepHours = STORM_TIMELINE_STEP_HOURS
) {
  const offsets = []
  for (let h = -lookbackHours; h <= 0; h += stepHours) {
    offsets.push(h)
  }
  return offsets
}

export function stormTimelineDate(evt, offsetHours) {
  const reportAt = eventDateTimeUTC(evt)
  if (!reportAt) return null
  return new Date(reportAt.getTime() + offsetHours * 60 * 60 * 1000)
}

export function formatStormFrameLabel(at, reportAt) {
  if (!at || !reportAt) return ''
  const offsetH = Math.round((at.getTime() - reportAt.getTime()) / 3600000)
  const timeStr = at.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  })
  if (offsetH === 0) return `Report · ${timeStr} UTC`
  const sign = offsetH > 0 ? '+' : ''
  return `${sign}${offsetH}h · ${timeStr} UTC`
}

/** Pick the scan timestamp closest to a target time from IEM. */
export async function resolveNearestScanTimestampAt(at, windowMinutes = 60) {
  if (!at) return null

  const start = new Date(at.getTime() - windowMinutes * 60 * 1000)
  const end = new Date(at.getTime() + windowMinutes * 60 * 1000)

  try {
    const scans = await fetchScanList(start, end)
    if (!scans.length) return null
    return pickNearestScanTimestamp(scans, at)
  } catch {
    return iemTimestamp(at)
  }
}

/** Pick the scan timestamp closest to the event time from IEM. */
export async function resolveNearestScanTimestamp(evt, windowMinutes = 60) {
  const dt = eventDateTimeUTC(evt)
  if (!dt) return null
  return resolveNearestScanTimestampAt(dt, windowMinutes)
}

/** Resolve radar frames hourly from 24h before the hail report through report time. */
export async function resolveStormTimeline(evt) {
  const cacheKey = hailEventTimelineKey(evt)
  if (cacheKey && TIMELINE_CACHE.has(cacheKey)) {
    return TIMELINE_CACHE.get(cacheKey)
  }

  const reportAt = eventDateTimeUTC(evt)
  if (!reportAt || !radarAvailableForEvent(evt)) return []

  const padMs = 60 * 60 * 1000
  const start = new Date(reportAt.getTime() - STORM_TIMELINE_LOOKBACK_HOURS * 3600000 - padMs)
  const end = new Date(reportAt.getTime() + padMs)

  let scans = []
  try {
    scans = await fetchScanList(start, end)
  } catch {
    scans = []
  }

  const offsets = buildStormTimelineOffsets()
  const frames = offsets.map((offsetHours) => {
    const at = stormTimelineDate(evt, offsetHours)
    const ts = scans.length
      ? pickNearestScanTimestamp(scans, at)
      : (at ? iemTimestamp(at) : null)
    return {
      offsetHours,
      at,
      ts,
      tileUrl: ts ? nexradTileUrlForTimestamp('USCOMP', 'N0Q', ts) : null,
      label: formatStormFrameLabel(at, reportAt),
    }
  })

  if (cacheKey) TIMELINE_CACHE.set(cacheKey, frames)
  return frames
}

/** Resolve a tile URL, falling back to nearest archived scan if needed. */
export async function resolveRadarTileUrl(evt) {
  if (!evt || !radarAvailableForEvent(evt)) return null
  const ts = await resolveNearestScanTimestamp(evt)
  if (!ts) return null
  return nexradTileUrlForTimestamp('USCOMP', 'N0Q', ts)
}
