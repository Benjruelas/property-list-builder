/**
 * Shared nationwide progress + mkdir-based lock for multi-worker claims.
 */
import fs from 'fs'
import path from 'path'
import { ROOT, DATA_DIR } from './paths.mjs'

export const PROGRESS_PATH = path.join(DATA_DIR, 'nationwide-progress.json')
export const RANK_PATH = path.join(ROOT, 'data/counties/population-rank.json')
const LOCK_DIR = path.join(DATA_DIR, '.nationwide.lock')

const TERMINAL = new Set(['complete', 'no_source', 'skipped'])

export function defaultProgress() {
  return {
    version: 1,
    updatedAt: null,
    byFips: {},
    stats: { complete: 0, failed: 0, no_source: 0, skipped: 0 },
  }
}

export function loadProgress() {
  if (!fs.existsSync(PROGRESS_PATH)) return defaultProgress()
  const p = JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'))
  if (!p.stats) p.stats = defaultProgress().stats
  if (!p.byFips) p.byFips = {}
  return p
}

export function saveProgress(p) {
  p.updatedAt = new Date().toISOString()
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const tmp = `${PROGRESS_PATH}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(p, null, 2))
  fs.renameSync(tmp, PROGRESS_PATH)
}

export async function withProgressLock(fn, { timeoutMs = 120_000 } = {}) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const started = Date.now()
  while (true) {
    try {
      fs.mkdirSync(LOCK_DIR)
      break
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      if (Date.now() - started > timeoutMs) {
        throw new Error(`nationwide progress lock timeout after ${timeoutMs}ms`)
      }
      await new Promise((r) => setTimeout(r, 25 + Math.floor(Math.random() * 50)))
    }
  }
  try {
    return await fn()
  } finally {
    try {
      fs.rmdirSync(LOCK_DIR)
    } catch {
      /* ignore */
    }
  }
}

function isStaleRunning(entry, staleMs) {
  if (!entry || entry.status !== 'running') return false
  const t = Date.parse(entry.startedAt || entry.updatedAt || 0)
  if (!Number.isFinite(t)) return true
  return Date.now() - t > staleMs
}

/**
 * Claim next largest unfinished county. Returns rank entry + rankNum or null.
 */
export async function claimNextCounty({
  workerId,
  startRank = 1,
  limit = Infinity,
  staleRunningMs = Number(process.env.PARCEL_STALE_RUNNING_MS || 6 * 60 * 60 * 1000),
  retryFailed = process.env.PARCEL_RETRY_FAILED === '1',
} = {}) {
  return withProgressLock(() => {
    const rank = JSON.parse(fs.readFileSync(RANK_PATH, 'utf8'))
    const progress = loadProgress()
    const counties = rank.counties.slice(startRank - 1, startRank - 1 + limit)

    for (let i = 0; i < counties.length; i++) {
      const c = counties[i]
      const rankNum = startRank + i
      const prev = progress.byFips[c.fips]

      if (!prev) {
        // claim
      } else if (TERMINAL.has(prev.status)) {
        continue
      } else if (prev.status === 'failed' && !retryFailed) {
        continue
      } else if (prev.status === 'interrupted') {
        console.warn(`[nationwide] reclaiming interrupted ${c.fips}`)
      } else if (prev.status === 'running' && !isStaleRunning(prev, staleRunningMs)) {
        continue
      } else if (prev.status === 'running' && isStaleRunning(prev, staleRunningMs)) {
        console.warn(`[nationwide] reclaiming stale running ${c.fips} (was ${prev.workerId || 'unknown'})`)
      }

      progress.byFips[c.fips] = {
        status: 'running',
        population2023: c.population2023,
        name: c.name,
        state: c.state,
        rank: rankNum,
        workerId,
        startedAt: new Date().toISOString(),
      }
      saveProgress(progress)
      return { county: c, rankNum, total: rank.counties.length, progress }
    }
    return null
  })
}

export async function updateCountyStatus(fips, patch, statDelta) {
  return withProgressLock(() => {
    const progress = loadProgress()
    const prev = progress.byFips[fips] || {}
    progress.byFips[fips] = {
      ...prev,
      ...patch,
      finishedAt: patch.finishedAt || new Date().toISOString(),
    }
    if (statDelta) {
      for (const [k, v] of Object.entries(statDelta)) {
        progress.stats[k] = (progress.stats[k] || 0) + v
      }
    }
    saveProgress(progress)
    return progress
  })
}

export async function withOverlayLock(fn) {
  const lockDir = path.join(DATA_DIR, '.sources-runtime.lock')
  const started = Date.now()
  while (true) {
    try {
      fs.mkdirSync(lockDir)
      break
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      if (Date.now() - started > 60_000) throw new Error('sources.runtime lock timeout')
      await new Promise((r) => setTimeout(r, 20 + Math.floor(Math.random() * 40)))
    }
  }
  try {
    return await fn()
  } finally {
    try {
      fs.rmdirSync(lockDir)
    } catch {
      /* ignore */
    }
  }
}
