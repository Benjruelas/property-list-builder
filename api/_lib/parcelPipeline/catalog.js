/**
 * County parcel pipeline catalog.
 * Base list: checked-in seed JSON. Runtime state: KV per-county overrides + queues.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { kv, kvAvailable } from '../kvBootstrap.js'
import {
  CATALOG_META_KV_KEY,
  COUNTY_KV_PREFIX,
  CLAIM_LOCK_KV_KEY,
  STATUSES,
  CLAIM_LEASE_MS,
} from './constants.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../../..')
const SEED_PATH = path.join(ROOT, 'data/counties/catalog.seed.json')
const SOURCES_PATH = path.join(ROOT, 'data/counties/sources.seed.json')

const QUEUE_READY = 'parcel_pipeline:queue:ready'
const QUEUE_NEEDS_SOURCE = 'parcel_pipeline:queue:needs_source'
const STATUS_COUNTS_KEY = 'parcel_pipeline:status_counts'

let _seedCache = null

export function countyKvKey(fips) {
  return `${COUNTY_KV_PREFIX}${String(fips).padStart(5, '0')}`
}

export function loadSeedCatalog() {
  if (_seedCache) return _seedCache
  const raw = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'))
  let sources = {}
  try {
    sources = JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8')).sources || {}
  } catch {
    sources = {}
  }

  const counties = (raw.counties || []).map((c) => {
    const src = sources[c.fips]
    if (!src) return { ...c }
    return {
      ...c,
      status: 'ready',
      source: {
        type: src.type,
        url: src.url,
        layerId: src.layerId ?? null,
        licenseNote: src.licenseNote || '',
      },
      fieldMap: src.fieldMap || null,
    }
  })

  _seedCache = {
    version: raw.version || 1,
    count: counties.length,
    counties,
    byFips: new Map(counties.map((c) => [c.fips, c])),
  }
  return _seedCache
}

function normalizeCounty(input, prev = null) {
  const base = prev
    ? { ...prev }
    : {
        fips: '',
        name: '',
        fullName: '',
        state: '',
        status: 'needs_source',
        source: null,
        fieldMap: null,
        stats: null,
        claimedAt: null,
        claimedBy: null,
      }

  const next = { ...base, ...input }
  next.fips = String(next.fips || '').padStart(5, '0')
  if (next.status && !STATUSES.includes(next.status)) {
    throw new Error(`Invalid status: ${next.status}`)
  }
  if (next.source && typeof next.source === 'object') {
    next.source = {
      type: next.source.type || 'arcgis',
      url: next.source.url || '',
      layerId: next.source.layerId ?? null,
      licenseNote: next.source.licenseNote || '',
    }
  }
  return next
}

async function kvGetJson(key) {
  if (!kvAvailable || !kv) return null
  const data = await kv.get(key)
  if (data == null) return null
  if (typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch {
      return null
    }
  }
  return data
}

async function kvSetJson(key, value) {
  if (!kvAvailable || !kv) throw new Error('KV unavailable')
  await kv.set(key, value).catch(() => kv.set(key, JSON.stringify(value)))
}

function mergeCounty(seedCounty, override) {
  if (!override) return { ...seedCounty }
  return normalizeCounty({ ...seedCounty, ...override, fips: seedCounty.fips }, seedCounty)
}

function emptyCounts(seed) {
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]))
  for (const c of seed.counties) byStatus[c.status] = (byStatus[c.status] || 0) + 1
  return byStatus
}

async function setStatusCounts(byStatus) {
  await kvSetJson(STATUS_COUNTS_KEY, byStatus)
}

async function adjustStatusCounts(fromStatus, toStatus) {
  if (!kvAvailable || !kv || fromStatus === toStatus) return
  const seed = loadSeedCatalog()
  let counts = await kvGetJson(STATUS_COUNTS_KEY)
  if (!counts) counts = emptyCounts(seed)
  counts[fromStatus] = Math.max(0, (counts[fromStatus] || 0) - 1)
  counts[toStatus] = (counts[toStatus] || 0) + 1
  await setStatusCounts(counts)
}

async function enqueue(fips, status) {
  if (!kvAvailable || !kv) return
  const key = status === 'ready' ? QUEUE_READY : status === 'needs_source' ? QUEUE_NEEDS_SOURCE : null
  if (!key) return
  if (typeof kv.rpush === 'function') await kv.rpush(key, fips)
  else {
    // Fallback: store as JSON array
    const arr = (await kvGetJson(key)) || []
    arr.push(fips)
    await kvSetJson(key, arr)
  }
}

async function dequeue(queueKey) {
  if (!kvAvailable || !kv) return null
  if (typeof kv.lpop === 'function') {
    const v = await kv.lpop(queueKey)
    return v == null ? null : String(v)
  }
  const arr = (await kvGetJson(queueKey)) || []
  if (!arr.length) return null
  const fips = arr.shift()
  await kvSetJson(queueKey, arr)
  return fips
}

async function clearQueue(queueKey) {
  if (!kvAvailable || !kv) return
  if (typeof kv.del === 'function') await kv.del(queueKey)
  else await kvSetJson(queueKey, [])
}

/** Initialize meta, status counts, and work queues from seed (idempotent unless force). */
export async function ensureCatalogSeeded({ force = false } = {}) {
  const seed = loadSeedCatalog()
  if (!kvAvailable || !kv) {
    return { ok: true, mode: 'local-seed', count: seed.count, seeded: false }
  }
  const meta = await kvGetJson(CATALOG_META_KV_KEY)
  if (meta?.seeded && !force) {
    return { ok: true, mode: 'kv', count: seed.count, seeded: false, meta }
  }

  await clearQueue(QUEUE_READY)
  await clearQueue(QUEUE_NEEDS_SOURCE)

  const ready = []
  const needs = []
  for (const c of seed.counties) {
    if (c.status === 'ready') ready.push(c.fips)
    else if (c.status === 'needs_source') needs.push(c.fips)
  }

  if (typeof kv.rpush === 'function') {
    // chunk rpush to avoid huge payloads
    for (let i = 0; i < ready.length; i += 200) {
      await kv.rpush(QUEUE_READY, ...ready.slice(i, i + 200))
    }
    for (let i = 0; i < needs.length; i += 200) {
      await kv.rpush(QUEUE_NEEDS_SOURCE, ...needs.slice(i, i + 200))
    }
  } else {
    await kvSetJson(QUEUE_READY, ready)
    await kvSetJson(QUEUE_NEEDS_SOURCE, needs)
  }

  const byStatus = emptyCounts(seed)
  await setStatusCounts(byStatus)

  const newMeta = {
    seeded: true,
    seededAt: new Date().toISOString(),
    version: seed.version,
    count: seed.count,
    strategy: 'seed-file-plus-overrides',
    queueReady: ready.length,
    queueNeedsSource: needs.length,
  }
  await kvSetJson(CATALOG_META_KV_KEY, newMeta)
  return { ok: true, mode: 'kv', count: seed.count, seeded: true, meta: newMeta }
}

