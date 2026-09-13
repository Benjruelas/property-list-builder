const IEM_TILE_BASE = 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0'

/** Hours before / after hail report time for the scrub window. */
export const STORM_TIMELINE_BEFORE_HOURS = 12
export const STORM_TIMELINE_AFTER_HOURS = 6
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

const TIMELINE_CACHE_VERSION = 'v8'
/** Compiled SPC archive ends in 2024; later years come from 12Z convective-day files. */
const SPC_DAILY_REPORT_START_YEAR = 2025
const COMPOSITE_RADAR_ID = 'USCOMP'
const SITE_PRODUCT_PREFERENCE = ['N0B', 'N0Q', 'N0R', 'N0Z']
/** IEM ridge tiles stay sharp through ~z10; higher zooms are stretched mosaic pixels. */
export const IEM_RADAR_TILE_MAXZOOM = 10
/** Pad the storm camera so the parent cell stays in view (degrees). */
export const STORM_VIEW_PAD_DEG = 0.2
export const STORM_VIEW_MAX_ZOOM = 9

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
 * Tile stamp for an IEM scan list entry (`2024-04-28T21:01Z` → `202404282101`).
 * Site NEXRAD (N0B) volumes are not on a 5-minute grid — flooring them 503s.
 */
export function iemScanTileStamp(ts) {
  if (!ts) return null
  const match = String(ts).trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (match) {
    return `${match[1]}${match[2]}${match[3]}${match[4]}${match[5]}`
  }
  const at = parseIemScanTime(ts)
  if (!at) return null
  const pad = (n) => String(n).padStart(2, '0')
  return (
    at.getUTCFullYear().toString() +
    pad(at.getUTCMonth() + 1) +
    pad(at.getUTCDate()) +
    pad(at.getUTCHours()) +
    pad(at.getUTCMinutes())
  )
}

/**
 * SPC daily climo files (`YYMMDD_rpts_hail.csv`) cover 12Z–12Z.
 * Times 00:00–11:59 UTC are the next calendar day.
 */
export function eventUsesConvectiveDayClock(evt) {
  if (!evt) return false
  if (evt.convective_day === true) return true
  if (evt.convective_day === false) return false
  const year = Number(evt.year) || Number(String(evt.date || '').slice(0, 4))
  return Number.isFinite(year) && year >= SPC_DAILY_REPORT_START_YEAR
}

/**
 * Build a UTC Date for the event. Uses evt.time_utc when present,
 * otherwise defaults to 21:00 UTC (afternoon CONUS hail).
 *
 * Calendar date preference:
 * 1. `date_utc` when the API preserved the CST→UTC day roll
 * 2. SPC `date` + convective-day overnight roll (2025+ daily files)
 * 3. SPC `date` + compiled-archive evening wrap (time_utc 00–05 without date_utc)
 */
