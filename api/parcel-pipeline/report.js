/**
 * Ops API: report county pipeline job result.
 * POST { fips, status, stats?, source?, fieldMap?, error?, claimedBy? }
 */
import { applyCors } from '../_lib/cors.js'
import { isPipelineAuthorized } from '../_lib/parcelPipeline/opsAuth.js'
import { reportCounty } from '../_lib/parcelPipeline/catalog.js'

export default async function handler(req, res) {
  applyCors(req, res, { methods: 'POST, OPTIONS' })
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Parcel-Pipeline-Secret, X-Cron-Secret')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!isPipelineAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const body = req.body || {}
    if (!body.fips) return res.status(400).json({ error: 'fips required' })
    if (!body.status) return res.status(400).json({ error: 'status required' })

    const result = await reportCounty(body.fips, {
      status: body.status,
      stats: body.stats,
      source: body.source,
      fieldMap: body.fieldMap,
      error: body.error,
      claimedBy: body.claimedBy,
    })
    return res.status(200).json(result)
  } catch (err) {
    console.error('parcel-pipeline/report', err)
    return res.status(400).json({ error: err.message || 'Bad request' })
  }
}
