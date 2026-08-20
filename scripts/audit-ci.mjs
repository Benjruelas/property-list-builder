#!/usr/bin/env node
/**
 * CI security gate: `npm audit` with documented exceptions.
 *
 * Runs `npm audit --json`, then fails only when a HIGH or CRITICAL advisory is
 * present that is NOT listed in scripts/audit-allowlist.json. This preserves the
 * intent of `npm audit --audit-level=high` (block on new high/critical issues)
 * while allowing a curated, justified set of known advisories that currently
 * have no safe upstream fix.
 *
 * Exit codes: 0 = clean or fully allowlisted, 1 = un-triaged high/critical found
 * (or audit failed to run).
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BLOCKING = new Set(['high', 'critical'])

function loadAllowlist() {
  try {
    const raw = readFileSync(path.join(__dirname, 'audit-allowlist.json'), 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed.allow === 'object' ? parsed.allow : {}
  } catch (err) {
    console.error(`[audit-ci] Could not read audit-allowlist.json: ${err.message}`)
    return {}
  }
}

function runAudit() {
  const res = spawnSync('npm', ['audit', '--json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  // `npm audit` exits non-zero when vulnerabilities exist; that is expected and
  // not an error for us. A missing/garbled payload, however, is a real failure.
  if (!res.stdout) {
    console.error('[audit-ci] npm audit produced no output.')
    if (res.stderr) console.error(res.stderr)
    process.exit(1)
  }
  try {
    return JSON.parse(res.stdout)
  } catch (err) {
    console.error(`[audit-ci] Failed to parse npm audit JSON: ${err.message}`)
    process.exit(1)
  }
}

function collectBlockingAdvisories(report) {
  // npm audit v2 JSON: vulnerabilities[pkg].via[] contains either strings
  // (package names) or advisory objects with { url, severity, title, name }.
  const found = new Map()
  for (const vuln of Object.values(report.vulnerabilities || {})) {
    for (const via of vuln.via || []) {
      if (typeof via !== 'object' || !via.url) continue
      if (!BLOCKING.has(via.severity)) continue
      const id = (via.url.match(/GHSA-[a-z0-9-]+/i) || [])[0]
      if (id) found.set(id, { severity: via.severity, name: via.name, title: via.title })
    }
  }
  return found
}

const allow = loadAllowlist()
const report = runAudit()
const blocking = collectBlockingAdvisories(report)

const exempted = []
const violations = []
for (const [id, info] of blocking) {
  if (id in allow) exempted.push({ id, ...info })
  else violations.push({ id, ...info })
}

if (exempted.length) {
  console.log(`[audit-ci] ${exempted.length} high/critical advisory(ies) accepted via documented exceptions:`)
  for (const a of exempted) console.log(`  - ${a.id} [${a.severity}] ${a.name}: ${a.title}`)
}

if (violations.length) {
  console.error(`\n[audit-ci] ${violations.length} un-triaged high/critical advisory(ies) found:`)
  for (const a of violations) console.error(`  - ${a.id} [${a.severity}] ${a.name}: ${a.title}`)
  console.error('\nFix the dependency, or add the GHSA id with a justification to scripts/audit-allowlist.json.')
  process.exit(1)
}

console.log(`\n[audit-ci] OK — no un-triaged high/critical advisories.`)
process.exit(0)
