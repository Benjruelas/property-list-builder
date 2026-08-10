#!/usr/bin/env node
/**
 * Process US counties largest→smallest (Census 2023 population).
 * Resumable via parcel_data/nationwide-progress.json.
 *
 * Env:
 *   R2_* credentials required for upload
 *   PARCEL_NATIONWIDE_LIMIT (optional cap for testing)
 *   PARCEL_NATIONWIDE_START_RANK (1-based, default 1)
 *   PARCEL_SKIP_DISCOVERY=1 to only run counties with known sources
 */
import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import { ROOT, DATA_DIR } from './lib/paths.mjs'
import { getLocalCounty, loadLocalCatalog } from './lib/catalogLocal.mjs'
import { discoverArcgisSource } from './discover-arcgis-online.mjs'
import { validateDownloadedCount, validateParcelLayer } from './lib/sourceValidation.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROGRESS_PATH = path.join(DATA_DIR, 'nationwide-progress.json')
const RANK_PATH = path.join(ROOT, 'data/counties/population-rank.json')
const DONE_FIPS = new Set(['48439', '12086', '53033']) // already uploaded this run

function loadProgress() {
  if (!fs.existsSync(PROGRESS_PATH)) {
    return { version: 1, updatedAt: null, byFips: {}, stats: { complete: 0, failed: 0, no_source: 0, skipped: 0 } }
  }
  return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'))
}

function saveProgress(p) {
  p.updatedAt = new Date().toISOString()
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(p, null, 2))
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
  // keep mbtiles + metas for resume/debug; delete mbtiles if huge disk pressure
  const mb = path.join(dir, `${fips}.mbtiles`)
  if (fs.existsSync(mb)) {
    const free = Number(spawnSync('df', ['--output=avail', DATA_DIR], { encoding: 'utf8' }).stdout.trim().split('\n')[1] || 0)
    // avail in 1K blocks; if < 40GB free, drop mbtiles
    if (free > 0 && free < 40 * 1024 * 1024) fs.unlinkSync(mb)
  }
}

function ensureR2() {
  for (const k of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) {
    if (!process.env[k]) throw new Error(`Missing ${k}`)
  }
}

async function resolveSource(county, rankEntry) {
  const local = getLocalCounty(county.fips)
  const pop = rankEntry.population2023
  if (local?.source?.url && local.source.type !== 'none') {
    const v = await validateParcelLayer(local.source.url, {
      population2023: pop,
      title: local.source.licenseNote || local.source.url,
      where: local.source.where || '1=1',
    })
    if (v.ok) return { source: local.source, fieldMap: local.fieldMap }
    console.warn(`[nationwide] seed source rejected ${county.fips}: ${v.reason}`)
  }
  if (process.env.PARCEL_SKIP_DISCOVERY === '1') return null
  console.log(`[nationwide] discovering source for ${rankEntry.name}, ${rankEntry.state} (${county.fips})`)
  const found = await discoverArcgisSource({
    name: rankEntry.name.replace(/\s+County$/i, ''),
    state: rankEntry.state,
    fips: county.fips,
    population2023: pop,
  })
  return found ? { source: found, fieldMap: found.fieldMap } : null
}

/** Temporarily overlay discovered source into a side file consumed by getLocalCounty? 
 *  Instead write parcel_data/{fips}/source.json and teach download to read it.
 */
function writeRuntimeSource(fips, source, fieldMap) {
  const dir = path.join(DATA_DIR, fips)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'source.json'), JSON.stringify({ source, fieldMap }, null, 2))
}

