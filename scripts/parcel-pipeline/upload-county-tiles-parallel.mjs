#!/usr/bin/env node
/**
 * Parallel R2 upload of county MBTiles → owned/tiles (no merge; first fill).
 */
import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { parseArgs, countyWorkDir } from './lib/paths.mjs'
import { putObjectBuffer } from './lib/r2.mjs'
import { OWNED_TILE_PREFIX } from '../../api/_lib/parcelPipeline/constants.js'

const CONCURRENCY = Number(process.env.PARCEL_UPLOAD_CONCURRENCY || 32)

function tmsToXyz(z, x, tmsY) {
  return { z, x, y: (1 << z) - 1 - tmsY }
}

function loadTiles(mbtilesPath) {
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
  if (r.status !== 0) throw new Error(r.stderr || 'extract failed')
  const tiles = []
  for (const line of r.stdout.split('\n')) {
    if (!line.trim()) continue
    const row = JSON.parse(line)
    const { z, x, y } = tmsToXyz(row.z, row.x, row.tmsY)
    tiles.push({ z, x, y, data: Buffer.from(row.b64, 'base64') })
  }
  return tiles
}

async function main() {
  const args = parseArgs()
  const fips = String(args.fips || '').padStart(5, '0')
  if (!fips || fips === '00000') {
    console.error('Usage: upload-county-tiles-parallel.mjs --fips=48439')
    process.exit(1)
  }
  const mbtiles = path.join(countyWorkDir(fips), `${fips}.mbtiles`)
  if (!fs.existsSync(mbtiles)) throw new Error(`Missing ${mbtiles}`)

  console.log(`[upload] extract ${mbtiles}`)
  const tiles = loadTiles(mbtiles)
  console.log(`[upload] ${tiles.length} tiles, concurrency=${CONCURRENCY}`)

  let i = 0
  let uploaded = 0
  let errors = 0

  async function worker() {
    while (true) {
      const idx = i++
      if (idx >= tiles.length) return
      const t = tiles[idx]
      const key = `${OWNED_TILE_PREFIX}/${t.z}/${t.x}/${t.y}.pbf`
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await putObjectBuffer(key, t.data)
          uploaded++
          break
        } catch (e) {
          if (attempt === 4) {
            errors++
            console.error(`[upload] fail ${key}: ${e.message}`)
          } else {
            await new Promise((r) => setTimeout(r, 250 * 2 ** attempt))
          }
        }
      }
      if (uploaded % 1000 === 0) console.log(`[upload] ${uploaded}/${tiles.length} (errors=${errors})`)
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
  const meta = {
    fips,
    tileCount: tiles.length,
    uploaded,
    errors,
    prefix: OWNED_TILE_PREFIX,
    uploadedAt: new Date().toISOString(),
    parallel: CONCURRENCY,
  }
  fs.writeFileSync(path.join(countyWorkDir(fips), 'upload-meta.json'), JSON.stringify(meta, null, 2))
  console.log('[upload] done', meta)
  if (errors) process.exit(2)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
