/**
 * Shared nationwide progress + mkdir-based lock for multi-worker claims.
 */
import fs from 'fs'
import path from 'path'
import { ROOT, DATA_DIR } from './paths.mjs'
import {
  isExhaustedFailure,
  nextFailureDecision,
  classifyFailure,
} from './failurePolicy.mjs'

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

const HEARTBEAT_DIR = path.join(DATA_DIR, '.heartbeats')

export function heartbeatFilePath(fips) {
  return path.join(HEARTBEAT_DIR, String(fips).padStart(5, '0'))
}

/** Lock-free heartbeat — avoids nationwide-progress.json contention. */
export function touchHeartbeat(fips, workerId) {
  fs.mkdirSync(HEARTBEAT_DIR, { recursive: true })
  fs.writeFileSync(
    heartbeatFilePath(fips),
    JSON.stringify({ workerId, at: new Date().toISOString() }),
  )
}

function isStaleRunning(entry, fips, staleMs) {
  if (!entry || entry.status !== 'running') return false
  // Prefer lock-free heartbeat file mtime (updated every ~60s while work is live).
  try {
    const hbPath = heartbeatFilePath(fips)
    if (fs.existsSync(hbPath)) {
      return Date.now() - fs.statSync(hbPath).mtimeMs > staleMs
    }
  } catch {
    /* fall through */
  }
  const t = Date.parse(entry.heartbeatAt || entry.startedAt || entry.updatedAt || 0)
  if (!Number.isFinite(t)) return true
  return Date.now() - t > staleMs
}

/**
 * Claim next largest unfinished county. Returns rank entry + rankNum or null.
 */
function canClaim(prev, fips, { retryFailed, staleRunningMs }) {
  if (!prev) return { ok: true }
  if (TERMINAL.has(prev.status)) return { ok: false }
  if (prev.status === 'failed') {
    // Never reclaim permanent / exhausted failures — repair must not spin forever.
    if (isExhaustedFailure(prev)) return { ok: false }
    return retryFailed
      ? { ok: true, note: `reclaiming failed ${prev.error || ''}`.trim() }
      : { ok: false }
  }
  if (prev.status === 'interrupted') return { ok: true, note: 'reclaiming interrupted' }
  if (prev.status === 'running') {
    if (isStaleRunning(prev, fips, staleRunningMs)) {
      return { ok: true, note: `reclaiming stale running (was ${prev.workerId || 'unknown'})` }
    }
    return { ok: false }
  }
  return { ok: true }
}

function recomputeStats(progress) {
  const stats = { complete: 0, failed: 0, no_source: 0, skipped: 0 }
  for (const r of Object.values(progress.byFips || {})) {
    if (r.status && stats[r.status] !== undefined) stats[r.status]++
  }
  progress.stats = stats
}

/** Convert exhausted `failed` rows to terminal `skipped` so they leave the repair queue. */
export function parkExhaustedFailuresInProgress(progress) {
  let n = 0
  for (const [fips, prev] of Object.entries(progress.byFips || {})) {
    if (prev.status !== 'failed') continue
    if (!isExhaustedFailure(prev) && !classifyFailure(prev.error).permanent) continue
    const cls = classifyFailure(prev.error)
    progress.byFips[fips] = {
      ...prev,
      status: 'skipped',
      permanentFailure: true,
      failureReason: cls.reason,
      finishedAt: prev.finishedAt || new Date().toISOString(),
      note:
        prev.note && String(prev.note).includes('will not retry')
          ? prev.note
          : `parked — will not retry: permanent (${cls.reason || 'exhausted'})`,
    }
    n++
  }
  if (n) recomputeStats(progress)
  return n
}

/**
 * Claim next county.
 * claimMode:
 *   - normal: largest→smallest, skip failed (unless retryFailed)
 *   - failed_first: prefer failed/interrupted-failed, then fall back to normal
 *   - failed_only: only failed (returns null when none left — supervisor can switch mode)
 */
