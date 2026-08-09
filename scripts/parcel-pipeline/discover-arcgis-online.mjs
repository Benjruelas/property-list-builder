#!/usr/bin/env node
/**
 * Heuristic discovery of a public ArcGIS parcel Feature/MapServer for a county
 * via arcgis.com sharing search. Returns best candidate or null.
 */
export async function discoverArcgisSource({ name, state, fips }) {
  const queries = [
    `${name} ${state} parcels type:"Feature Service"`,
    `${name} County ${state} parcels type:"Feature Service"`,
    `${name} ${state} tax parcels type:"Feature Service"`,
    `${name} ${state} parcels type:"Map Service"`,
  ]

  const candidates = []
  for (const q of queries) {
    const url = new URL('https://www.arcgis.com/sharing/rest/search')
    url.searchParams.set('q', q)
    url.searchParams.set('f', 'json')
    url.searchParams.set('num', '10')
    let data
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'KnockScout-parcel-pipeline/1.0' } })
      data = await res.json()
    } catch {
      continue
    }
    for (const r of data.results || []) {
      const title = String(r.title || '')
      const serviceUrl = r.url || ''
      if (!/parcel|tax.?lot|cadastr|property/i.test(`${title} ${serviceUrl}`)) continue
      if (!/FeatureServer|MapServer/i.test(serviceUrl)) continue
      candidates.push({
        title,
        url: serviceUrl.replace(/\/$/, ''),
        score:
          (/parcel/i.test(title) ? 5 : 0) +
          (/tax/i.test(title) ? 2 : 0) +
          (new RegExp(name.split(/\s+/)[0], 'i').test(title) ? 3 : 0) +
          (/FeatureServer/i.test(serviceUrl) ? 1 : 0),
      })
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  for (const c of candidates.slice(0, 8)) {
    const layerUrl = /\/(FeatureServer|MapServer)\/\d+$/i.test(c.url) ? c.url : `${c.url}/0`
    try {
      const meta = await fetch(`${layerUrl}?f=json`, {
        headers: { 'User-Agent': 'KnockScout-parcel-pipeline/1.0' },
        signal: AbortSignal.timeout(12000),
      }).then((r) => r.json())
      if (meta.error) continue
      if (!/polygon/i.test(String(meta.geometryType || ''))) continue
      // smoke query
      const q = new URLSearchParams({
        where: '1=1',
        outFields: '*',
        returnGeometry: 'true',
        outSR: '4326',
        f: 'geojson',
        resultRecordCount: '1',
      })
      const sample = await fetch(`${layerUrl}/query?${q}`, {
        headers: { 'User-Agent': 'KnockScout-parcel-pipeline/1.0' },
        signal: AbortSignal.timeout(15000),
      }).then((r) => r.json())
      if (!sample.features?.length) continue
      return {
        type: 'arcgis',
        url: layerUrl,
        layerId: Number(layerUrl.split('/').pop()) || 0,
        licenseNote: `auto-discovered via arcgis.com: ${c.title}`,
        fieldMap: null,
        fips,
      }
    } catch {
      /* try next */
    }
  }
  return null
}
