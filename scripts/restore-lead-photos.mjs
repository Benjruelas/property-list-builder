#!/usr/bin/env node
/**
 * Restore lead photos from R2/local blobs.
 *
 * Dry run (default):
 *   OWNER_UID=your-firebase-uid node scripts/restore-lead-photos.mjs
 *
 * Apply:
 *   OWNER_UID=your-firebase-uid DRY_RUN=0 node scripts/restore-lead-photos.mjs
 *
 * Requires R2_* env vars (and KV if running against production data locally via vercel env pull).
 */
import { restoreLeadPhotosForOwner } from '../api/_lib/restoreLeadPhotos.js'

const ownerUid = String(process.env.OWNER_UID || '').trim()
if (!ownerUid) {
  console.error('Set OWNER_UID to the Firebase uid whose photos should be restored.')
  process.exit(1)
}

const dryRun = process.env.DRY_RUN !== '0' && process.env.DRY_RUN !== 'false'
const leadIds = process.env.LEAD_IDS
  ? process.env.LEAD_IDS.split(',').map((s) => s.trim()).filter(Boolean)
  : null

const report = await restoreLeadPhotosForOwner({ ownerUid, dryRun, leadIds })
console.log(JSON.stringify(report, null, 2))

if (dryRun && report.photosRestored > 0) {
  console.error('\nDry run only. Re-run with DRY_RUN=0 to apply.')
}
