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
  const input = path.join(dir, 'normalized.geojson')
  if (!fs.existsSync(input)) {
    console.error(`Missing ${input} — run normalize-county first`)
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
  fs.writeFileSync(
    path.join(dir, 'tile-meta.json'),
    JSON.stringify(
      {
        fips,
        mbtiles,
        bytes: stat.size,
        layer: PARCEL_SOURCE_LAYER,
        minzoom: PARCEL_MIN_ZOOM,
        maxzoom: PARCEL_MAX_ZOOM,
        tiledAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  )
  console.log(`[tile] wrote ${mbtiles} (${stat.size} bytes)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
