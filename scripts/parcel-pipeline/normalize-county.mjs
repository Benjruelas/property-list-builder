#!/usr/bin/env node
/**
 * Normalize raw county GeoJSON properties to LandRecords-like keys.
 */
import fs from 'fs'
import path from 'path'
import { parseArgs, countyWorkDir } from './lib/paths.mjs'
import { getLocalCounty } from './lib/catalogLocal.mjs'
import { apiConfigured, apiGetCounty } from './lib/apiClient.mjs'
import { normalizeFeatureCollection } from '../../api/_lib/parcelPipeline/fieldMap.js'

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
  const rawPath = path.join(dir, 'raw.geojson')
  if (!fs.existsSync(rawPath)) {
    console.error(`Missing ${rawPath} — run download-county first`)
    process.exit(1)
  }

  const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'))
  let fc = normalizeFeatureCollection(raw, {
    fieldMap: county.fieldMap,
    countyname: county.name,
    geoid: fips,
    state: county.state,
  })

  // Fill lat/lon from geometry when missing
  fc = {
    type: 'FeatureCollection',
    features: fc.features.map((f) => {
      if (f.properties.lat != null && f.properties.lon != null) return f
      const c = centroidOf(f.geometry)
      if (!c) return f
      return {
        ...f,
        properties: { ...f.properties, lat: c.lat, lon: c.lon },
      }
    }),
  }

  const outPath = path.join(dir, 'normalized.geojson')
  fs.writeFileSync(outPath, JSON.stringify(fc))
  console.log(`[normalize] ${fc.features.length} features → ${outPath}`)
  if (!fc.features.length) {
    console.error('[normalize] zero features after normalization (check fieldMap / parcel ids)')
    process.exit(3)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
