#!/usr/bin/env node
/**
 * Post-deploy rollout verification for KnockScout scaling hardening.
 *
 * Usage:
 *   API_BASE=https://knockscout.app/api node scripts/verify-rollout.mjs
 *
 * Optional (for migrate re-run):
 *   FIREBASE_TOKEN=... MIGRATE_SECRET=... node scripts/verify-rollout.mjs --backfill
 */
const API_BASE = (process.env.API_BASE || 'https://knockscout.app/api').replace(/\/$/, '')
const TOKEN = process.env.FIREBASE_TOKEN || ''
const MIGRATE_SECRET = process.env.MIGRATE_SECRET || ''
const backfill = process.argv.includes('--backfill')

async function get(path, opts = {}) {
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
  return { status: res.status, body }
}

async function main() {
  const checks = []

  const health = await get('/health')
  checks.push({
    name: 'health',
    ok: health.status === 200 && health.body?.ok === true,
    status: health.status,
    body: health.body,
  })

  const tiles = await get('/google-tiles-session?mapType=satellite')
  const tileUrl = tiles.body?.tileUrl || ''
  checks.push({
    name: 'google-tiles-no-key-in-client',
    ok: tiles.status === 200 && tileUrl.includes('google-tiles-proxy') && !tileUrl.includes('key='),
    status: tiles.status,
    tileUrl: tileUrl.slice(0, 120),
  })

  if (TOKEN) {
    const leads = await get('/leads')
    checks.push({
      name: 'leads-auth',
      ok: leads.status === 200 && Array.isArray(leads.body?.leads ?? leads.body),
      status: leads.status,
    })
  } else {
    checks.push({ name: 'leads-auth', ok: null, skipped: 'Set FIREBASE_TOKEN to verify authenticated routes' })
  }

  if (backfill) {
    if (!TOKEN || !MIGRATE_SECRET) {
      console.error('FIREBASE_TOKEN and MIGRATE_SECRET required for --backfill')
      process.exit(1)
    }
    const mig = await fetch(`${API_BASE}/migrate-infra`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'X-Migrate-Secret': MIGRATE_SECRET,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ target: 'all' }),
    })
    const migBody = await mig.json().catch(() => ({}))
    checks.push({
      name: 'migrate-infra',
      ok: mig.status === 200 && migBody.ok === true,
      status: mig.status,
      body: migBody,
    })
  }

  const failed = checks.filter((c) => c.ok === false)
  console.log(JSON.stringify({ apiBase: API_BASE, checks, pass: failed.length === 0 }, null, 2))
  if (failed.length) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