async function processCounty(rankEntry, progress) {
  const fips = rankEntry.fips
  const prev = progress.byFips[fips]
  if (prev?.status === 'complete' || DONE_FIPS.has(fips)) {
    console.log(`[nationwide] skip complete ${fips}`)
    if (!prev && DONE_FIPS.has(fips)) {
      progress.byFips[fips] = {
        status: 'complete',
        population2023: rankEntry.population2023,
        note: 'pre-completed before nationwide runner',
        finishedAt: new Date().toISOString(),
      }
      progress.stats.complete++
      saveProgress(progress)
    }
    return 'skipped'
  }

  const catalogCounty = getLocalCounty(fips) || {
    fips,
    name: rankEntry.name.replace(/\s+County$/i, ''),
    state: '',
    fullName: rankEntry.name,
  }

  progress.byFips[fips] = {
    status: 'running',
    population2023: rankEntry.population2023,
    name: rankEntry.name,
    state: rankEntry.state,
    startedAt: new Date().toISOString(),
  }
  saveProgress(progress)

  let resolved
  try {
    resolved = await resolveSource(catalogCounty, rankEntry)
  } catch (e) {
    resolved = null
    console.warn('[nationwide] discover error', e.message)
  }

  if (!resolved?.source?.url) {
    progress.byFips[fips] = {
      status: 'no_source',
      population2023: rankEntry.population2023,
      name: rankEntry.name,
      state: rankEntry.state,
      finishedAt: new Date().toISOString(),
    }
    progress.stats.no_source++
    saveProgress(progress)
    console.log(`[nationwide] no_source ${fips} ${rankEntry.name}`)
    return 'no_source'
  }

  writeRuntimeSource(fips, resolved.source, resolved.fieldMap)

  // Patch env so download/normalize pick up runtime source via local file
  // (download uses getLocalCounty; we also pass via temporary merge by writing into sources overlay)
  const overlayPath = path.join(ROOT, 'data/counties/sources.runtime.json')
  let overlay = { sources: {} }
  if (fs.existsSync(overlayPath)) overlay = JSON.parse(fs.readFileSync(overlayPath, 'utf8'))
  overlay.sources[fips] = {
    ...resolved.source,
    fieldMap: resolved.fieldMap,
  }
  fs.writeFileSync(overlayPath, JSON.stringify(overlay))

  // Clear module cache for catalogLocal by running child processes (fresh each time) — OK.

  const steps = [
    ['download-county.mjs', [`--fips=${fips}`]],
    ['normalize-county.mjs', [`--fips=${fips}`]],
    ['tile-county.mjs', [`--fips=${fips}`]],
    ['upload-county-tiles-parallel.mjs', [`--fips=${fips}`]],
  ]

  for (const [script, args] of steps) {
    console.log(`\n[nationwide] ${fips} → ${script}`)
    const code = runNode(script, args)
    if (code !== 0) {
      progress.byFips[fips] = {
        status: 'failed',
        population2023: rankEntry.population2023,
        name: rankEntry.name,
        state: rankEntry.state,
        error: `${script} exit ${code}`,
        finishedAt: new Date().toISOString(),
        source: resolved.source,
      }
      progress.stats.failed++
      saveProgress(progress)
      cleanupCounty(fips)
      return 'failed'
    }
    if (script === 'download-county.mjs') {
      const metaPath = path.join(DATA_DIR, fips, 'download-meta.json')
      const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {}
      const check = validateDownloadedCount(meta.featureCount, rankEntry.population2023)
      if (!check.ok) {
        progress.byFips[fips] = {
          status: 'failed',
          population2023: rankEntry.population2023,
          name: rankEntry.name,
          state: rankEntry.state,
          error: `thin_source: ${check.reason}`,
          finishedAt: new Date().toISOString(),
          source: resolved.source,
        }
        progress.stats.failed++
        saveProgress(progress)
        cleanupCounty(fips)
        return 'failed'
      }
    }
  }

  const uploadMetaPath = path.join(DATA_DIR, fips, 'upload-meta.json')
  const uploadMeta = fs.existsSync(uploadMetaPath)
    ? JSON.parse(fs.readFileSync(uploadMetaPath, 'utf8'))
    : {}

  progress.byFips[fips] = {
    status: 'complete',
    population2023: rankEntry.population2023,
    name: rankEntry.name,
    state: rankEntry.state,
    finishedAt: new Date().toISOString(),
    source: resolved.source,
    tileCount: uploadMeta.tileCount || uploadMeta.uploaded,
  }
  progress.stats.complete++
  saveProgress(progress)
  cleanupCounty(fips)
  console.log(`[nationwide] complete ${fips} tiles=${uploadMeta.uploaded}`)
  return 'complete'
}

async function main() {
  ensureR2()
  // Make catalogLocal see runtime sources: patch by merging runtime into process via env path
  process.env.PARCEL_SOURCES_RUNTIME = path.join(ROOT, 'data/counties/sources.runtime.json')

  const rank = JSON.parse(fs.readFileSync(RANK_PATH, 'utf8'))
  const progress = loadProgress()
  // seed stats if empty
  if (!progress.stats) progress.stats = { complete: 0, failed: 0, no_source: 0, skipped: 0 }

  const startRank = Math.max(1, Number(process.env.PARCEL_NATIONWIDE_START_RANK || 1))
  const limit = process.env.PARCEL_NATIONWIDE_LIMIT
    ? Number(process.env.PARCEL_NATIONWIDE_LIMIT)
    : Infinity

  const counties = rank.counties.slice(startRank - 1, startRank - 1 + limit)
  console.log(`[nationwide] starting rank ${startRank} → ${startRank + counties.length - 1} of ${rank.counties.length}`)
  console.log(`[nationwide] R2 bucket=${process.env.R2_BUCKET_NAME || 'parcel-tiles'}`)

  for (let i = 0; i < counties.length; i++) {
    const c = counties[i]
    const rankNum = startRank + i
    console.log(`\n======== RANK ${rankNum}/${rank.counties.length} pop=${c.population2023} ${c.fips} ${c.name}, ${c.state} ========`)
    try {
      await processCounty(c, progress)
    } catch (e) {
      console.error('[nationwide] unexpected', e)
      progress.byFips[c.fips] = {
        status: 'failed',
        population2023: c.population2023,
        name: c.name,
        state: c.state,
        error: e.message,
        finishedAt: new Date().toISOString(),
      }
      progress.stats.failed++
      saveProgress(progress)
    }
  }

  console.log('[nationwide] finished batch', progress.stats)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
