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
import { getLocalCounty, getSeededCounty } from './lib/catalogLocal.mjs'
import { discoverArcgisSource } from './discover-arcgis-online.mjs'
import {
  claimNextCounty,
  updateCountyStatus,
  withOverlayLock,
  loadProgress,
} from './lib/nationwideProgress.mjs'
import { withTileSlot, clearDeadTileSlots } from './lib/tileLock.mjs'
import { validateDownloadedCount, validateParcelLayer } from './lib/sourceValidation.mjs'

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

function cleanupCounty(fips, { keepRaw = false } = {}) {
  const dir = path.join(DATA_DIR, fips)
  if (!fs.existsSync(dir)) return
  const remove = keepRaw
    ? ['normalized.ndjson', 'raw.geojson', 'normalized.geojson']
    : ['raw.ndjson', 'normalized.ndjson', 'raw.geojson', 'normalized.geojson']
  for (const f of remove) {
    const p = path.join(dir, f)
    if (fs.existsSync(p)) fs.unlinkSync(p)
  }
  const mb = path.join(dir, `${fips}.mbtiles`)
  if (fs.existsSync(mb) && !keepRaw) {
    const free = Number(
      spawnSync('df', ['--output=avail', DATA_DIR], { encoding: 'utf8' }).stdout.trim().split('\n')[1] ||
        0,
    )
    if (free > 0 && free < 40 * 1024 * 1024) fs.unlinkSync(mb)
  }
}

async function resolveSource(county, rankEntry) {
  const pop = rankEntry.population2023
  // Prefer curated seed over poisoned runtime/discovery overlays.
  const seeded = getSeededCounty(county.fips)
  if (seeded?.source?.url && seeded.source.type !== 'none') {
    const v = await validateParcelLayer(seeded.source.url, {
      population2023: pop,
      title: seeded.source.licenseNote || seeded.source.url,
      where: seeded.source.where || '1=1',
    })
    if (v.ok) {
      console.log(
        `[w${WORKER_ID}] seed source ok ${county.fips} count=${v.count} (min=${v.minRequired})`,
      )
      return { source: seeded.source, fieldMap: seeded.fieldMap, featureCount: v.count }
    }
    console.warn(
      `[w${WORKER_ID}] seed source rejected ${county.fips}: ${v.reason} — trying local/discovery`,
    )
  }

  const local = getLocalCounty(county.fips)
  const localIsSeed =
    local?.source?.url && seeded?.source?.url && local.source.url === seeded.source.url
  if (local?.source?.url && local.source.type !== 'none' && !localIsSeed) {
    const v = await validateParcelLayer(local.source.url, {
      population2023: pop,
      title: local.source.licenseNote || local.source.url,
      where: local.source.where || '1=1',
    })
    if (v.ok) {
      console.log(
        `[w${WORKER_ID}] runtime source ok ${county.fips} count=${v.count} (min=${v.minRequired})`,
      )
      return { source: local.source, fieldMap: local.fieldMap, featureCount: v.count }
    }
    console.warn(
      `[w${WORKER_ID}] runtime source rejected ${county.fips}: ${v.reason} — trying discovery`,
    )
  }

  if (process.env.PARCEL_SKIP_DISCOVERY === '1') return null
  console.log(
    `[w${WORKER_ID}] discovering source for ${rankEntry.name}, ${rankEntry.state} (${county.fips})`,
  )
  const found = await discoverArcgisSource({
    name: rankEntry.name.replace(/\s+County$/i, ''),
    state: rankEntry.state,
    fips: county.fips,
    population2023: pop,
  })
  return found ? { source: found, fieldMap: found.fieldMap, featureCount: found.featureCount } : null
}

