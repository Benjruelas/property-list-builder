const IEM_TILE_BASE = 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0'

/** Hours before / after hail report time for the scrub window. */
export const STORM_TIMELINE_BEFORE_HOURS = 6
export const STORM_TIMELINE_AFTER_HOURS = 3
/** @deprecated Prefer STORM_TIMELINE_BEFORE_HOURS / AFTER — kept for older callers. */
export const STORM_TIMELINE_RADIUS_HOURS = STORM_TIMELINE_BEFORE_HOURS
export const STORM_TIMELINE_LOOKBACK_HOURS = STORM_TIMELINE_BEFORE_HOURS
export const STORM_TIMELINE_STEP_HOURS = 1
/** Finer scrub near the report so cells are easier to find. */
export const STORM_TIMELINE_NEAR_HOURS = 2
export const STORM_TIMELINE_NEAR_STEP_HOURS = 0.25 // 15 minutes
/** Reject IEM scans farther than this from the target frame time. */
export const STORM_SCAN_MAX_DIFF_MS = 20 * 60 * 1000
/** IEM N0Q composite archive begins 2010-11-13 16:25 UTC. */
export const N0Q_ARCHIVE_START_MS = Date.UTC(2010, 10, 13, 16, 25)
export const STORM_LOCAL_TIME_ZONE = 'America/Chicago'

const TIMELINE_CACHE_VERSION = 'v3'

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

/** NEXRAD composites are archived from ~1995. Older events can't render. */
export function radarAvailableForEvent(evt) {
  return evt?.year >= 1995
}

/** Prefer N0Q when the archive has it; otherwise N0R (back to 1995). */
export function preferredRadarProduct(evtOrDate) {
  const dt = evtOrDate instanceof Date ? evtOrDate : eventDateTimeUTC(evtOrDate)
  if (dt && dt.getTime() >= N0Q_ARCHIVE_START_MS) return 'N0Q'
  return 'N0R'
}

export function nexradTileUrlForTimestamp(radarId, product, ts) {
  return `${IEM_TILE_BASE}/ridge::${radarId}-${product}-${ts}/{z}/{x}/{y}.png`
}

export function nexradTileUrl(evt, radarId = 'USCOMP', product = preferredRadarProduct(evt)) {
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
  return [
    TIMELINE_CACHE_VERSION,
    `b${STORM_TIMELINE_BEFORE_HOURS}`,
    `a${STORM_TIMELINE_AFTER_HOURS}`,
    evt.date,
    evt.time_utc ?? '',
    evt.lat,
    evt.lng,
    evt.year,
  ].join('|')
}

export function getCachedStormTimeline(evt) {
  const key = hailEventTimelineKey(evt)
  return key ? TIMELINE_CACHE.get(key) ?? null : null
}

async function fetchScanList(start, end, product = 'N0Q') {
  const key = `${product}|${isoUtc(start)}|${isoUtc(end)}`
  const cached = SCAN_LIST_CACHE.get(key)
  if (cached && Date.now() - cached.fetchedAt < SCAN_CACHE_TTL_MS) {
    return cached.scans
  }

  const url = new URL('https://mesonet.agron.iastate.edu/json/radar.py')
  url.searchParams.set('operation', 'list')
  url.searchParams.set('radar', 'USCOMP')
  url.searchParams.set('product', product)
  url.searchParams.set('start', isoUtc(start))
  url.searchParams.set('end', isoUtc(end))

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`IEM radar list: ${res.status}`)
  const data = await res.json()
  const scans = data.scans || []
  SCAN_LIST_CACHE.set(key, { scans, fetchedAt: Date.now() })
  return scans
}

/** Load preferred product scans; fall back to the other composite if empty. */
export async function fetchScansForEvent(evt, start, end) {
  const preferred = preferredRadarProduct(evt)
  const fallback = preferred === 'N0Q' ? 'N0R' : 'N0Q'
  try {
    const primary = await fetchScanList(start, end, preferred)
    if (primary.length) return { product: preferred, scans: primary }
  } catch {
    /* try fallback */
  }
  try {
    const secondary = await fetchScanList(start, end, fallback)
    if (secondary.length) return { product: fallback, scans: secondary }
  } catch {
    /* no scans */
  }
  return { product: preferred, scans: [] }
}

/**
 * Nearest scan timestamp within maxDiffMs of target.
 * Returns null instead of inventing a synthetic stamp that 503s.
 */
export function pickNearestScanTimestamp(
  scans,
  at,
  maxDiffMs = STORM_SCAN_MAX_DIFF_MS
) {
  if (!at || !scans?.length) return null

  const target = at.getTime()
  let bestTs = null
  let bestDiff = Infinity
  for (const scan of scans) {
    const diff = Math.abs(new Date(scan.ts).getTime() - target)
    if (diff < bestDiff) {
      bestDiff = diff
      bestTs = scan.ts
    }
  }
  if (bestTs == null || bestDiff > maxDiffMs) return null
  return iemTimestamp(new Date(bestTs))
}

/**
 * Offsets (hours) from report time: before … after.
 * Uses 15-minute steps within ±NEAR_HOURS, hourly outside.
 */