export async function listCounties({ status, state, limit = 100, offset = 0 } = {}) {
  const seed = loadSeedCatalog()
  const out = []

  // Fast path: when filtering ready/needs_source without state, walk seed defaults
  // and only hydrate overrides for the page window.
  for (const base of seed.counties) {
    if (state && base.state !== String(state).toUpperCase()) continue

    let county = { ...base }
    if (kvAvailable && kv) {
      const ov = await kvGetJson(countyKvKey(base.fips))
      if (ov) county = mergeCounty(base, ov)
    }
    if (status && county.status !== status) continue
    out.push(county)
    // Early exit only when no status filter would miss later overrides — keep full scan for correctness.
  }

  return {
    total: out.length,
    counties: out.slice(offset, offset + Math.min(limit, 500)),
    mode: kvAvailable ? 'kv' : 'local-seed',
  }
}

export async function getCounty(fips) {
  const padded = String(fips || '').padStart(5, '0')
  const seed = loadSeedCatalog()
  const base = seed.byFips.get(padded)
  if (!base) return null
  if (!kvAvailable || !kv) return { ...base }
  const ov = await kvGetJson(countyKvKey(padded))
  return mergeCounty(base, ov)
}

export async function updateCounty(fips, patch) {
  const padded = String(fips || '').padStart(5, '0')
  const prev = await getCounty(padded)
  if (!prev) throw new Error(`Unknown county fips ${padded}`)
  const next = normalizeCounty({ ...prev, ...patch, fips: padded }, prev)

  if (kvAvailable && kv) {
    await ensureCatalogSeeded()
    await kvSetJson(countyKvKey(padded), next)
    if (prev.status !== next.status) {
      await adjustStatusCounts(prev.status, next.status)
      if (next.status === 'ready' || next.status === 'needs_source') {
        await enqueue(padded, next.status)
      }
    }
  } else {
    next._warning = 'KV unavailable; update not persisted'
  }
  return next
}

function isClaimExpired(county) {
  if (county.status !== 'running') return true
  if (!county.claimedAt) return true
  const t = Date.parse(county.claimedAt)
  if (!Number.isFinite(t)) return true
  return Date.now() - t > CLAIM_LEASE_MS
}

async function acquireClaimLock(lockToken) {
  if (!kvAvailable || !kv) return true
  try {
    const result = await kv.set(CLAIM_LOCK_KV_KEY, lockToken, { nx: true, ex: 30 })
    if (result === null || result === false) return false
    return true
  } catch {
    const existing = await kv.get(CLAIM_LOCK_KV_KEY)
    if (existing) return false
    await kv.set(CLAIM_LOCK_KV_KEY, lockToken)
    return true
  }
}

