#!/usr/bin/env node
/**
 * Parallel nationwide runner: N workers claim counties largest→smallest.
 *
 * Env:
 *   PARCEL_NATIONWIDE_WORKERS (default 10)
 *   PARCEL_TILE_CONCURRENCY (default 2) — tippecanoe slots
 *   PARCEL_UPLOAD_CONCURRENCY (recommend 8 when workers=10)
 *   PARCEL_NATIONWIDE_LIMIT / PARCEL_NATIONWIDE_START_RANK
 *   PARCEL_SKIP_DISCOVERY=1
 *   PARCEL_RETRY_FAILED=1
 *   PARCEL_DOWNLOAD_RESUME (default on)
 *   R2_* required
 */
import fs from 'fs'
import path from 'path'
import { spawn, spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import { ROOT, DATA_DIR } from './lib/paths.mjs'
import { getLocalCounty } from './lib/catalogLocal.mjs'
import { discoverArcgisSource } from './discover-arcgis-online.mjs'
import {
  claimNextCounty,
  updateCountyStatus,
  withOverlayLock,
  loadProgress,
} from './lib/nationwideProgress.mjs'
import { withTileSlot } from './lib/tileLock.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WORKER_MODE = process.argv.includes('--worker')
const WORKER_ID =
  process.env.PARCEL_WORKER_ID ||
  (process.argv.find((a) => a.startsWith('--worker-id=')) || '').split('=')[1] ||
  '0'

function ensureR2() {
  for (const k of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) {
    if (!process.env[k]) throw new Error(`Missing ${k}`)
  }
}

function runNode(script, args) {
  const scriptPath = path.join(__dirname, script)
  const r = spawnSync(process.execPath, [scriptPath, ...args], {
    stdio: 'inherit',
    env: process.env,
  })
  return r.status ?? 1
}

function cleanupCounty(fips) {
  const dir = path.join(DATA_DIR, fips)
  if (!fs.existsSync(dir)) return
  for (const f of ['raw.ndjson', 'normalized.ndjson', 'raw.geojson', 'normalized.geojson']) {
    const p = path.join(dir, f)
    if (fs.existsSync(p)) fs.unlinkSync(p)
  }
  const mb = path.join(dir, `${fips}.mbtiles`)
  if (fs.existsSync(mb)) {
    const free = Number(
      spawnSync('df', ['--output=avail', DATA_DIR], { encoding: 'utf8' }).stdout.trim().split('\n')[1] ||
        0,
    )
    if (free > 0 && free < 40 * 1024 * 1024) fs.unlinkSync(mb)
  }
}

async function resolveSource(county, rankEntry) {
  const local = getLocalCounty(county.fips)
  if (local?.source?.url && local.source.type !== 'none') {
    return { source: local.source, fieldMap: local.fieldMap }
  }
  if (process.env.PARCEL_SKIP_DISCOVERY === '1') return null
  console.log(
    `[w${WORKER_ID}] discovering source for ${rankEntry.name}, ${rankEntry.state} (${county.fips})`,
  )
  const found = await discoverArcgisSource({
    name: rankEntry.name.replace(/\s+County$/i, ''),
    state: rankEntry.state,
    fips: county.fips,
  })
  return found ? { source: found, fieldMap: found.fieldMap } : null
}

function writeRuntimeSource(fips, source, fieldMap) {
  const dir = path.join(DATA_DIR, fips)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'source.json'), JSON.stringify({ source, fieldMap }, null, 2))
}

