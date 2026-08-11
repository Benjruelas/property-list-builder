#!/usr/bin/env node
/**
 * Convert normalized GeoJSON → MBTiles with tippecanoe (layer parcel_us, z15–16).
 */
import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { parseArgs, countyWorkDir } from './lib/paths.mjs'
import {
  PARCEL_SOURCE_LAYER,
  PARCEL_MIN_ZOOM,
  PARCEL_MAX_ZOOM,
} from '../../api/_lib/parcelPipeline/constants.js'

function tippecanoeAvailable() {
  const r = spawnSync('tippecanoe', ['--version'], { encoding: 'utf8' })
  return r.status === 0
}

async function main() {
  const args = parseArgs()
  const fips = String(args.fips || args._[0] || '').padStart(5, '0')
  if (!fips || fips === '00000') {
    console.error('Usage: tile-county.mjs --fips=48439')
    process.exit(1)
  }
  if (!tippecanoeAvailable()) {
    console.error('tippecanoe not found. Install: https://github.com/felt/tippecanoe')
    process.exit(1)
  }

  const dir = countyWorkDir(fips)
  const ndjson = path.join(dir, 'normalized.ndjson')
  const geojson = path.join(dir, 'normalized.geojson')
  const input = fs.existsSync(ndjson) ? ndjson : geojson
  if (!fs.existsSync(input)) {
    console.error(`Missing ${ndjson} — run normalize-county first`)
    process.exit(1)
  }

  const mbtiles = path.join(dir, `${fips}.mbtiles`)
  if (fs.existsSync(mbtiles)) fs.unlinkSync(mbtiles)

  const cmd = [
    'tippecanoe',
    '--output',
    mbtiles,
    '--force',
    `--layer=${PARCEL_SOURCE_LAYER}`,
    `--minimum-zoom=${PARCEL_MIN_ZOOM}`,
    `--maximum-zoom=${PARCEL_MAX_ZOOM}`,
    '--drop-densest-as-needed',
    '--extend-zooms-if-still-dropping',
    '--no-feature-limit',
    '--no-tile-size-limit',
    '--read-parallel',
    input,
  ]

  console.log('[tile]', cmd.join(' '))
  const r = spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit' })
  if (r.status !== 0) {
    console.error('tippecanoe failed')
    process.exit(r.status || 1)
  }

  const stat = fs.statSync(mbtiles)
  const pmtilesPath = path.join(dir, `${fips}.pmtiles`)
  // Prefer PMTiles for one-shot R2 upload (owned/pmtiles/{fips}.pmtiles)
  const hasPmtilesCli = spawnSync('pmtiles', ['--help'], { encoding: 'utf8' }).status === 0
  if (hasPmtilesCli) {
    if (fs.existsSync(pmtilesPath)) fs.unlinkSync(pmtilesPath)
    console.log(`[tile] pmtiles convert → ${pmtilesPath}`)
    const c = spawnSync('pmtiles', ['convert', mbtiles, pmtilesPath], { stdio: 'inherit' })
    if (c.status !== 0) {
      console.error('pmtiles convert failed')
      process.exit(c.status || 1)
    }
  } else {
    console.warn('[tile] pmtiles CLI missing — upload step will require it')
  }

  fs.writeFileSync(
    path.join(dir, 'tile-meta.json'),
    JSON.stringify(
      {
        fips,
        mbtiles,
        pmtiles: fs.existsSync(pmtilesPath) ? pmtilesPath : undefined,
        bytes: fs.existsSync(pmtilesPath) ? fs.statSync(pmtilesPath).size : stat.size,
        layer: PARCEL_SOURCE_LAYER,
        minzoom: PARCEL_MIN_ZOOM,
        maxzoom: PARCEL_MAX_ZOOM,
        tiledAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  )
  console.log(
    `[tile] wrote ${mbtiles} (${stat.size} bytes)` +
      (fs.existsSync(pmtilesPath) ? ` + ${pmtilesPath} (${fs.statSync(pmtilesPath).size} bytes)` : ''),
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
