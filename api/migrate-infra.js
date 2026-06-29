/**
 * Admin-only infra migration: backfill lead/pipeline shards.
 * Requires Authorization + MIGRATE_SECRET header matching env MIGRATE_SECRET.
 */

import { authenticate } from './lib/auth.js'
import { backfillLeadShards } from './lib/leadRepo.js'
import { backfillPipelineShards } from './lib/pipelineRepo.js'

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