async function writeOverlay(fips, source, fieldMap) {
  const overlayPath = path.join(ROOT, 'data/counties/sources.runtime.json')
  await withOverlayLock(() => {
    let overlay = { sources: {} }
    if (fs.existsSync(overlayPath)) overlay = JSON.parse(fs.readFileSync(overlayPath, 'utf8'))
    if (!overlay.sources) overlay.sources = {}
    overlay.sources[fips] = { ...source, fieldMap }
    const tmp = `${overlayPath}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(overlay))
    fs.renameSync(tmp, overlayPath)
  })
}

async function processClaimed(rankEntry, rankNum, total) {
  const fips = rankEntry.fips
  console.log(
    `\n======== [w${WORKER_ID}] RANK ${rankNum}/${total} pop=${rankEntry.population2023} ${fips} ${rankEntry.name}, ${rankEntry.state} ========`,
  )

  const catalogCounty = getLocalCounty(fips) || {
    fips,
    name: rankEntry.name.replace(/\s+County$/i, ''),
    state: '',
    fullName: rankEntry.name,
  }

  let resolved
  try {
    resolved = await resolveSource(catalogCounty, rankEntry)
  } catch (e) {
    resolved = null
    console.warn(`[w${WORKER_ID}] discover error`, e.message)
  }

  if (!resolved?.source?.url) {
    await updateCountyStatus(
      fips,
      {
        status: 'no_source',
        population2023: rankEntry.population2023,
        name: rankEntry.name,
        state: rankEntry.state,
        workerId: WORKER_ID,
      },
      { no_source: 1 },
    )
    console.log(`[w${WORKER_ID}] no_source ${fips} ${rankEntry.name}`)
    return 'no_source'
  }

  writeRuntimeSource(fips, resolved.source, resolved.fieldMap)
  await writeOverlay(fips, resolved.source, resolved.fieldMap)

  const steps = [
    ['download-county.mjs', [`--fips=${fips}`]],
    ['normalize-county.mjs', [`--fips=${fips}`]],
    ['tile-county.mjs', [`--fips=${fips}`], { tileSlot: true }],
    ['upload-county-tiles-parallel.mjs', [`--fips=${fips}`]],
  ]

  for (const [script, args, opts] of steps) {
    console.log(`\n[w${WORKER_ID}] ${fips} → ${script}`)
    const run = () => runNode(script, args)
    const code = opts?.tileSlot ? await withTileSlot(async () => run()) : run()
    if (code !== 0) {
      await updateCountyStatus(
        fips,
        {
          status: 'failed',
          population2023: rankEntry.population2023,
          name: rankEntry.name,
          state: rankEntry.state,
          error: `${script} exit ${code}`,
          source: resolved.source,
          workerId: WORKER_ID,
        },
        { failed: 1 },
      )
      cleanupCounty(fips)
      return 'failed'
    }
  }

  const uploadMetaPath = path.join(DATA_DIR, fips, 'upload-meta.json')
  const uploadMeta = fs.existsSync(uploadMetaPath)
    ? JSON.parse(fs.readFileSync(uploadMetaPath, 'utf8'))
    : {}

  await updateCountyStatus(
    fips,
    {
      status: 'complete',
      population2023: rankEntry.population2023,
      name: rankEntry.name,
      state: rankEntry.state,
      source: resolved.source,
      tileCount: uploadMeta.tileCount || uploadMeta.uploaded,
      workerId: WORKER_ID,
    },
    { complete: 1 },
  )
  cleanupCounty(fips)
  console.log(`[w${WORKER_ID}] complete ${fips} tiles=${uploadMeta.uploaded}`)
  return 'complete'
}

async function workerMain() {
  ensureR2()
  process.env.PARCEL_SOURCES_RUNTIME = path.join(ROOT, 'data/counties/sources.runtime.json')
  process.env.PARCEL_DOWNLOAD_RESUME = process.env.PARCEL_DOWNLOAD_RESUME || '1'

  const startRank = Math.max(1, Number(process.env.PARCEL_NATIONWIDE_START_RANK || 1))
  const limit = process.env.PARCEL_NATIONWIDE_LIMIT
    ? Number(process.env.PARCEL_NATIONWIDE_LIMIT)
    : Infinity

  console.log(`[w${WORKER_ID}] online startRank=${startRank} limit=${limit}`)

  while (true) {
    const claimed = await claimNextCounty({ workerId: WORKER_ID, startRank, limit })
    if (!claimed) {
      console.log(`[w${WORKER_ID}] no more counties — exiting`)
      break
    }
    try {
      await processClaimed(claimed.county, claimed.rankNum, claimed.total)
    } catch (e) {
      console.error(`[w${WORKER_ID}] unexpected`, e)
      await updateCountyStatus(
        claimed.county.fips,
        {
          status: 'failed',
          population2023: claimed.county.population2023,
          name: claimed.county.name,
          state: claimed.county.state,
          error: e.message,
          workerId: WORKER_ID,
        },
        { failed: 1 },
      )
    }
  }
}

function supervisorMain() {
  ensureR2()
  const workers = Math.max(1, Number(process.env.PARCEL_NATIONWIDE_WORKERS || 10))
  // Keep uploads reasonable under parallel load
  if (!process.env.PARCEL_UPLOAD_CONCURRENCY) {
    process.env.PARCEL_UPLOAD_CONCURRENCY = String(Math.max(4, Math.floor(80 / workers)))
  }
  if (!process.env.PARCEL_TILE_CONCURRENCY) {
    process.env.PARCEL_TILE_CONCURRENCY = '2'
  }

  const progress = loadProgress()
  console.log(
    `[nationwide-parallel] starting ${workers} workers bucket=${process.env.R2_BUCKET_NAME || 'parcel-tiles'}`,
  )
  console.log(
    `[nationwide-parallel] uploadConcurrency=${process.env.PARCEL_UPLOAD_CONCURRENCY} tileSlots=${process.env.PARCEL_TILE_CONCURRENCY}`,
  )
  console.log(`[nationwide-parallel] progress stats=`, progress.stats)

  const children = []
  const scriptPath = fileURLToPath(import.meta.url)
  let shuttingDown = false

  const shutdown = (signal) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[nationwide-parallel] ${signal} — stopping workers`)
    for (const c of children) {
      try {
        c.kill('SIGTERM')
      } catch {
        /* ignore */
      }
    }
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  for (let i = 1; i <= workers; i++) {
    const id = String(i)
    const child = spawn(process.execPath, [scriptPath, '--worker', `--worker-id=${id}`], {
      stdio: 'inherit',
      env: {
        ...process.env,
        PARCEL_WORKER_ID: id,
        PARCEL_SOURCES_RUNTIME: path.join(ROOT, 'data/counties/sources.runtime.json'),
        PARCEL_DOWNLOAD_RESUME: process.env.PARCEL_DOWNLOAD_RESUME || '1',
      },
    })
    child.on('exit', (code, signal) => {
      console.log(`[nationwide-parallel] worker ${id} exited code=${code} signal=${signal}`)
    })
    children.push(child)
  }

  Promise.all(
    children.map(
      (c) =>
        new Promise((resolve) => {
          c.on('exit', resolve)
        }),
    ),
  ).then(() => {
    const final = loadProgress()
    console.log('[nationwide-parallel] all workers done', final.stats)
    process.exit(0)
  })
}

if (WORKER_MODE) {
  workerMain().catch((e) => {
    console.error(e)
    process.exit(1)
  })
} else {
  supervisorMain()
}
