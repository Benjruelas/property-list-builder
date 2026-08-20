#!/usr/bin/env node
/**
 * Normalize raw county NDJSON properties to LandRecords-like keys (streaming).
 */
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { parseArgs, countyWorkDir } from './lib/paths.mjs'
import { getLocalCounty } from './lib/catalogLocal.mjs'
import { apiConfigured, apiGetCounty } from './lib/apiClient.mjs'
import { normalizeParcelProperties } from '../../api/_lib/parcelPipeline/fieldMap.js'

async function resolveCounty(fips) {
  if (apiConfigured()) {
    try {
      return await apiGetCounty(fips)
    } catch {
      /* local */
    }
  }
  return getLocalCounty(fips)
}

function centroidOf(geom) {
  if (!geom) return null
  let rings
  if (geom.type === 'Polygon') rings = geom.coordinates
  else if (geom.type === 'MultiPolygon') rings = geom.coordinates[0]
  else return null
  if (!rings?.[0]?.length) return null
  let sx = 0
  let sy = 0
  let n = 0
  for (const [x, y] of rings[0]) {
    sx += x
    sy += y
    n++
  }
  if (!n) return null
  return { lon: sx / n, lat: sy / n }
}

function resolveRawPath(dir) {
  const ndjson = path.join(dir, 'raw.ndjson')
  const geojson = path.join(dir, 'raw.geojson')
  if (fs.existsSync(ndjson)) return { path: ndjson, format: 'ndjson' }
  if (fs.existsSync(geojson)) return { path: geojson, format: 'geojson' }
  return null
}

async function main() {
  const args = parseArgs()
  const fips = String(args.fips || args._[0] || '').padStart(5, '0')
  if (!fips || fips === '00000') {
    console.error('Usage: normalize-county.mjs --fips=48439')
    process.exit(1)
  }

  const county = await resolveCounty(fips)
  if (!county) {
    console.error(`Unknown county ${fips}`)
    process.exit(1)
  }

  const dir = countyWorkDir(fips)
  const raw = resolveRawPath(dir)
  if (!raw) {
    console.error(`Missing raw.ndjson/raw.geojson in ${dir} — run download-county first`)
    process.exit(1)
  }

  const outPath = path.join(dir, 'normalized.ndjson')
  const outFd = fs.openSync(outPath, 'w')
  let kept = 0
  let seen = 0

  const writeNormalized = (feature) => {
    seen++
    const props = normalizeParcelProperties(feature.properties || {}, {
      fieldMap: county.fieldMap,
      countyname: county.name,
      geoid: fips,
      state: county.state,
    })
    if (!props.parcelid) return
    if (props.lat == null || props.lon == null) {
      const c = centroidOf(feature.geometry)
      if (c) {
        props.lat = c.lat
        props.lon = c.lon
      }
    }
    const out = {
      type: 'Feature',
      geometry: feature.geometry,
      properties: props,
    }
    fs.writeSync(outFd, `${JSON.stringify(out)}\n`)
    kept++
  }

  try {
    if (raw.format === 'ndjson') {
      const rl = readline.createInterface({
        input: fs.createReadStream(raw.path, { encoding: 'utf8' }),
        crlfDelay: Infinity,
      })
      for await (const line of rl) {
        const t = line.trim()
        if (!t) continue
        writeNormalized(JSON.parse(t))
        if (seen % 50000 === 0) console.log(`[normalize] processed ${seen}, kept ${kept}`)
      }
    } else {
      const fc = JSON.parse(fs.readFileSync(raw.path, 'utf8'))
      for (const f of fc.features || []) writeNormalized(f)
    }
  } finally {
    fs.closeSync(outFd)
  }

  console.log(`[normalize] ${kept}/${seen} features → ${outPath}`)
  if (!kept) {
    console.error('[normalize] zero features after normalization (check fieldMap / parcel ids)')
    process.exit(3)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
