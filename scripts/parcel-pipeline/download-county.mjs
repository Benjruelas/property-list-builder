#!/usr/bin/env node
/**
 * Download county parcel features to local newline-delimited GeoJSON (NDJSON).
 * Streams to disk so large counties do not blow V8 string limits.
 */
import fs from 'fs'
import path from 'path'
import { parseArgs, countyWorkDir } from './lib/paths.mjs'
import { getLocalCounty } from './lib/catalogLocal.mjs'
import { apiConfigured, apiGetCounty } from './lib/apiClient.mjs'

const PAGE_SIZE = Number(process.env.PARCEL_DOWNLOAD_PAGE_SIZE || 10000)
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

function countNdjsonLines(filePath) {
  if (!fs.existsSync(filePath)) return 0
  const fd = fs.openSync(filePath, 'r')
  const buf = Buffer.alloc(1024 * 1024)
  let lines = 0
  let bytes = 0
  let endsWithNewline = true
  try {
    let n
    while ((n = fs.readSync(fd, buf, 0, buf.length, bytes)) > 0) {
      bytes += n
      endsWithNewline = buf[n - 1] === 10
      for (let i = 0; i < n; i++) if (buf[i] === 10) lines++
    }
  } finally {
    fs.closeSync(fd)
  }
  // Trailing partial line (no final newline) still counts as one feature
  if (bytes > 0 && !endsWithNewline) lines++
  return lines
}

function openNdjsonWriter(outPath, { append = false, startCount = 0 } = {}) {
  const fd = fs.openSync(outPath, append ? 'a' : 'w')
  let count = startCount
  return {
    writeFeature(feature) {
      fs.writeSync(fd, `${JSON.stringify(feature)}\n`)
      count++
    },
    get count() {
      return count
    },
    close() {
      fs.closeSync(fd)
    },
  }
}

async function downloadArcgis(source, outPath) {
  const base = layerUrl(source)
  const meta = await fetchJson(`${base}?f=json`)
  if (meta.error) throw new Error(meta.error.message || JSON.stringify(meta.error))
  if (meta.geometryType && !/polygon/i.test(meta.geometryType)) {
    console.warn(`[download] geometryType=${meta.geometryType} (expected polygon)`)
  }

  const supportsPagination = meta.advancedQueryCapabilities?.supportsPagination !== false
  const maxRecordCount = Math.min(meta.maxRecordCount || PAGE_SIZE, PAGE_SIZE)

  const resume = process.env.PARCEL_DOWNLOAD_RESUME !== '0'
  let existing = 0
  if (resume && fs.existsSync(outPath)) {
    // Drop a trailing partial line if the previous process was killed mid-write
    const st = fs.statSync(outPath)
    if (st.size > 0) {
      const fd = fs.openSync(outPath, 'r+')
      try {
        const last = Buffer.alloc(1)
        fs.readSync(fd, last, 0, 1, st.size - 1)
        if (last[0] !== 10) {
          let pos = st.size - 1
          const buf = Buffer.alloc(1)
          while (pos > 0) {
            pos--
            fs.readSync(fd, buf, 0, 1, pos)
            if (buf[0] === 10) {
              pos++
              break
            }
          }
          fs.ftruncateSync(fd, pos)
          console.warn(`[download] truncated partial trailing line; size ${st.size} → ${pos}`)
        }
      } finally {
        fs.closeSync(fd)
      }
    }
    existing = countNdjsonLines(outPath)
  }

  const writer =
    existing > 0
      ? openNdjsonWriter(outPath, { append: true, startCount: existing })
      : openNdjsonWriter(outPath)
  let offset = existing
  let page = 0
  if (existing > 0) {
    console.log(`[download] resuming from ${existing} features (resultOffset=${offset})`)
  }

  try {
    while (writer.count < MAX_FEATURES) {
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
      console.log(`[download] page ${page} offset=${offset} written=${writer.count}`)
      const data = await fetchJson(url)
      const batch = data.features || []
      if (!batch.length) break
      for (const f of batch) writer.writeFeature(f)
      if (batch.length < maxRecordCount) break
      if (!supportsPagination) {
        console.warn('[download] server does not support pagination; stopped after first page')
        break
      }
      offset += batch.length
      await new Promise((r) => setTimeout(r, 100))
    }
  } finally {
    writer.close()
  }

  if (writer.count >= MAX_FEATURES) {
    console.warn(`[download] hit MAX_FEATURES=${MAX_FEATURES}`)
  }
  return { featureCount: writer.count, outPath, resumedFrom: existing }
}

async function downloadGeojsonUrl(source, outPath) {
  const res = await fetch(source.url, {
    headers: { 'User-Agent': 'KnockScout-parcel-pipeline/1.0' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const writer = openNdjsonWriter(outPath)
  try {
    // Prefer streaming if content is already NDJSON; else parse FeatureCollection once.
    const text = await res.text()
    if (text.trimStart().startsWith('{') && text.includes('"FeatureCollection"')) {
      const fc = JSON.parse(text)
      for (const f of fc.features || []) writer.writeFeature(f)
    } else {
      for (const line of text.split('\n')) {
        const t = line.trim()
        if (!t) continue
        writer.writeFeature(JSON.parse(t))
      }
    }
  } finally {
    writer.close()
  }
  return { featureCount: writer.count, outPath }
}

async function downloadShapefileHint(source, outPath) {
  if (source.url.endsWith('.geojson') || source.url.endsWith('.json') || source.url.endsWith('.ndjson')) {
    if (source.url.startsWith('http')) return downloadGeojsonUrl(source, outPath)
    const text = fs.readFileSync(source.url, 'utf8')
    const writer = openNdjsonWriter(outPath)
    try {
      if (text.trimStart().startsWith('{') && text.includes('"FeatureCollection"')) {
        const fc = JSON.parse(text)
        for (const f of fc.features || []) writer.writeFeature(f)
      } else {
        for (const line of text.split('\n')) {
          const t = line.trim()
          if (!t) continue
          writer.writeFeature(JSON.parse(t))
        }
      }
    } finally {
      writer.close()
    }
    return { featureCount: writer.count, outPath }
  }
  throw new Error(
    'shapefile source: convert to GeoJSON/NDJSON first (ogr2ogr) and set source.url to that path or URL',
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
  const outPath = path.join(dir, 'raw.ndjson')
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
        format: 'ndjson',
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
