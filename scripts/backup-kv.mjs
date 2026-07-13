#!/usr/bin/env node
/**
 * Export critical KV keys to a versioned JSON snapshot.
 * Usage: KV_REST_API_URL=... KV_REST_API_TOKEN=... node scripts/backup-kv.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const KEYS = [
  'user_leads',
  'user_pipelines',
  'user_photo_reports',
  'user_quotes',
  'user_form_templates',
  'user_lists',
  'user_paths',
  'user_tasks',
  'user_teams',
]

async function main() {
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  if (!url || !token) {
    console.error('Set KV_REST_API_URL and KV_REST_API_TOKEN')
    process.exit(1)
  }

  const { kv } = await import('@vercel/kv')
  const snapshot = { at: new Date().toISOString(), keys: {} }

  for (const key of KEYS) {
    try {
      const val = await kv.get(key)
      snapshot.keys[key] = val
      console.log('backed up', key)
    } catch (e) {
      snapshot.keys[key] = { error: e.message }
      console.warn('failed', key, e.message)
    }
  }

  const dir = join(process.cwd(), 'backups')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `kv-${snapshot.at.replace(/[:.]/g, '-')}.json`)
  writeFileSync(file, JSON.stringify(snapshot))
  console.log('wrote', file)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
