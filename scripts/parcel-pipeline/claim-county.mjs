#!/usr/bin/env node
/**
 * Claim the next county job from the pipeline API (or print local ready county).
 */
import { parseArgs } from './lib/paths.mjs'
import { loadLocalCatalog } from './lib/catalogLocal.mjs'
import { apiConfigured, apiClaim, apiSeed } from './lib/apiClient.mjs'

async function main() {
  const args = parseArgs()
  const claimedBy = args.agent || process.env.PARCEL_PIPELINE_AGENT || 'cli'
  const preferStatus = args.prefer || undefined
  const doSeed = Boolean(args.seed)

  if (apiConfigured()) {
    if (doSeed) {
      const seeded = await apiSeed({ force: Boolean(args.force) })
      console.log(JSON.stringify({ seeded }, null, 2))
      if (args['seed-only'] || args.seedOnly) return
    }
    const result = await apiClaim(claimedBy, preferStatus)
    console.log(JSON.stringify(result, null, 2))
    if (!result.county) process.exit(2)
    return
  }

  const seed = loadLocalCatalog()
  const order = preferStatus === 'needs_source'
    ? ['needs_source', 'ready']
    : ['ready', 'needs_source']
  for (const st of order) {
    const c = seed.counties.find((x) => x.status === st)
    if (c) {
      console.log(
        JSON.stringify(
          {
            county: { ...c, status: 'running', claimedBy, claimedAt: new Date().toISOString() },
            mode: 'local-seed',
            warning: 'API not configured; claim is not durable',
          },
          null,
          2,
        ),
      )
      return
    }
  }
  console.log(JSON.stringify({ county: null, mode: 'local-seed' }, null, 2))
  process.exit(2)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
