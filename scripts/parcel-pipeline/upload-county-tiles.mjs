#!/usr/bin/env node
/**
 * Extract XYZ PBF tiles from county MBTiles and upload to R2 owned/tiles/,
 * merging with any existing owned tile at the same z/x/y.
 */
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { parseArgs, countyWorkDir } from './lib/paths.mjs'
import { getObjectBuffer, putObjectBuffer } from './lib/r2.mjs'
import { mergeOwnedTile } from './lib/mvtMerge.mjs'
import { OWNED_TILE_PREFIX } from '../../api/_lib/parcelPipeline/constants.js'

const require = createRequire(import.meta.url)

function openMbtiles(mbtilesPath) {
  let Database
  try {
    Database = require('better-sqlite3')
  } catch {
    try {
      Database = require('sqlite3').verbose().Database
    } catch {
      Database = null
    }
  }

  if (Database && Database.name !== 'Database') {
    // better-sqlite3 sync API
    const db = new Database(mbtilesPath, { readonly: true })
    return {
      type: 'better-sqlite3',
      all(sql) {
        return db.prepare(sql).all()
      },
      close() {
        db.close()
      },
    }
  }

  // Fallback: use sqlite3 CLI
  return { type: 'cli', path: mbtilesPath }
}

function tmsToXyz(z, x, tmsY) {
  const xyzY = (1 << z) - 1 - tmsY
  return { z, x, y: xyzY }
}

async function readTilesViaSqliteCli(mbtilesPath) {
  const { spawnSync } = await import('child_process')
  const sql = 'SELECT zoom_level, tile_column, tile_row, tile_data FROM tiles;'
  // Use python for reliable blob extract
  const py = `
import sqlite3, sys, json, base64
con = sqlite3.connect(sys.argv[1])
cur = con.cursor()
cur.execute("SELECT zoom_level, tile_column, tile_row, tile_data FROM tiles")
for z,x,tms_y,data in cur:
    print(json.dumps({"z":z,"x":x,"tmsY":tms_y,"b64":base64.b64encode(data).decode("ascii")}))
`
  const r = spawnSync('python3', ['-c', py, mbtilesPath], {
    maxBuffer: 1024 * 1024 * 512,
    encoding: 'utf8',
  })
  if (r.status !== 0) {
    throw new Error(`sqlite extract failed: ${r.stderr || r.stdout}`)
  }
  const tiles = []
  for (const line of r.stdout.split('\n')) {
    if (!line.trim()) continue
    const row = JSON.parse(line)
    tiles.push({
      z: row.z,
      x: row.x,
      tmsY: row.tmsY,
      data: Buffer.from(row.b64, 'base64'),
    })
  }
  return tiles
}

async function loadTiles(mbtilesPath) {
  const handle = openMbtiles(mbtilesPath)
  if (handle.type === 'better-sqlite3') {
    const rows = handle.all('SELECT zoom_level AS z, tile_column AS x, tile_row AS tmsY, tile_data AS data FROM tiles')
    handle.close()
    return rows.map((r) => ({
      z: r.z,
      x: r.x,
      tmsY: r.tmsY,
      data: Buffer.isBuffer(r.data) ? r.data : Buffer.from(r.data),
    }))
  }
  return readTilesViaSqliteCli(mbtilesPath)
}

async function main() {
  const args = parseArgs()
  const fips = String(args.fips || args._[0] || '').padStart(5, '0')
  const dryRun = Boolean(args['dry-run'])
  if (!fips || fips === '00000') {
    console.error('Usage: upload-county-tiles.mjs --fips=48439 [--dry-run]')
    process.exit(1)
  }

  const dir = countyWorkDir(fips)
  const mbtiles = path.join(dir, `${fips}.mbtiles`)
  if (!fs.existsSync(mbtiles)) {
    console.error(`Missing ${mbtiles} — run tile-county first`)
    process.exit(1)
  }

  console.log(`[upload] reading tiles from ${mbtiles}`)
  const tiles = await loadTiles(mbtiles)
  console.log(`[upload] ${tiles.length} tiles`)

  let uploaded = 0
  let merged = 0
  for (const t of tiles) {
    const { z, x, y } = tmsToXyz(t.z, t.x, t.tmsY)
    const key = `${OWNED_TILE_PREFIX}/${z}/${x}/${y}.pbf`
    let body = t.data

    if (!dryRun) {
      const existing = await getObjectBuffer(key)
      if (existing?.length) {
        body = mergeOwnedTile(existing, t.data, z, x, y)
        merged++
      }
      await putObjectBuffer(key, body)
    }
    uploaded++
    if (uploaded % 100 === 0) console.log(`[upload] progress ${uploaded}/${tiles.length}`)
  }

  const meta = {
    fips,
    tileCount: tiles.length,
    uploaded,
    merged,
    prefix: OWNED_TILE_PREFIX,
    uploadedAt: new Date().toISOString(),
    dryRun,
  }
  fs.writeFileSync(path.join(dir, 'upload-meta.json'), JSON.stringify(meta, null, 2))
  console.log(`[upload] done`, meta)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
