/**
 * LandRecords sits behind Cloudflare. Node 18+ `fetch()` sends
 * `User-Agent: node`, which Bot Fight Mode 403s as HTML. Cached R2 tiles
 * still paint; every origin miss looks blank. A browser-like UA gets
 * through to the real API (401 without a key, 200 with one).
 */
export const LANDRECORDS_USER_AGENT = 'KnockScout/1.0 (+https://knockscout.app)'

/** Path advertised by GET https://api.landrecords.us/ (XYZ, not TMS). */
export const LANDRECORDS_ADVERTISED_VECTOR_BASE =
  'https://api.landrecords.us/pro:parcel_us@EPSG:3857x2@pbf'

export function landRecordsAuthHeaders(apiKey = process.env.LANDRECORDS_API_KEY) {
  return {
    Authorization: `Bearer ${apiKey || ''}`,
    'User-Agent': LANDRECORDS_USER_AGENT,
    Accept: 'application/x-protobuf, application/json;q=0.9, */*;q=0.8',
  }
}

export function isTmsTileBase(baseUrl) {
  return /\/tms\//i.test(String(baseUrl || ''))
}

/** Origin URLs to try for MapLibre XYZ z/x/y. TMS bases need a Y flip. */
export function originParcelTileUrls(zi, xi, yi, baseUrl = process.env.LANDRECORDS_TILE_URL) {
  const base = String(baseUrl || '').replace(/\/$/, '')
  const tmsY = (1 << zi) - 1 - yi
  const urls = []
  if (base) {
    const y = isTmsTileBase(base) ? tmsY : yi
    urls.push(`${base}/${zi}/${xi}/${y}.pbf`)
  }
  const advertised = `${LANDRECORDS_ADVERTISED_VECTOR_BASE}/${zi}/${xi}/${yi}.pbf`
  if (!urls.includes(advertised)) urls.push(advertised)
  return urls
}
