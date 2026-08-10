#!/usr/bin/env node
/**
 * Parallel R2 upload of county MBTiles → owned/tiles (no merge; first fill).
 * Streams tiles from sqlite via python (no giant spawnSync buffer).
 */
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { spawn } from 'child_process'
import { parseArgs, countyWorkDir } from './lib/paths.mjs'
import { putObjectBuffer } from './lib/r2.mjs'
import { OWNED_TILE_PREFIX } from '../../api/_lib/parcelPipeline/constants.js'

const CONCURRENCY = Math.max(1, Number(process.env.PARCEL_UPLOAD_CONCURRENCY || 8))
const PUT_TIMEOUT_MS = Math.max(5_000, Number(process.env.PARCEL_UPLOAD_PUT_TIMEOUT_MS || 60_000))
const HEARTBEAT_EVERY = Math.max(100, Number(process.env.PARCEL_UPLOAD_HEARTBEAT_EVERY || 500))

function tmsToXyz(z, x, tmsY) {
  return { z, x, y: (1 << z) - 1 - tmsY }
}

function countTiles(mbtilesPath) {
  const r = spawn(
    'python3',
    [
      '-c',
      'import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); print(c.execute("select count(*) from tiles").fetchone()[0])',
      mbtilesPath,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  return new Promise((resolve, reject) => {
    let out = ''
    let err = ''
    r.stdout.on('data', (d) => (out += d))
    r.stderr.on('data', (d) => (err += d))
    r.on('close', (code) => {
      if (code !== 0) reject(new Error(err || `count failed exit ${code}`))
      else resolve(Number(out.trim()) || 0)
    })
  })
}

/** Async generator yielding {z,x,y,data} without buffering the whole county. */
async function* iterateTiles(mbtilesPath) {
  const py = `
import sqlite3, sys, json, base64
con = sqlite3.connect(sys.argv[1])
cur = con.cursor()
cur.execute("SELECT zoom_level, tile_column, tile_row, tile_data FROM tiles")
for z,x,tms_y,data in cur:
    print(json.dumps({"z":z,"x":x,"tmsY":tms_y,"b64":base64.b64encode(data).decode("ascii")}), flush=True)
`
  const child = spawn('python3', ['-c', py, mbtilesPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr.on('data', (d) => {
    stderr += d.toString()
  })
  const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity })
  try {
    for await (const line of rl) {
      if (!line.trim()) continue
      const row = JSON.parse(line)
      const { z, x, y } = tmsToXyz(row.z, row.x, row.tmsY)
      yield { z, x, y, data: Buffer.from(row.b64, 'base64') }
    }
  } finally {
    rl.close()
  }
  const code = await new Promise((resolve) => child.on('close', resolve))
  if (code !== 0) throw new Error(stderr || `extract failed exit ${code}`)
}

function writeHeartbeat(dir, meta) {
  const p = path.join(dir, 'upload-progress.json')
  fs.writeFileSync(p, JSON.stringify({ ...meta, updatedAt: new Date().toISOString() }))
}

async function putWithTimeout(key, data) {
  await putObjectBuffer(key, data, 'application/x-protobuf', {
    abortSignal: AbortSignal.timeout(PUT_TIMEOUT_MS),
  })
}

async function main() {
  const args = parseArgs()
  const fips = String(args.fips || '').padStart(5, '0')
  if (!fips || fips === '00000') {
    console.error('Usage: upload-county-tiles-parallel.mjs --fips=48439')
    process.exit(1)
  }
  const dir = countyWorkDir(fips)
  const mbtiles = path.join(dir, `${fips}.mbtiles`)
  if (!fs.existsSync(mbtiles)) throw new Error(`Missing ${mbtiles}`)

  const tileCount = await countTiles(mbtiles)
  console.log(`[upload] ${mbtiles} tiles=${tileCount} concurrency=${CONCURRENCY}`)

  const queue = []
  let extractDone = false
  let extractError = null
  let uploaded = 0
  let errors = 0
  let enqueued = 0
  const started = Date.now()

  const wakeWaiters = []
  const wake = () => {
    while (wakeWaiters.length) wakeWaiters.shift()()
  }
  const waitForWork = () =>
    new Promise((resolve) => {
      if (queue.length || extractDone) resolve()
      else wakeWaiters.push(resolve)
    })

  const extractor = (async () => {
    try {
      for await (const tile of iterateTiles(mbtiles)) {
        // Bound memory: don't get too far ahead of uploaders
        while (queue.length >= CONCURRENCY * 4) {
          await new Promise((r) => setTimeout(r, 25))
        }
        queue.push(tile)
        enqueued++
        wake()
      }
    } catch (e) {
      extractError = e
    } finally {
      extractDone = true
      wake()
    }
  })()

  async function worker() {
    while (true) {
      if (!queue.length) {
        if (extractDone) return
        await waitForWork()
        continue
      }
      const t = queue.shift()
      if (!t) continue
      const key = `${OWNED_TILE_PREFIX}/${t.z}/${t.x}/${t.y}.pbf`
      let ok = false
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await putWithTimeout(key, t.data)
          uploaded++
          ok = true
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
      if (ok && uploaded % HEARTBEAT_EVERY === 0) {
        const elapsed = ((Date.now() - started) / 1000).toFixed(0)
        console.log(`[upload] ${uploaded}/${tileCount} (errors=${errors}) ${elapsed}s`)
        writeHeartbeat(dir, { fips, uploaded, errors, tileCount, enqueued })
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
  await extractor
  if (extractError) throw extractError

  const meta = {
    fips,
    tileCount,
    uploaded,
    errors,
    prefix: OWNED_TILE_PREFIX,
    uploadedAt: new Date().toISOString(),
    parallel: CONCURRENCY,
  }
  fs.writeFileSync(path.join(dir, 'upload-meta.json'), JSON.stringify(meta, null, 2))
  try {
    fs.unlinkSync(path.join(dir, 'upload-progress.json'))
  } catch {
    /* ignore */
  }
  console.log('[upload] done', meta)
  if (errors) process.exit(2)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
