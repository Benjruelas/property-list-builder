#!/usr/bin/env node
/**
 * Upload county MBTiles to R2 through the deployed /api/parcel-pipeline/upload-tile
 * endpoint (uses the deployment's R2 credentials).
 *
 * Usage:
 *   PARCEL_PIPELINE_API_BASE=https://….vercel.app \
 *   PARCEL_PIPELINE_SECRET=… \
 *   node scripts/parcel-pipeline/upload-via-api.mjs --fips=48439
 */
import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { parseArgs, countyWorkDir } from './lib/paths.mjs'
import { OWNED_TILE_PREFIX } from '../../api/_lib/parcelPipeline/constants.js'

const CONCURRENCY = Number(process.env.PARCEL_UPLOAD_CONCURRENCY || 12)
const BATCH = Number(process.env.PARCEL_UPLOAD_BATCH || 40)

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
  if (r.status !== 0) throw new Error(r.stderr || 'sqlite extract failed')
  const tiles = []
  for (const line of r.stdout.split('\n')) {
    if (!line.trim()) continue
    const row = JSON.parse(line)
    const { z, x, y } = tmsToXyz(row.z, row.x, row.tmsY)
    tiles.push({ z, x, y, pbfBase64: row.b64 })
  }
  return tiles
}

async function postBatch(base, secret, batch) {
  const res = await fetch(`${base}/api/parcel-pipeline/upload-tile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
      'X-Parcel-Pipeline-Secret': secret,
    },
    body: JSON.stringify({ tiles: batch }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `upload failed ${res.status}`)
  return data
}

async function main() {
  const args = parseArgs()
  const fips = String(args.fips || '').padStart(5, '0')
  const base = (process.env.PARCEL_PIPELINE_API_BASE || '').replace(/\/$/, '')
  const secret = process.env.PARCEL_PIPELINE_SECRET || process.env.CRON_SECRET

  if (!fips || fips === '00000' || !base || !secret) {
    console.error(
      'Usage: PARCEL_PIPELINE_API_BASE=https://… PARCEL_PIPELINE_SECRET=… upload-via-api.mjs --fips=48439',
    )
    process.exit(1)
  }

  const mbtiles = path.join(countyWorkDir(fips), `${fips}.mbtiles`)
  if (!fs.existsSync(mbtiles)) {
    console.error(`Missing ${mbtiles}`)
    process.exit(1)
  }

  console.log(`[upload-api] extracting tiles from ${mbtiles}`)
  const tiles = loadTiles(mbtiles)
  console.log(`[upload-api] ${tiles.length} tiles → ${base} (${OWNED_TILE_PREFIX})`)

  let uploaded = 0
  let i = 0
  async function worker() {
    while (i < tiles.length) {
      const start = i
      i += BATCH
      const batch = tiles.slice(start, start + BATCH)
      if (!batch.length) return
      let attempt = 0
      for (;;) {
        try {
          await postBatch(base, secret, batch)
          break
        } catch (e) {
          attempt++
          if (attempt >= 5) throw e
          const wait = Math.min(1000 * 2 ** attempt, 15000)
          console.warn(`[upload-api] retry ${attempt} after error: ${e.message}`)
          await new Promise((r) => setTimeout(r, wait))
        }
      }
      uploaded += batch.length
      if (uploaded % 500 < BATCH || uploaded >= tiles.length) {
        console.log(`[upload-api] ${uploaded}/${tiles.length}`)
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))

  const meta = {
    fips,
    tileCount: tiles.length,
    uploaded,
    via: base,
    prefix: OWNED_TILE_PREFIX,
    uploadedAt: new Date().toISOString(),
  }
  fs.writeFileSync(path.join(countyWorkDir(fips), 'upload-meta.json'), JSON.stringify(meta, null, 2))
  console.log('[upload-api] done', meta)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