export async function claimNextCounty({
  workerId,
  startRank = 1,
  limit = Infinity,
  // Default 1h — long downloads still heartbeat via progress updates / worker activity;
  // truly stuck workers must not block the queue for half a day.
  staleRunningMs = Number(process.env.PARCEL_STALE_RUNNING_MS || 60 * 60 * 1000),
  retryFailed = process.env.PARCEL_RETRY_FAILED === '1',
  claimMode = process.env.PARCEL_CLAIM_MODE || 'normal',
  /** FIPS already owned in R2 — never reclaim/re-run these. */
  skipFips = null,
} = {}) {
  const owned = skipFips instanceof Set ? skipFips : null
  return withProgressLock(() => {
    const rank = JSON.parse(fs.readFileSync(RANK_PATH, 'utf8'))
    const progress = loadProgress()
    const counties = rank.counties.slice(startRank - 1, startRank - 1 + limit)
    const total = rank.counties.length

    // Sync local progress for anything already on R2 so we don't touch it again.
    // Do not clobber in-flight `running` on this VM (worker may still be uploading).
    let dirty = false
    if (owned?.size) {
      let synced = 0
      for (const fips of owned) {
        const prev = progress.byFips[fips]
        if (prev?.status === 'complete' || prev?.status === 'running') continue
        const rankIdx = rank.counties.findIndex((c) => c.fips === fips)
        const c = rankIdx >= 0 ? rank.counties[rankIdx] : null
        progress.byFips[fips] = {
          ...(prev || {}),
          status: 'complete',
          population2023: c?.population2023 ?? prev?.population2023,
          name: c?.name ?? prev?.name,
          state: c?.state ?? prev?.state,
          rank: rankIdx >= 0 ? rankIdx + 1 : prev?.rank,
          format: 'pmtiles',
          finishedAt: new Date().toISOString(),
          note: 'synced from R2 owned/pmtiles manifest',
        }
        synced++
      }
      if (synced) {
        dirty = true
        console.warn(`[nationwide] synced ${synced} complete counties from R2 manifest`)
      }
    }

    const parked = parkExhaustedFailuresInProgress(progress)
    if (parked) {
      dirty = true
      console.warn(`[nationwide] parked ${parked} exhausted/permanent failures (no more retries)`)
    }
    if (dirty) {
      recomputeStats(progress)
      saveProgress(progress)
    }

    const tryClaim = (predicate) => {
      for (let i = 0; i < counties.length; i++) {
        const c = counties[i]
        const rankNum = startRank + i
        if (owned?.has(c.fips)) continue
        const prev = progress.byFips[c.fips]
        if (!predicate(prev, c)) continue
        const decision = canClaim(prev, c.fips, {
          retryFailed: retryFailed || claimMode.startsWith('failed'),
          staleRunningMs,
        })
        if (!decision.ok) continue
        if (decision.note) console.warn(`[nationwide] ${decision.note} ${c.fips}`)
        progress.byFips[c.fips] = {
          status: 'running',
          population2023: c.population2023,
          name: c.name,
          state: c.state,
          rank: rankNum,
          workerId,
          startedAt: new Date().toISOString(),
          heartbeatAt: new Date().toISOString(),
          // Preserve retry counters across reclaim so caps still apply.
          failCount: prev?.failCount || 0,
          sameErrorStreak: prev?.sameErrorStreak || 0,
          error: prev?.error,
          retryOf: prev?.status === 'failed' ? prev.error || 'failed' : undefined,
        }
        touchHeartbeat(c.fips, workerId)
        recomputeStats(progress)
        saveProgress(progress)
        return { county: c, rankNum, total, progress, reclaimed: prev?.status || null }
      }
      return null
    }

    if (claimMode === 'failed_only' || claimMode === 'failed_first') {
      const failedHit = tryClaim((prev) => prev?.status === 'failed')
      if (failedHit) return failedHit
      if (claimMode === 'failed_only') return null
    }

    return tryClaim(() => true)
  })
}

export async function updateCountyStatus(fips, patch, statDelta) {
  return withProgressLock(() => {
    const progress = loadProgress()
    const prev = progress.byFips[fips] || {}
    const finished =
      patch.status && patch.status !== 'running'
        ? patch.finishedAt || new Date().toISOString()
        : patch.finishedAt
    progress.byFips[fips] = {
      ...prev,
      ...patch,
      ...(finished ? { finishedAt: finished } : {}),
    }
    if (statDelta) {
      for (const [k, v] of Object.entries(statDelta)) {
        progress.stats[k] = (progress.stats[k] || 0) + v
      }
    } else if (patch.status && patch.status !== prev.status) {
      recomputeStats(progress)
    }
    saveProgress(progress)
    return progress
  })
}

/**
 * Record a county failure with retry/permanent parking policy.
 * Permanent errors (normalize kept=0, thin source) → skipped immediately.
 * Transient errors → failed until PARCEL_MAX_RETRIES, then skipped.
 */
export async function recordCountyFailure(fips, basePatch, error) {
  return withProgressLock(() => {
    const progress = loadProgress()
    const prev = progress.byFips[fips] || {}
    const decision = nextFailureDecision(prev, error)
    progress.byFips[fips] = {
      ...prev,
      ...basePatch,
      ...decision,
      finishedAt: new Date().toISOString(),
    }
    recomputeStats(progress)
    saveProgress(progress)
    if (decision.status === 'skipped') {
      console.warn(`[nationwide] ${fips} ${decision.note}`)
    } else {
      console.warn(`[nationwide] ${fips} ${decision.note}`)
    }
    return progress.byFips[fips]
  })
}

/** Touch running county so stale reclaim (default 1h) does not steal live work. */
export async function heartbeatCounty(fips, workerId) {
  // Fast path: lock-free file touch (used every 60s during long steps).
  try {
    touchHeartbeat(fips, workerId)
  } catch {
    /* ignore */
  }
  // Slow path (best-effort): mirror into progress JSON without blocking work if lock busy.
  try {
    return await withProgressLock(
      () => {
        const progress = loadProgress()
        const prev = progress.byFips[fips]
        if (!prev || prev.status !== 'running') return progress
        progress.byFips[fips] = {
          ...prev,
          heartbeatAt: new Date().toISOString(),
          workerId: workerId || prev.workerId,
        }
        saveProgress(progress)
        return progress
      },
      { timeoutMs: 2_000 },
    )
  } catch {
    return null
  }
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
