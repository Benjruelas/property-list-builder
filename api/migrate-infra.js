/**
 * Admin-only infra migration: backfill lead/pipeline shards.
 * Requires Authorization + MIGRATE_SECRET header matching env MIGRATE_SECRET.
 */

import { authenticate } from './_lib/auth.js'
import { backfillLeadShards } from './_lib/leadRepo.js'
import { backfillPipelineShards } from './_lib/pipelineRepo.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Migrate-Secret')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const secret = process.env.MIGRATE_SECRET
  const provided = req.headers['x-migrate-secret']
  if (!secret || provided !== secret) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const { user } = await authenticate(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  // Restrict to an explicit admin allowlist so a leaked MIGRATE_SECRET plus any
  // valid user session cannot rewrite production KV layout.
  const adminList = String(process.env.MIGRATE_ADMIN_UIDS || process.env.ADMIN_UIDS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  if (adminList.length > 0) {
    const uid = String(user.uid || '').toLowerCase()
    const email = String(user.email || '').toLowerCase()
    if (!adminList.includes(uid) && !adminList.includes(email)) {
      return res.status(403).json({ error: 'Forbidden' })
    }
  } else if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
    // In production, refuse to run without an explicit admin allowlist configured.
    return res.status(403).json({ error: 'Admin allowlist not configured' })
  }

  const target = String(req.body?.target || 'all')
  try {
    const result = {}
    if (target === 'all' || target === 'leads') {
      result.leads = await backfillLeadShards()
    }
    if (target === 'all' || target === 'pipelines') {
      result.pipelines = await backfillPipelineShards()
    }
    return res.status(200).json({ ok: true, ...result })
  } catch (err) {
    console.error('migrate-infra error', err)
    return res.status(500).json({ error: err.message })
  }
}
