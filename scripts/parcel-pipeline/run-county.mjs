#!/usr/bin/env node
/**
 * End-to-end county pipeline: download → normalize → tile → upload → report.
 */
import { spawnSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseArgs, countyWorkDir } from './lib/paths.mjs'
import { getLocalCounty } from './lib/catalogLocal.mjs'
import { apiConfigured, apiGetCounty, apiReport } from './lib/apiClient.mjs'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function runStep(script, fips) {
  const scriptPath = path.join(__dirname, script)
  console.log(`\n=== ${script} --fips=${fips} ===`)
  const r = spawnSync(process.execPath, [scriptPath, `--fips=${fips}`], {
    stdio: 'inherit',
    env: process.env,
  })
  if (r.status !== 0) {
    const err = new Error(`${script} failed with exit ${r.status}`)
    err.exitCode = r.status || 1
    throw err
  }
}

async function resolveCounty(fips) {
  if (apiConfigured()) {
    try {
      return await apiGetCounty(fips)
    } catch {
      /* local */
    }
  }
  return getLocalCounty(fips)
}

async function main() {
  const args = parseArgs()
  const fips = String(args.fips || args._[0] || '').padStart(5, '0')
  const skipUpload = Boolean(args['skip-upload'])
  const skipReport = Boolean(args['skip-report'])

  if (!fips || fips === '00000') {
    console.error('Usage: run-county.mjs --fips=48439 [--skip-upload] [--skip-report]')
    process.exit(1)
  }

  const county = await resolveCounty(fips)
  if (!county) {
    console.error(`Unknown county ${fips}`)
    process.exit(1)
  }

  if (!county.source?.url || county.source.type === 'none') {
    if (apiConfigured() && !skipReport) {
      await apiReport({
        fips,
        status: 'no_public_source',
        error: 'No source URL configured',
        claimedBy: process.env.PARCEL_PIPELINE_AGENT || 'cli',
      })
    }
    console.error(`County ${fips} has no source — reported no_public_source`)
    process.exit(2)
  }

  try {
    runStep('download-county.mjs', fips)
    runStep('normalize-county.mjs', fips)
    runStep('tile-county.mjs', fips)
    if (!skipUpload) runStep('upload-county-tiles.mjs', fips)

    const dir = countyWorkDir(fips)
    const downloadMeta = JSON.parse(fs.readFileSync(path.join(dir, 'download-meta.json'), 'utf8'))
    const uploadMeta = fs.existsSync(path.join(dir, 'upload-meta.json'))
      ? JSON.parse(fs.readFileSync(path.join(dir, 'upload-meta.json'), 'utf8'))
      : { tileCount: 0 }

    if (apiConfigured() && !skipReport) {
      await apiReport({
        fips,
        status: 'complete',
        stats: {
          featureCount: downloadMeta.featureCount,
          tileCount: uploadMeta.tileCount,
        },
        source: county.source,
        fieldMap: county.fieldMap,
        claimedBy: process.env.PARCEL_PIPELINE_AGENT || 'cli',
      })
      console.log('[run] reported complete to API')
    } else {
      console.log('[run] complete (report skipped or API not configured)')
    }
  } catch (err) {
    console.error('[run] failed:', err.message)
    if (apiConfigured() && !skipReport) {
      try {
        await apiReport({
          fips,
          status: 'failed',
          error: err.message,
          claimedBy: process.env.PARCEL_PIPELINE_AGENT || 'cli',
        })
      } catch (reportErr) {
        console.error('[run] failed to report error:', reportErr.message)
      }
    }
    process.exit(err.exitCode || 1)
  }
}

main()