export function buildStormTimelineOffsets(
  beforeHours = STORM_TIMELINE_BEFORE_HOURS,
  afterHours = STORM_TIMELINE_AFTER_HOURS,
  {
    nearHours = STORM_TIMELINE_NEAR_HOURS,
    nearStepHours = STORM_TIMELINE_NEAR_STEP_HOURS,
    farStepHours = STORM_TIMELINE_STEP_HOURS,
  } = {}
) {
  const offsets = new Set()
  const pushRange = (from, to, step) => {
    for (let h = from; h <= to + 1e-9; h += step) {
      offsets.add(Math.round(h * 1000) / 1000)
    }
  }

  const nearStart = Math.max(-beforeHours, -nearHours)
  const nearEnd = Math.min(afterHours, nearHours)

  if (-beforeHours < nearStart) pushRange(-beforeHours, nearStart - farStepHours, farStepHours)
  pushRange(nearStart, nearEnd, nearStepHours)
  if (nearEnd < afterHours) pushRange(nearEnd + farStepHours, afterHours, farStepHours)

  return [...offsets].sort((a, b) => a - b)
}

/** Index of the hail-report frame (offset 0). Prefer middle-ish last resort. */
export function initialStormFrameIndex(frames) {
  if (!frames?.length) return 0
  const reportIdx = frames.findIndex((f) => f.offsetHours === 0)
  return reportIdx >= 0 ? reportIdx : Math.floor(frames.length / 2)
}

export function stormTimelineDate(evt, offsetHours) {
  const reportAt = eventDateTimeUTC(evt)
  if (!reportAt) return null
  return new Date(reportAt.getTime() + offsetHours * 60 * 60 * 1000)
}

function formatLocalTime(at, timeZone = STORM_LOCAL_TIME_ZONE) {
  return at.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  })
}

export function formatStormFrameLabel(at, reportAt, timeZone = STORM_LOCAL_TIME_ZONE) {
  if (!at || !reportAt) return ''
  const offsetMin = Math.round((at.getTime() - reportAt.getTime()) / 60000)
  const timeStr = formatLocalTime(at, timeZone)
  if (offsetMin === 0) return `Report · ${timeStr} CT`
  if (Math.abs(offsetMin) < 60) {
    const sign = offsetMin > 0 ? '+' : ''
    return `${sign}${offsetMin}m · ${timeStr} CT`
  }
  const offsetH = offsetMin / 60
  const rounded = Number.isInteger(offsetH) ? offsetH : Math.round(offsetH * 10) / 10
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded}h · ${timeStr} CT`
}

/** Format hail report clock for UI (Central Time). */
export function formatEventTimeLocal(timeUtc, dateStr, timeZone = STORM_LOCAL_TIME_ZONE) {
  if (!timeUtc || !dateStr) return null
  const evt = eventDateTimeUTC({ date: dateStr, time_utc: timeUtc })
  if (!evt) return null
  return evt.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }) + ' CT'
}

/** Pick the scan timestamp closest to a target time from IEM. */
export async function resolveNearestScanTimestampAt(at, windowMinutes = 60, product = 'N0Q') {
  if (!at) return null

  const start = new Date(at.getTime() - windowMinutes * 60 * 1000)
  const end = new Date(at.getTime() + windowMinutes * 60 * 1000)

  try {
    const scans = await fetchScanList(start, end, product)
    if (!scans.length) return null
    return pickNearestScanTimestamp(scans, at)
  } catch {
    return null
  }
}

/** Pick the scan timestamp closest to the event time from IEM. */
export async function resolveNearestScanTimestamp(evt, windowMinutes = 60) {
  const dt = eventDateTimeUTC(evt)
  if (!dt) return null
  const product = preferredRadarProduct(evt)
  const ts = await resolveNearestScanTimestampAt(dt, windowMinutes, product)
  if (ts) return { ts, product }
  const fallback = product === 'N0Q' ? 'N0R' : 'N0Q'
  const alt = await resolveNearestScanTimestampAt(dt, windowMinutes, fallback)
  return alt ? { ts: alt, product: fallback } : null
}

/** Resolve radar frames around the hail report (before/after + fine near-report steps). */
export async function resolveStormTimeline(evt) {
  const cacheKey = hailEventTimelineKey(evt)
  if (cacheKey && TIMELINE_CACHE.has(cacheKey)) {
    return TIMELINE_CACHE.get(cacheKey)
  }

  const reportAt = eventDateTimeUTC(evt)
  if (!reportAt || !radarAvailableForEvent(evt)) return []

  const padMs = 30 * 60 * 1000
  const start = new Date(reportAt.getTime() - STORM_TIMELINE_BEFORE_HOURS * 3600000 - padMs)
  const end = new Date(reportAt.getTime() + STORM_TIMELINE_AFTER_HOURS * 3600000 + padMs)

  const { product, scans } = await fetchScansForEvent(evt, start, end)

  const offsets = buildStormTimelineOffsets()
  const frames = offsets.map((offsetHours) => {
    const at = stormTimelineDate(evt, offsetHours)
    const ts = pickNearestScanTimestamp(scans, at)
    return {
      offsetHours,
      at,
      ts,
      product,
      tileUrl: ts ? nexradTileUrlForTimestamp('USCOMP', product, ts) : null,
      label: formatStormFrameLabel(at, reportAt),
    }
  })

  if (cacheKey) TIMELINE_CACHE.set(cacheKey, frames)
  return frames
}

/** Resolve a tile URL, falling back to nearest archived scan if needed. */
export async function resolveRadarTileUrl(evt) {
  if (!evt || !radarAvailableForEvent(evt)) return null
  const resolved = await resolveNearestScanTimestamp(evt)
  if (!resolved?.ts) return null
  return nexradTileUrlForTimestamp('USCOMP', resolved.product, resolved.ts)
}
