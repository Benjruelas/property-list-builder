/**
 * Ops API: list/update/seed/claim county parcel pipeline catalog.
 *
 * GET  ?action=list&status=&state=&limit=&offset=
 * GET  ?action=get&fips=
 * GET  ?action=summary
 * POST { action: 'seed'|'claim'|'update', ... }
 */
import { applyCors } from '../_lib/cors.js'
import { isPipelineAuthorized } from '../_lib/parcelPipeline/opsAuth.js'
import {
  ensureCatalogSeeded,
  listCounties,
  getCounty,
  updateCounty,
  claimNextCounty,
  coverageSummary,
} from '../_lib/parcelPipeline/catalog.js'

export default async function handler(req, res) {
  applyCors(req, res, { methods: 'GET, POST, OPTIONS' })
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Parcel-Pipeline-Secret, X-Cron-Secret')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (!isPipelineAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    if (req.method === 'GET') {
      const action = String(req.query.action || 'list')
      if (action === 'summary') {
        return res.status(200).json(await coverageSummary())
      }
      if (action === 'get') {
        const county = await getCounty(req.query.fips)
        if (!county) return res.status(404).json({ error: 'County not found' })
        return res.status(200).json({ county })
      }
      if (action === 'list') {
        const result = await listCounties({
          status: req.query.status || undefined,
          state: req.query.state || undefined,
          limit: Math.min(parseInt(req.query.limit, 10) || 100, 500),
          offset: parseInt(req.query.offset, 10) || 0,
        })
        return res.status(200).json(result)
      }
      return res.status(400).json({ error: 'Unknown action' })
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const body = req.body || {}
    const action = String(body.action || '')

    if (action === 'seed') {
      const result = await ensureCatalogSeeded({ force: body.force === true })
      return res.status(200).json(result)
    }

    if (action === 'claim') {
      const result = await claimNextCounty({
        claimedBy: body.claimedBy || body.agent || 'agent',
        preferStatus: body.preferStatus || undefined,
      })
      if (result.busy) return res.status(409).json({ error: 'Claim lock busy', ...result })
      return res.status(200).json(result)
    }

    if (action === 'update') {
      if (!body.fips) return res.status(400).json({ error: 'fips required' })
      const county = await updateCounty(body.fips, body.patch || body)
      return res.status(200).json({ county })
    }

    return res.status(400).json({ error: 'Unknown action' })
  } catch (err) {
    console.error('parcel-pipeline/counties', err)
    return res.status(500).json({ error: err.message || 'Internal error' })
  }
}