async function releaseClaimLock(lockToken) {
  if (!kvAvailable || !kv) return
  try {
    const cur = await kv.get(CLAIM_LOCK_KV_KEY)
    if (cur === lockToken || cur == null) await kv.del?.(CLAIM_LOCK_KV_KEY)
  } catch {
    /* ignore */
  }
}

async function tryClaimFips(fips, claimedBy) {
  const county = await getCounty(fips)
  if (!county) return null
  const eligible =
    county.status === 'ready' ||
    county.status === 'needs_source' ||
    (county.status === 'running' && isClaimExpired(county))
  if (!eligible) return null

  const prevStatus = county.status
  const claimed = normalizeCounty(
    {
      ...county,
      status: 'running',
      claimedAt: new Date().toISOString(),
      claimedBy,
    },
    county,
  )

  if (kvAvailable && kv) {
    await kvSetJson(countyKvKey(fips), claimed)
    await adjustStatusCounts(prevStatus, 'running')
  }
  return claimed
}

/**
 * Claim next county needing work. Prefers ready queue, then needs_source.
 */
export async function claimNextCounty({ claimedBy = 'agent', preferStatus } = {}) {
  const seed = loadSeedCatalog()

  if (!kvAvailable || !kv) {
    const order = preferStatus
      ? [preferStatus, 'ready', 'needs_source']
      : ['ready', 'needs_source']
    for (const st of [...new Set(order)]) {
      const c = seed.counties.find((x) => x.status === st)
      if (c) {
        return {
          county: {
            ...c,
            status: 'running',
            claimedAt: new Date().toISOString(),
            claimedBy,
          },
          mode: 'local-seed',
          warning: 'KV unavailable; claim is not durable',
        }
      }
    }
    return { county: null, mode: 'local-seed' }
  }

  await ensureCatalogSeeded()
  const lockToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const locked = await acquireClaimLock(lockToken)
  if (!locked) return { county: null, busy: true, mode: 'kv' }

  try {
    const queues =
      preferStatus === 'needs_source'
        ? [QUEUE_NEEDS_SOURCE, QUEUE_READY]
        : [QUEUE_READY, QUEUE_NEEDS_SOURCE]

    for (const q of queues) {
      for (let attempts = 0; attempts < 50; attempts++) {
        const fips = await dequeue(q)
        if (!fips) break
        const claimed = await tryClaimFips(fips, claimedBy)
        if (claimed) return { county: claimed, mode: 'kv' }
      }
    }

    return { county: null, mode: 'kv' }
  } finally {
    await releaseClaimLock(lockToken)
  }
}

export async function reportCounty(
  fips,
  { status, stats, source, fieldMap, error, claimedBy } = {},
) {
  if (!STATUSES.includes(status)) throw new Error(`Invalid report status: ${status}`)
  if (!['complete', 'failed', 'no_public_source', 'ready', 'needs_source'].includes(status)) {
    throw new Error(`Report status must be terminal or ready/needs_source, got ${status}`)
  }

  const prev = await getCounty(fips)
  if (!prev) throw new Error(`Unknown county fips ${fips}`)

  const next = normalizeCounty(
    {
      ...prev,
      status,
      source: source !== undefined ? source : prev.source,
      fieldMap: fieldMap !== undefined ? fieldMap : prev.fieldMap,
      claimedAt: null,
      claimedBy: claimedBy || prev.claimedBy,
      stats: {
        ...(prev.stats || {}),
        ...(stats || {}),
        error: error || (status === 'failed' ? stats?.error || 'failed' : undefined),
        lastRunAt: new Date().toISOString(),
      },
    },
    prev,
  )

  if (!kvAvailable || !kv) {
    return {
      county: next,
      mode: 'local-seed',
      warning: 'KV unavailable; report not persisted',
    }
  }

  await ensureCatalogSeeded()
  await kvSetJson(countyKvKey(next.fips), next)
  await adjustStatusCounts(prev.status, next.status)
  if (next.status === 'ready' || next.status === 'needs_source') {
    await enqueue(next.fips, next.status)
  }
  return { county: next, mode: 'kv' }
}

export async function coverageSummary() {
  const seed = loadSeedCatalog()
  if (!kvAvailable || !kv) {
    const byStatus = emptyCounts(seed)
    return {
      mode: 'local-seed',
      total: seed.counties.length,
      byStatus,
      completePct: seed.counties.length
        ? Math.round((1000 * (byStatus.complete || 0)) / seed.counties.length) / 10
        : 0,
    }
  }

  await ensureCatalogSeeded()
  let byStatus = await kvGetJson(STATUS_COUNTS_KEY)
  if (!byStatus) byStatus = emptyCounts(seed)

  return {
    mode: 'kv',
    total: seed.counties.length,
    byStatus,
    completePct: seed.counties.length
      ? Math.round((1000 * (byStatus.complete || 0)) / seed.counties.length) / 10
      : 0,
  }
}