/** Skip completed stages when reclaiming tile/upload failures. */
function detectResumeStage(fips) {
  const dir = path.join(DATA_DIR, fips)
  const mb = path.join(dir, `${fips}.mbtiles`)
  const tileMeta = path.join(dir, 'tile-meta.json')
  const normalized = path.join(dir, 'normalized.ndjson')
  const raw = path.join(dir, 'raw.ndjson')
  try {
    if (fs.existsSync(mb) && fs.existsSync(tileMeta) && fs.statSync(mb).size > 10_000) {
      return 'upload'
    }
    if (fs.existsSync(normalized) && fs.statSync(normalized).size > 0) return 'tile'
    if (fs.existsSync(raw) && fs.statSync(raw).size > 0) return 'normalize'
  } catch {
    /* fall through */
  }
  return 'download'
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

  // Capture prior source URL before we overwrite source.json / runtime overlay.
  const prevMetaPath = path.join(DATA_DIR, fips, 'download-meta.json')
  const prevSourcePath = path.join(DATA_DIR, fips, 'source.json')
  let prevUrl = null
  try {
    if (fs.existsSync(prevMetaPath)) {
      prevUrl = JSON.parse(fs.readFileSync(prevMetaPath, 'utf8'))?.source?.url || null
    }
  } catch {
    /* ignore */
  }
  if (!prevUrl && fs.existsSync(prevSourcePath)) {
    try {
      prevUrl = JSON.parse(fs.readFileSync(prevSourcePath, 'utf8'))?.source?.url || null
    } catch {
      /* ignore */
    }
  }

  writeRuntimeSource(fips, resolved.source, resolved.fieldMap)
  await writeOverlay(fips, resolved.source, resolved.fieldMap)

  // If curated/resolved source changed, discard stale downloads/tiles from a bad layer.
  let resumeFrom = detectResumeStage(fips)
  if (resumeFrom !== 'download' && prevUrl && prevUrl !== resolved.source.url) {
    console.warn(
      `[w${WORKER_ID}] ${fips} source changed (${prevUrl} → ${resolved.source.url}) — discarding stale artifacts`,
    )
    cleanupCounty(fips) // drop raw/normalized
    const mb = path.join(DATA_DIR, fips, `${fips}.mbtiles`)
    for (const f of [mb, path.join(DATA_DIR, fips, 'tile-meta.json'), path.join(DATA_DIR, fips, 'upload-meta.json')]) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f)
      } catch {
        /* ignore */
      }
    }
    resumeFrom = 'download'
  } else if (resumeFrom !== 'download') {
    console.log(`[w${WORKER_ID}] ${fips} resuming from ${resumeFrom} (artifacts present)`)
  }

  const allSteps = [
    ['download-county.mjs', [`--fips=${fips}`], { stage: 'download' }],
    ['normalize-county.mjs', [`--fips=${fips}`], { stage: 'normalize' }],
    ['tile-county.mjs', [`--fips=${fips}`], { stage: 'tile', tileSlot: true }],
    ['upload-county-tiles-parallel.mjs', [`--fips=${fips}`], { stage: 'upload' }],
  ]
  const stageOrder = ['download', 'normalize', 'tile', 'upload']
  const startIdx = stageOrder.indexOf(resumeFrom)
  const steps = allSteps.slice(Math.max(0, startIdx))

  for (const [script, args, opts] of steps) {
    console.log(`\n[w${WORKER_ID}] ${fips} → ${script}`)
    const run = () => runNode(script, args)
    let code
    try {
      code = opts?.tileSlot ? await withTileSlot(async () => run()) : run()
    } catch (e) {
      // e.g. tile slot lock timeout — keep download artifacts for reclaim
      await updateCountyStatus(
        fips,
        {
          status: 'failed',
          population2023: rankEntry.population2023,
          name: rankEntry.name,
          state: rankEntry.state,
          error: e.message || String(e),
          source: resolved.source,
          workerId: WORKER_ID,
        },
        { failed: 1 },
      )
      cleanupCounty(fips, { keepRaw: true })
      return 'failed'
    }
    if (code !== 0) {
      const keepRaw = opts?.stage !== 'download' || script === 'download-county.mjs'
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
      // Keep raw on download fail (resume) and on later-stage fails (re-tile/upload).
      cleanupCounty(fips, { keepRaw: true })
      return 'failed'
    }

    // After download, refuse thin/wrong layers before spending tippecanoe/R2 time
    if (script === 'download-county.mjs') {
      const metaPath = path.join(DATA_DIR, fips, 'download-meta.json')
      const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {}
      const check = validateDownloadedCount(meta.featureCount, rankEntry.population2023)
      if (!check.ok) {
        console.error(`[w${WORKER_ID}] ${fips} thin download rejected: ${check.reason}`)
        await updateCountyStatus(
          fips,
          {
            status: 'failed',
            population2023: rankEntry.population2023,
            name: rankEntry.name,
            state: rankEntry.state,
            error: `thin_source: ${check.reason}`,
            source: resolved.source,
            workerId: WORKER_ID,
          },
          { failed: 1 },
        )
        cleanupCounty(fips) // thin/wrong: discard
        return 'failed'
      }
      console.log(
        `[w${WORKER_ID}] ${fips} download size ok count=${check.count} (min=${check.minRequired})`,
      )
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
  let claimMode = process.env.PARCEL_CLAIM_MODE || 'normal'

  console.log(`[w${WORKER_ID}] online startRank=${startRank} limit=${limit} claimMode=${claimMode}`)

  while (true) {
    let claimed = await claimNextCounty({ workerId: WORKER_ID, startRank, limit, claimMode })
    // Repair workers: when failed queue is empty, rejoin the normal nationwide queue
    if (!claimed && claimMode === 'failed_only') {
      console.log(`[w${WORKER_ID}] failed queue empty — switching to normal claimMode`)
      claimMode = 'normal'
      process.env.PARCEL_CLAIM_MODE = 'normal'
      claimed = await claimNextCounty({ workerId: WORKER_ID, startRank, limit, claimMode })
    }
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
      cleanupCounty(claimed.county.fips, { keepRaw: true })
    }
  }
}