export function eventDateTimeUTC(evt) {
  if (!evt?.date && !evt?.date_utc) return null
  const dateStr = evt.date_utc || evt.date
  const [y, m, d] = String(dateStr).split('-').map(Number)
  if (!y || !m || !d) return null
  if (evt.time_utc) {
    const [hh, mm] = evt.time_utc.split(':').map(Number)
    const hour = hh || 0
    const dt = new Date(Date.UTC(y, m - 1, d, hour, mm || 0))
    // date_utc is already absolute — do not apply further day rolls.
    if (!evt.date_utc) {
      if (eventUsesConvectiveDayClock(evt) && hour < 12) {
        dt.setUTCDate(dt.getUTCDate() + 1)
      } else if (!eventUsesConvectiveDayClock(evt) && hour < 6) {
        // Compiled SPC archive converted CST→UTC but only stored HH:MM.
        // Evening local times (18:00–23:59 CST) become 00:00–05:59 UTC next day.
        dt.setUTCDate(dt.getUTCDate() + 1)
      }
    }
    return dt
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

export function nexradTileUrl(evt, radarId = COMPOSITE_RADAR_ID, product = preferredRadarProduct(evt)) {
  const dt = eventDateTimeUTC(evt)
  if (!dt) return null
  return nexradTileUrlForTimestamp(radarId, product, iemTimestamp(dt))
}

function isoUtc(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** IEM JSON services want `YYYY-MM-DDTHH:MMZ` (no seconds). */
export function iemIsoMinute(date) {
  if (!date) return ''
  return `${date.toISOString().slice(0, 16)}Z`
}

/** IEM scan stamps are often `2026-04-26T03:30Z` — some browsers reject missing seconds. */
export function parseIemScanTime(ts) {
  if (!ts) return null
  const raw = String(ts).trim()
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/.test(raw)
    ? `${raw.slice(0, 16)}:00Z`
    : raw
  const dt = new Date(normalized)
  return Number.isFinite(dt.getTime()) ? dt : null
}

/** First single-site NEXRAD in IEM's nearest-first available list. */
export function pickNearestNexradId(radars) {
  const site = (radars || []).find((r) => (
    r?.type === 'NEXRAD' && r.id && r.id !== COMPOSITE_RADAR_ID
  ))
  return site?.id || COMPOSITE_RADAR_ID
}

export function pickSiteProduct(products, fallback = 'N0Q') {
  const ids = new Set((products || []).map((p) => p?.id || p).filter(Boolean))
  for (const id of SITE_PRODUCT_PREFERENCE) {
    if (ids.has(id)) return id
  }
  return fallback
}

export function radarDisplayName(radarId, radarName) {
  if (radarName) return radarName
  if (!radarId || radarId === COMPOSITE_RADAR_ID) return 'National mosaic'
  return radarId
}

/**
 * Camera bounds around the property + hail report so the parent cell stays visible.
 */
export function hailStormViewBounds(parcel, event) {
  const lats = [parcel?.lat, event?.lat]
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n))
  const lngs = [parcel?.lng, event?.lng]
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n))
  if (!lats.length || !lngs.length) return null
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const lngPad = Math.max(STORM_VIEW_PAD_DEG, (maxLng - minLng) * 0.35)
  const latPad = Math.max(STORM_VIEW_PAD_DEG, (maxLat - minLat) * 0.35)
  return [
    [minLng - lngPad, minLat - latPad],
    [maxLng + lngPad, maxLat + latPad],
  ]
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
    evt.date_utc ?? '',
    evt.time_utc ?? '',
    evt.convective_day === true ? 'cd' : '',
    evt.lat,
    evt.lng,
    evt.year,
  ].join('|')
}

export function getCachedStormTimeline(evt) {
  const key = hailEventTimelineKey(evt)
  return key ? TIMELINE_CACHE.get(key) ?? null : null
}

async function fetchScanList(start, end, product = 'N0Q', radar = COMPOSITE_RADAR_ID) {
  const key = `${radar}|${product}|${isoUtc(start)}|${isoUtc(end)}`
  const cached = SCAN_LIST_CACHE.get(key)
  if (cached && Date.now() - cached.fetchedAt < SCAN_CACHE_TTL_MS) {
    return cached.scans
  }

  const url = new URL('https://mesonet.agron.iastate.edu/json/radar.py')
  url.searchParams.set('operation', 'list')
  url.searchParams.set('radar', radar)
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

async function fetchIemJson(url) {
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`IEM radar: ${res.status}`)
  return res.json()
}

/**
 * Nearest single-site NEXRAD + a reflectivity product that site actually archived.
 * Falls back to the national mosaic when IEM has no local site.
 */
export async function resolveRadarCoverage(evt) {
  const preferred = preferredRadarProduct(evt)
  const fallback = {
    radarId: COMPOSITE_RADAR_ID,
    radarName: 'National mosaic',
    product: preferred,
  }
  const dt = eventDateTimeUTC(evt)
  const lat = Number(evt?.lat)
  const lng = Number(evt?.lng)
  if (!dt || !Number.isFinite(lat) || !Number.isFinite(lng)) return fallback

  try {
    const availableUrl = new URL('https://mesonet.agron.iastate.edu/json/radar.py')
    availableUrl.searchParams.set('operation', 'available')
    availableUrl.searchParams.set('lat', String(lat))
    availableUrl.searchParams.set('lon', String(lng))
    availableUrl.searchParams.set('start', iemIsoMinute(dt))
    const available = await fetchIemJson(availableUrl)
    const radarId = pickNearestNexradId(available.radars)
    const radarName = (available.radars || []).find((r) => r.id === radarId)?.name || null

    if (radarId === COMPOSITE_RADAR_ID) {
      return { ...fallback, radarName: radarName || fallback.radarName }
    }

    const productsUrl = new URL('https://mesonet.agron.iastate.edu/json/radar.py')
    productsUrl.searchParams.set('operation', 'products')
    productsUrl.searchParams.set('radar', radarId)
    productsUrl.searchParams.set('start', iemIsoMinute(dt))
    const products = await fetchIemJson(productsUrl)
    const product = pickSiteProduct(products.products, preferred)
    return { radarId, radarName: radarName || radarId, product }
  } catch {
    return fallback
  }
}

