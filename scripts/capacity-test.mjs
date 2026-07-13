#!/usr/bin/env node
/**
 * Lightweight capacity gate script for 1k/10k MAU smoke checks.
 * Usage:
 *   API_BASE=https://knockscout.app/api FIREBASE_TOKEN=... node scripts/capacity-test.mjs
 */
const API_BASE = (process.env.API_BASE || 'http://localhost:3001/api').replace(/\/$/, '')
const TOKEN = process.env.FIREBASE_TOKEN || ''
const CONCURRENCY = Number(process.env.CONCURRENCY || 20)

async function fetchJson(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      ...(opts.headers || {}),
    },
  })
  const text = await res.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { status: res.status, body, ms: 0 }
}

async function timed(path, opts) {
  const start = Date.now()
  const result = await fetchJson(path, opts)
  result.ms = Date.now() - start
  return result
}

async function main() {
  const health = await timed('/health')
  console.log('health', health.status, health.body)

  const tasks = Array.from({ length: CONCURRENCY }, (_, i) =>
    timed('/leads', { headers: { 'If-None-Match': `"gate-${i}"` } }),
  )
  const results = await Promise.all(tasks)
  const errors = results.filter((r) => r.status >= 500).length
  const p95 = results.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(results.length * 0.95)] || 0
  console.log(JSON.stringify({
    concurrency: CONCURRENCY,
    errors,
    errorRate: errors / results.length,
    p95ms: p95,
    pass: errors / results.length < 0.01 && p95 < 750,
  }, null, 2))
  if (errors / results.length >= 0.01) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
