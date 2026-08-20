#!/usr/bin/env node
/**
 * Validate a candidate ArcGIS / GeoJSON source URL for a county and optionally
 * write it into the remote catalog (status → ready).
 *
 * Usage:
 *   node discover-source.mjs --fips=48439 --url=https://.../MapServer/0 --type=arcgis
 */
import { parseArgs } from './lib/paths.mjs'
import { getLocalCounty } from './lib/catalogLocal.mjs'
import { apiConfigured, apiUpdateCounty } from './lib/apiClient.mjs'

async function probeArcgis(url) {
  const base = url.replace(/\/$/, '')
  const metaRes = await fetch(`${base}?f=json`, {
    headers: { 'User-Agent': 'KnockScout-parcel-pipeline/1.0' },
  })
  if (!metaRes.ok) throw new Error(`Meta HTTP ${metaRes.status}`)
  const meta = await metaRes.json()
  if (meta.error) throw new Error(meta.error.message || 'ArcGIS error')

  const params = new URLSearchParams({
    where: '1=1',
    outFields: '*',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
    resultRecordCount: '1',
  })
  const qRes = await fetch(`${base}/query?${params}`, {
    headers: { 'User-Agent': 'KnockScout-parcel-pipeline/1.0' },
  })
  if (!qRes.ok) throw new Error(`Query HTTP ${qRes.status}`)
  const data = await qRes.json()
  const feature = data.features?.[0]
  const fields = feature?.properties ? Object.keys(feature.properties) : (meta.fields || []).map((f) => f.name)
  return {
    ok: true,
    geometryType: meta.geometryType,
    name: meta.name,
    maxRecordCount: meta.maxRecordCount,
    sampleFields: fields.slice(0, 40),
    hasGeometry: Boolean(feature?.geometry),
  }
}

async function main() {
  const args = parseArgs()
  const fips = String(args.fips || '').padStart(5, '0')
  const url = args.url
  const type = args.type || 'arcgis'
  const persist = Boolean(args.persist)
  const licenseNote = args.license || ''

  if (!fips || fips === '00000' || !url) {
    console.error(
      'Usage: discover-source.mjs --fips=48439 --url=https://.../FeatureServer/0 [--type=arcgis] [--persist]',
    )
    process.exit(1)
  }

  const local = getLocalCounty(fips)
  if (!local) {
    console.error(`Unknown fips ${fips}`)
    process.exit(1)
  }

  let probe
  if (type === 'arcgis') probe = await probeArcgis(url)
  else if (type === 'geojson') {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const fc = await res.json()
    probe = {
      ok: true,
      featureCountHint: fc.features?.length,
      sampleFields: Object.keys(fc.features?.[0]?.properties || {}).slice(0, 40),
    }
  } else {
    throw new Error(`Unsupported type ${type}`)
  }

  const source = { type, url, layerId: args.layer != null ? Number(args.layer) : null, licenseNote }
  const result = {
    fips,
    county: `${local.name}, ${local.state}`,
    source,
    probe,
    searchHints: [
      `${local.name} ${local.state} GIS parcels FeatureServer`,
      `${local.name} County ${local.state} parcel MapServer`,
      `site:arcgis.com ${local.name} ${local.state} parcels`,
    ],
  }

  if (persist) {
    if (!apiConfigured()) {
      console.error('--persist requires PARCEL_PIPELINE_API_BASE + PARCEL_PIPELINE_SECRET')
      process.exit(1)
    }
    await apiUpdateCounty(fips, { source, status: 'ready' })
    result.persisted = true
  }

  console.log(JSON.stringify(result, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
