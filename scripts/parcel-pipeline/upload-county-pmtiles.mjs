#!/usr/bin/env node
/**
 * Convert county MBTiles → PMTiles (if needed) and upload one archive to R2.
 * Updates owned/pmtiles/manifest.json with bounds for /api/tiles lookup.
 */
import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { parseArgs, countyWorkDir, DATA_DIR, ROOT } from './lib/paths.mjs'
import { putObjectFile, getObjectBuffer, putObjectBuffer } from './lib/r2.mjs'
import {
  OWNED_PMTILES_PREFIX,
  OWNED_PMTILES_MANIFEST_KEY,
  PARCEL_SOURCE_LAYER,
  PARCEL_MIN_ZOOM,
  PARCEL_MAX_ZOOM,
} from '../../api/_lib/parcelPipeline/constants.js'

function pmtilesBin() {
  const r = spawnSync('pmtiles', ['--help'], { encoding: 'utf8' })
  return r.status === 0 ? 'pmtiles' : null
}

function convertMbtiles(mbtiles, pmtilesPath) {
  const bin = pmtilesBin()
  if (!bin) throw new Error('pmtiles CLI not found — install go-pmtiles')
  if (fs.existsSync(pmtilesPath)) fs.unlinkSync(pmtilesPath)
  // tippecanoe may leave a -journal; convert from a clean copy to avoid readonly SQLite errors
  const journal = `${mbtiles}-journal`
  let input = mbtiles
  let tmpCopy = null
  if (fs.existsSync(journal)) {
    tmpCopy = `${pmtilesPath}.src.mbtiles`
    fs.copyFileSync(mbtiles, tmpCopy)
    input = tmpCopy
    console.warn(`[pmtiles] mbtiles journal present — converting from copy ${tmpCopy}`)
  }
  console.log(`[pmtiles] convert ${input} → ${pmtilesPath}`)
  const r = spawnSync(bin, ['convert', input, pmtilesPath], { stdio: 'inherit' })
  if (tmpCopy) {
    try {
      fs.unlinkSync(tmpCopy)
    } catch {
      /* ignore */
    }
  }
  if (r.status !== 0) throw new Error(`pmtiles convert failed exit ${r.status}`)
}

function readBounds(pmtilesPath) {
  const bin = pmtilesBin()
  const r = spawnSync(bin, ['show', pmtilesPath], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(r.stderr || 'pmtiles show failed')
  const out = r.stdout || ''
  // bounds: (long: -112.228605, lat: 40.414340) (long: -111.553166, lat: 40.921845)
  const m = out.match(
    /bounds:\s*\(long:\s*([-\d.]+),\s*lat:\s*([-\d.]+)\)\s*\(long:\s*([-\d.]+),\s*lat:\s*([-\d.]+)\)/i,
  )
  if (!m) throw new Error('could not parse pmtiles bounds')
  const west = Number(m[1])
  const south = Number(m[2])
  const east = Number(m[3])
  const north = Number(m[4])
  const addressed = Number((out.match(/addressed tiles count:\s*(\d+)/i) || [])[1] || 0)
  return {
    bounds: [west, south, east, north],
    tileCount: addressed,
  }
}

async function updateManifest(fips, entry) {
  const lockDir = path.join(DATA_DIR, '.pmtiles-manifest.lock')
  const started = Date.now()
  while (true) {
    try {
      fs.mkdirSync(lockDir)
      break
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      if (Date.now() - started > 120_000) throw new Error('pmtiles manifest lock timeout')
      await new Promise((r) => setTimeout(r, 50 + Math.floor(Math.random() * 50)))
    }
  }
  try {
    let manifest = { version: 1, updatedAt: null, counties: {} }
    const existing = await getObjectBuffer(OWNED_PMTILES_MANIFEST_KEY)
    if (existing) {
      try {
        manifest = JSON.parse(existing.toString('utf8'))
      } catch {
        /* replace */
      }
    }
    if (!manifest.counties) manifest.counties = {}
    manifest.counties[fips] = entry
    manifest.updatedAt = new Date().toISOString()
    manifest.count = Object.keys(manifest.counties).length
    await putObjectBuffer(
      OWNED_PMTILES_MANIFEST_KEY,
      Buffer.from(JSON.stringify(manifest, null, 2)),
      'application/json',
    )
    // Local mirror for ops
    const local = path.join(ROOT, 'data/counties/pmtiles-manifest.runtime.json')
    fs.mkdirSync(path.dirname(local), { recursive: true })
    fs.writeFileSync(local, JSON.stringify(manifest, null, 2))
    return manifest
  } finally {
    try {
      fs.rmdirSync(lockDir)
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  const args = parseArgs()
  const fips = String(args.fips || '').padStart(5, '0')
  if (!fips || fips === '00000') {
    console.error('Usage: upload-county-pmtiles.mjs --fips=48439')
    process.exit(1)
  }

  const dir = countyWorkDir(fips)
  const mbtiles = path.join(dir, `${fips}.mbtiles`)
  const pmtilesPath = path.join(dir, `${fips}.pmtiles`)

  if (!fs.existsSync(pmtilesPath)) {
    if (!fs.existsSync(mbtiles)) throw new Error(`Missing ${mbtiles} and ${pmtilesPath}`)
    convertMbtiles(mbtiles, pmtilesPath)
  }

  const { bounds, tileCount } = readBounds(pmtilesPath)
  const bytes = fs.statSync(pmtilesPath).size
  const key = `${OWNED_PMTILES_PREFIX}/${fips}.pmtiles`

  console.log(`[pmtiles] upload ${pmtilesPath} (${bytes} bytes) → r2://${key}`)
  await putObjectFile(key, pmtilesPath, 'application/vnd.pmtiles')

  const entry = {
    fips,
    key,
    bounds,
    bytes,
    tileCount,
    layer: PARCEL_SOURCE_LAYER,
    minzoom: PARCEL_MIN_ZOOM,
    maxzoom: PARCEL_MAX_ZOOM,
    uploadedAt: new Date().toISOString(),
  }

  const manifest = await updateManifest(fips, entry)
  fs.writeFileSync(path.join(dir, 'upload-meta.json'), JSON.stringify({ ...entry, format: 'pmtiles' }, null, 2))
  fs.writeFileSync(
    path.join(dir, 'tile-meta.json'),
    JSON.stringify(
      {
        fips,
        mbtiles: fs.existsSync(mbtiles) ? mbtiles : undefined,
        pmtiles: pmtilesPath,
        bytes,
        layer: PARCEL_SOURCE_LAYER,
        minzoom: PARCEL_MIN_ZOOM,
        maxzoom: PARCEL_MAX_ZOOM,
        tiledAt: new Date().toISOString(),
        bounds,
        tileCount,
      },
      null,
      2,
    ),
  )

  console.log('[pmtiles] done', { fips, tileCount, bytes, countiesInManifest: manifest.count })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
