#!/usr/bin/env node
/**
 * Heuristic discovery of a public ArcGIS parcel Feature/MapServer for a county
 * via arcgis.com sharing search. Returns best candidate or null.
 *
 * Rejects specialty/subset layers and requires a population-scaled feature count.
 */
import {
  fetchFeatureCount,
  isRejectedSourceTitle,
  minParcelCount,
  validateParcelLayer,
} from './lib/sourceValidation.mjs'

export async function discoverArcgisSource({ name, state, fips, population2023 }) {
  const queries = [
    `${name} ${state} parcels type:"Feature Service"`,
    `${name} County ${state} parcels type:"Feature Service"`,
    `${name} ${state} tax parcels type:"Feature Service"`,
    `${name} County ${state} assessor parcels type:"Feature Service"`,
    `${name} ${state} parcels type:"Map Service"`,
  ]

  const candidates = []
  const seen = new Set()
  for (const q of queries) {
    const url = new URL('https://www.arcgis.com/sharing/rest/search')
    url.searchParams.set('q', q)
    url.searchParams.set('f', 'json')
    url.searchParams.set('num', '15')
    let data
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'KnockScout-parcel-pipeline/1.0' } })
      data = await res.json()
    } catch {
      continue
    }
    for (const r of data.results || []) {
      const title = String(r.title || '')
      const serviceUrl = String(r.url || '').replace(/\/$/, '')
      if (!serviceUrl) continue
      if (!/parcel|tax.?lot|cadastr|assessor/i.test(`${title} ${serviceUrl}`)) continue
      if (!/FeatureServer|MapServer/i.test(serviceUrl)) continue
      if (isRejectedSourceTitle(title) || isRejectedSourceTitle(serviceUrl)) continue
      const layerUrl = /\/(FeatureServer|MapServer)\/\d+$/i.test(serviceUrl)
        ? serviceUrl
        : `${serviceUrl}/0`
      if (seen.has(layerUrl)) continue
      seen.add(layerUrl)
      candidates.push({
        title,
        url: layerUrl,
        score:
          (/parcel/i.test(title) ? 5 : 0) +
          (/tax/i.test(title) ? 2 : 0) +
          (/assessor/i.test(title) ? 3 : 0) +
          (new RegExp(name.split(/\s+/)[0], 'i').test(title) ? 3 : 0) +
          (/FeatureServer/i.test(serviceUrl) ? 1 : 0) +
          (/county/i.test(title) ? 2 : 0),
      })
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  const minRequired = minParcelCount(population2023)
  const viable = []

  for (const c of candidates.slice(0, 12)) {
    try {
      const meta = await fetch(`${c.url}?f=json`, {
        headers: { 'User-Agent': 'KnockScout-parcel-pipeline/1.0' },
        signal: AbortSignal.timeout(12000),
      }).then((r) => r.json())
      if (meta.error) continue
      if (!/polygon/i.test(String(meta.geometryType || ''))) continue

      const validation = await validateParcelLayer(c.url, {
        population2023,
        title: c.title,
      })
      if (!validation.ok) {
        console.warn(`[discover] reject ${c.title}: ${validation.reason}`)
        continue
      }

      // smoke query
      const q = new URLSearchParams({
        where: '1=1',
        outFields: '*',
        returnGeometry: 'true',
        outSR: '4326',
        f: 'geojson',
        resultRecordCount: '1',
      })
      const sample = await fetch(`${c.url}/query?${q}`, {
        headers: { 'User-Agent': 'KnockScout-parcel-pipeline/1.0' },
        signal: AbortSignal.timeout(15000),
      }).then((r) => r.json())
      if (!sample.features?.length) continue

      viable.push({
        type: 'arcgis',
        url: c.url,
        layerId: Number(c.url.split('/').pop()) || 0,
        licenseNote: `auto-discovered via arcgis.com: ${c.title} (count=${validation.count})`,
        fieldMap: null,
        fips,
        featureCount: validation.count,
        title: c.title,
        score: c.score + Math.min(20, Math.log10(validation.count + 1) * 4),
      })
    } catch (e) {
      console.warn(`[discover] probe failed ${c.url}: ${e.message}`)
    }
  }

  if (!viable.length) {
    console.warn(
      `[discover] no viable source for ${name}, ${state} (need >= ${minRequired} parcels)`,
    )
    return null
  }

  viable.sort((a, b) => b.featureCount - a.featureCount || b.score - a.score)
  const best = viable[0]
  console.log(
    `[discover] chose ${best.title} count=${best.featureCount} (min=${minRequired}) url=${best.url}`,
  )
  const { title, score, ...source } = best
  return source
}

// re-export helpers for tests/callers
export { fetchFeatureCount, minParcelCount }
