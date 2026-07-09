#!/usr/bin/env node
/**
 * Simple concurrent poll load test for /api/leads and /api/pipelines.
 *
 * Usage:
 *   API_BASE=https://knockscout.app/api FIREBASE_TOKEN=... node scripts/load-test-polls.mjs
 *
 * Optional env:
 *   CONCURRENCY=50  — parallel workers (default 20)
 *   ITERATIONS=10   — requests per worker per endpoint (default 10)
 */

const API_BASE = (process.env.API_BASE || 'http://localhost:3001/api').replace(/\/$/, '')
const TOKEN = process.env.FIREBASE_TOKEN || ''
const CONCURRENCY = Number(process.env.CONCURRENCY) || 20
const ITERATIONS = Number(process.env.ITERATIONS) || 10

if (!TOKEN) {
  console.error('Set FIREBASE_TOKEN to a valid Firebase ID token.')
  process.exit(1)
}

async function poll(path, etag) {
  const headers = { Authorization: `Bearer ${TOKEN}` }
  if (etag) headers['If-None-Match'] = etag
  const start = performance.now()
  const res = await fetch(`${API_BASE}${path}`, { headers })
  const ms = performance.now() - start
  return { status: res.status, ms, etag: res.headers.get('etag') }
}

async function worker(id, stats) {
  let leadsEtag = null
  let pipesEtag = null
  for (let i = 0; i < ITERATIONS; i++) {
    for (const [path, key] of [['/leads?view=list', 'leads'], ['/pipelines', 'pipes']]) {
      const etag = key === 'leads' ? leadsEtag : pipesEtag
      const result = await poll(path, etag)
      stats.total++
      stats.byStatus[result.status] = (stats.byStatus[result.status] || 0) + 1
      stats.latencies.push(result.ms)
      if (result.status === 304) stats.notModified++
      if (result.etag) {
        const clean = result.etag.replace(/^W\//, '').replace(/"/g, '')
        if (key === 'leads') leadsEtag = clean
        else pipesEtag = clean
      }
    }
  }
}

function percentile(arr, p) {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
}

const stats = { total: 0, notModified: 0, byStatus: {}, latencies: [] }
const started = performance.now()

await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i, stats)))

const elapsed = (performance.now() - started) / 1000
console.log(JSON.stringify({
  apiBase: API_BASE,
  concurrency: CONCURRENCY,
  iterations: ITERATIONS,
  totalRequests: stats.total,
  notModified: stats.notModified,
  notModifiedPct: stats.total ? Math.round((stats.notModified / stats.total) * 100) : 0,
  byStatus: stats.byStatus,
  elapsedSec: Math.round(elapsed * 10) / 10,
  rps: Math.round(stats.total / elapsed),
  latencyMs: {
    p50: Math.round(percentile(stats.latencies, 0.5)),
    p95: Math.round(percentile(stats.latencies, 0.95)),
    p99: Math.round(percentile(stats.latencies, 0.99)),
  },
}, null, 2))