function supervisorMain() {
  ensureR2()
  const workers = Math.max(1, Number(process.env.PARCEL_NATIONWIDE_WORKERS || 10))
  const repairWorkers = Math.max(
    0,
    Math.min(workers, Number(process.env.PARCEL_REPAIR_WORKERS || 0)),
  )
  // Keep uploads reasonable under parallel load
  if (!process.env.PARCEL_UPLOAD_CONCURRENCY) {
    process.env.PARCEL_UPLOAD_CONCURRENCY = String(Math.max(4, Math.floor(80 / workers)))
  }
  if (!process.env.PARCEL_TILE_CONCURRENCY) {
    process.env.PARCEL_TILE_CONCURRENCY = '2'
  }

  const reclaimedSlots = clearDeadTileSlots()
  if (reclaimedSlots > 0) {
    console.warn(`[nationwide-parallel] cleared ${reclaimedSlots} dead tippecanoe slot(s)`)
  }

  const progress = loadProgress()
  console.log(
    `[nationwide-parallel] starting ${workers} workers bucket=${process.env.R2_BUCKET_NAME || 'parcel-tiles'}`,
  )
  console.log(
    `[nationwide-parallel] repairWorkers=${repairWorkers} (failed_only→normal) normalWorkers=${workers - repairWorkers}`,
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
    const claimMode = i <= repairWorkers ? 'failed_only' : process.env.PARCEL_CLAIM_MODE || 'normal'
    const child = spawn(process.execPath, [scriptPath, '--worker', `--worker-id=${id}`], {
      stdio: 'inherit',
      env: {
        ...process.env,
        PARCEL_WORKER_ID: id,
        PARCEL_CLAIM_MODE: claimMode,
        PARCEL_RETRY_FAILED: claimMode.startsWith('failed') ? '1' : process.env.PARCEL_RETRY_FAILED || '',
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
