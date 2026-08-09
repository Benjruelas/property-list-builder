/**
 * Guards against specialty/subset parcel layers (surplus land, easements, lakes, etc.).
 */

// Specialty / subset layers — population-scaled feature counts are the main gate;
// this only blocks obvious non-countywide themes that sometimes still have large counts.
const REJECT_TITLE_RE =
  /\b(surplus\s+land|easement|open\s*space|williamson\s+act|vacant\s+gov|right[-\s]?of[-\s]?ways?|damage\s+survey|business\s+parcels|condo\s+only|campus|university|naes|tax\s+rate\s+areas?|big\s+bear\s+lake|sample|demo)\b/i

/**
 * Minimum acceptable feature count for a county-wide parcel layer.
 * Tuned so specialty layers (~tens–thousands) fail for large metros.
 */
export function minParcelCount(population2023) {
  const pop = Number(population2023) || 0
  if (pop >= 500_000) return Math.max(25_000, Math.floor(pop / 80))
  if (pop >= 100_000) return Math.max(8_000, Math.floor(pop / 100))
  if (pop >= 20_000) return Math.max(1_000, Math.floor(pop / 120))
  if (pop > 0) return Math.max(200, Math.floor(pop / 150))
  return 5_000
}

export function isRejectedSourceTitle(titleOrUrl = '') {
  return REJECT_TITLE_RE.test(String(titleOrUrl))
}

export async function fetchFeatureCount(layerUrl, { timeoutMs = 20000 } = {}) {
  const base = String(layerUrl).replace(/\/$/, '')
  const url = `${base}/query?where=1%3D1&returnCountOnly=true&f=json`
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'KnockScout-parcel-pipeline/1.0' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`count HTTP ${res.status}`)
  const data = await res.json()
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
  const count = Number(data.count)
  if (!Number.isFinite(count)) throw new Error('count missing')
  return count
}

/**
 * Validate a candidate layer before download.
 * Returns { ok, count, minRequired, reason? }
 */
export async function validateParcelLayer(layerUrl, { population2023, title = '' } = {}) {
  if (isRejectedSourceTitle(title) || isRejectedSourceTitle(layerUrl)) {
    return {
      ok: false,
      count: null,
      minRequired: minParcelCount(population2023),
      reason: `rejected specialty title/url: ${title || layerUrl}`,
    }
  }
  const minRequired = minParcelCount(population2023)
  try {
    const count = await fetchFeatureCount(layerUrl)
    if (count < minRequired) {
      return {
        ok: false,
        count,
        minRequired,
        reason: `featureCount ${count} < min ${minRequired} for pop ${population2023 || '?'}`,
      }
    }
    return { ok: true, count, minRequired }
  } catch (e) {
    return {
      ok: false,
      count: null,
      minRequired,
      reason: `count probe failed: ${e.message}`,
    }
  }
}

/** Post-download guard (uses actual written features). */
export function validateDownloadedCount(featureCount, population2023) {
  const minRequired = minParcelCount(population2023)
  const count = Number(featureCount) || 0
  if (count < minRequired) {
    return {
      ok: false,
      count,
      minRequired,
      reason: `downloaded ${count} < min ${minRequired}`,
    }
  }
  return { ok: true, count, minRequired }
}
