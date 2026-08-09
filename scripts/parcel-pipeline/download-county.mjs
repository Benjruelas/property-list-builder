#!/usr/bin/env node
/**
 * Download county parcel features to local GeoJSON.
 * Supports ArcGIS FeatureServer/MapServer query, GeoJSON URL, or local shapefile zip path.
 */
import fs from 'fs'
import path from 'path'
import { parseArgs, countyWorkDir } from './lib/paths.mjs'
import { getLocalCounty } from './lib/catalogLocal.mjs'
import { apiConfigured, apiGetCounty } from './lib/apiClient.mjs'

const PAGE_SIZE = 2000
const MAX_FEATURES = Number(process.env.PARCEL_DOWNLOAD_MAX_FEATURES || 2_000_000)

async function resolveCounty(fips) {
  if (apiConfigured()) {
    try {
      return await apiGetCounty(fips)
    } catch (e) {
      console.warn('[download] API get failed, using local seed:', e.message)
    }
  }
  return getLocalCounty(fips)
}

function layerUrl(source) {
  const url = source.url.replace(/\/$/, '')
  if (/\/(FeatureServer|MapServer)\/\d+$/i.test(url)) return url
  const layerId = source.layerId ?? 0
  return `${url}/${layerId}`
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'KnockScout-parcel-pipeline/1.0' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.json()
}

async function downloadArcgis(source, outPath) {
  const base = layerUrl(source)
  // Probe
  const meta = await fetchJson(`${base}?f=json`)
  if (meta.error) throw new Error(meta.error.message || JSON.stringify(meta.error))
  if (meta.geometryType && !/polygon/i.test(meta.geometryType)) {
    console.warn(`[download] geometryType=${meta.geometryType} (expected polygon)`)
  }

  const supportsPagination = meta.advancedQueryCapabilities?.supportsPagination !== false
  const maxRecordCount = Math.min(meta.maxRecordCount || PAGE_SIZE, PAGE_SIZE)
  const features = []
  let offset = 0
  let page = 0

  while (features.length < MAX_FEATURES) {
    page++
    const params = new URLSearchParams({
      where: '1=1',
      outFields: '*',
      returnGeometry: 'true',
      outSR: '4326',
      f: 'geojson',
      resultRecordCount: String(maxRecordCount),
    })
    if (supportsPagination) params.set('resultOffset', String(offset))

    const url = `${base}/query?${params}`
    console.log(`[download] page ${page} offset=${offset}`)
    const data = await fetchJson(url)
    const batch = data.features || []
    if (!batch.length) break
    features.push(...batch)
    if (batch.length < maxRecordCount) break
    if (!supportsPagination) {
      console.warn('[download] server does not support pagination; stopped after first page')
      break
    }
    offset += batch.length
    await new Promise((r) => setTimeout(r, 200))
  }

  if (features.length >= MAX_FEATURES) {
    console.warn(`[download] hit MAX_FEATURES=${MAX_FEATURES}`)
  }

  const fc = { type: 'FeatureCollection', features }
  fs.writeFileSync(outPath, JSON.stringify(fc))
  return { featureCount: features.length, outPath }
}

async function downloadGeojsonUrl(source, outPath) {
  const res = await fetch(source.url, {
    headers: { 'User-Agent': 'KnockScout-parcel-pipeline/1.0' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(outPath, buf)
  const fc = JSON.parse(buf.toString('utf8'))
  return { featureCount: fc.features?.length || 0, outPath }
}

async function downloadShapefileHint(source, outPath) {
  // Expect operator to pre-convert, or provide a .geojson path in source.url
  if (source.url.endsWith('.geojson') || source.url.endsWith('.json')) {
    if (source.url.startsWith('http')) return downloadGeojsonUrl(source, outPath)
    fs.copyFileSync(source.url, outPath)
    const fc = JSON.parse(fs.readFileSync(outPath, 'utf8'))
    return { featureCount: fc.features?.length || 0, outPath }
  }
  throw new Error(
    'shapefile source: convert to GeoJSON first (ogr2ogr) and set source.url to the .geojson path or URL',
  )
}

async function main() {
  const args = parseArgs()
  const fips = String(args.fips || args._[0] || '').padStart(5, '0')
  if (!fips || fips === '00000') {
    console.error('Usage: download-county.mjs --fips=48439')
    process.exit(1)
  }

  const county = await resolveCounty(fips)
  if (!county) {
    console.error(`Unknown county ${fips}`)
    process.exit(1)
  }
  if (!county.source?.url || county.source.type === 'none') {
    console.error(`County ${fips} has no downloadable source`)
    process.exit(2)
  }

  const dir = countyWorkDir(fips)
  const outPath = path.join(dir, 'raw.geojson')
  console.log(`[download] ${county.fullName || county.name}, ${county.state} (${fips})`)
  console.log(`[download] source type=${county.source.type} url=${county.source.url}`)

  let result
  if (county.source.type === 'arcgis') result = await downloadArcgis(county.source, outPath)
  else if (county.source.type === 'geojson') result = await downloadGeojsonUrl(county.source, outPath)
  else if (county.source.type === 'shapefile') result = await downloadShapefileHint(county.source, outPath)
  else throw new Error(`Unsupported source type: ${county.source.type}`)

  fs.writeFileSync(
    path.join(dir, 'download-meta.json'),
    JSON.stringify(
      {
        fips,
        downloadedAt: new Date().toISOString(),
        featureCount: result.featureCount,
        source: county.source,
      },
      null,
      2,
    ),
  )

  console.log(`[download] wrote ${result.featureCount} features → ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
