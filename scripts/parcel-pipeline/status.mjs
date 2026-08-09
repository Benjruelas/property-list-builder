#!/usr/bin/env node
/**
 * Print pipeline coverage summary (API or local seed defaults).
 */
import { loadLocalCatalog } from './lib/catalogLocal.mjs'
import { apiConfigured, apiSummary } from './lib/apiClient.mjs'
import { STATUSES } from '../../api/_lib/parcelPipeline/constants.js'

async function main() {
  if (apiConfigured()) {
    const summary = await apiSummary()
    console.log(JSON.stringify(summary, null, 2))
    return
  }

  const seed = loadLocalCatalog()
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]))
  for (const c of seed.counties) byStatus[c.status] = (byStatus[c.status] || 0) + 1
  console.log(
    JSON.stringify(
      {
        mode: 'local-seed',
        total: seed.counties.length,
        byStatus,
        completePct: 0,
        note: 'Set PARCEL_PIPELINE_API_BASE + PARCEL_PIPELINE_SECRET for live KV summary',
        seededReady: byStatus.ready,
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