/** Load site scans first; fall back to the national mosaic if the site is empty. */
export async function fetchScansForEvent(evt, start, end) {
  const coverage = await resolveRadarCoverage(evt)
  const preferred = preferredRadarProduct(evt)
  const mosaicFallback = preferred === 'N0Q' ? 'N0R' : 'N0Q'
  const attempts = [
    coverage,
    {
      radarId: COMPOSITE_RADAR_ID,
      radarName: 'National mosaic',
      product: preferred,
    },
    {
      radarId: COMPOSITE_RADAR_ID,
      radarName: 'National mosaic',
      product: mosaicFallback,
    },
  ]

  const seen = new Set()
  for (const attempt of attempts) {
    const key = `${attempt.radarId}|${attempt.product}`
    if (seen.has(key)) continue
    seen.add(key)
    try {
      const scans = await fetchScanList(start, end, attempt.product, attempt.radarId)
      if (scans.length) {
        return { ...attempt, scans }
      }
    } catch {
      /* try next coverage */
    }
  }

  return { ...coverage, scans: [] }
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
    const scanAt = parseIemScanTime(scan.ts)
    if (!scanAt) continue
    const diff = Math.abs(scanAt.getTime() - target)
    if (diff < bestDiff) {
      bestDiff = diff
      bestTs = scan.ts
    }
  }
  if (bestTs == null || bestDiff > maxDiffMs) return null
  return iemScanTileStamp(bestTs)
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
export function formatEventTimeLocal(timeUtc, dateStr, timeZone = STORM_LOCAL_TIME_ZONE, extra = null) {
  if (!timeUtc || !dateStr) return null
  const evt = eventDateTimeUTC({
    date: dateStr,
    time_utc: timeUtc,
    year: extra?.year,
    convective_day: extra?.convective_day,
    date_utc: extra?.date_utc,
  })
  if (!evt) return null
  return evt.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }) + ' CT'
}

/** Pick the scan timestamp closest to a target time from IEM. */
export async function resolveNearestScanTimestampAt(
  at,
  windowMinutes = 60,
  product = 'N0Q',
  radar = COMPOSITE_RADAR_ID
) {
  if (!at) return null

  const start = new Date(at.getTime() - windowMinutes * 60 * 1000)
  const end = new Date(at.getTime() + windowMinutes * 60 * 1000)

  try {
    const scans = await fetchScanList(start, end, product, radar)
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
  const coverage = await resolveRadarCoverage(evt)
  const ts = await resolveNearestScanTimestampAt(dt, windowMinutes, coverage.product, coverage.radarId)
  if (ts) return { ts, product: coverage.product, radarId: coverage.radarId }
  if (coverage.radarId !== COMPOSITE_RADAR_ID) {
    const mosaicProduct = preferredRadarProduct(evt)
    const alt = await resolveNearestScanTimestampAt(dt, windowMinutes, mosaicProduct, COMPOSITE_RADAR_ID)
    if (alt) return { ts: alt, product: mosaicProduct, radarId: COMPOSITE_RADAR_ID }
  }
  return null
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

  const { product, scans, radarId = COMPOSITE_RADAR_ID, radarName } = await fetchScansForEvent(evt, start, end)

  const offsets = buildStormTimelineOffsets()
  const frames = offsets.map((offsetHours) => {
    const at = stormTimelineDate(evt, offsetHours)
    const ts = pickNearestScanTimestamp(scans, at)
    return {
      offsetHours,
      at,
      ts,
      product,
      radarId,
      radarName: radarName || radarDisplayName(radarId),
      tileUrl: ts ? nexradTileUrlForTimestamp(radarId, product, ts) : null,
      label: formatStormFrameLabel(at, reportAt),
    }
  })

  // Only cache successful timelines so transient IEM failures can retry.
  if (cacheKey && frames.some((f) => f.tileUrl)) {
    TIMELINE_CACHE.set(cacheKey, frames)
  }
  return frames
}

/** Resolve a tile URL, falling back to nearest archived scan if needed. */
export async function resolveRadarTileUrl(evt) {
  if (!evt || !radarAvailableForEvent(evt)) return null
  const resolved = await resolveNearestScanTimestamp(evt)
  if (!resolved?.ts) return null
  return nexradTileUrlForTimestamp(resolved.radarId || COMPOSITE_RADAR_ID, resolved.product, resolved.ts)
}
