#!/usr/bin/env node
/**
 * Remove all leads for an owner from monolith, shards, and entity index.
 * Does NOT delete R2 photo blobs (use when purging duplicate dev imports).
 *
 *   OWNER_UID=dev-local DRY_RUN=0 node scripts/purge-owner-leads.mjs
 */
import { createClient } from 'redis'
import { bumpUserDataVersions, DATAVER_LEADS } from '../api/_lib/dataVersion.js'
import { getAllTeams } from '../api/_lib/teams.js'
import { collectAffectedUidsForResource } from '../api/_lib/shareIndex.js'

const ownerUid = String(process.env.OWNER_UID || '').trim()
if (!ownerUid) {
  console.error('Set OWNER_UID to purge leads for that owner.')
  process.exit(1)
}
const dryRun = process.env.DRY_RUN !== '0' && process.env.DRY_RUN !== 'false'

const client = createClient({ url: process.env.REDIS_URL })
await client.connect()

const raw = await client.get('user_leads')
const all = typeof raw === 'string' ? JSON.parse(raw) : raw || []
const toRemove = all.filter((l) => l.ownerId === ownerUid)
const removeIds = new Set(toRemove.map((l) => l.id))
const nextAll = all.filter((l) => l.ownerId !== ownerUid)

const bumpUids = new Set([ownerUid])
const allTeams = await getAllTeams()
for (const lead of toRemove) {
  for (const uid of collectAffectedUidsForResource(lead, allTeams)) bumpUids.add(uid)
}

const report = {
  ownerUid,
  dryRun,
  removedLeads: toRemove.length,
  monolithBefore: all.length,
  monolithAfter: nextAll.length,
}

if (!dryRun && toRemove.length) {
  await client.set('user_leads', JSON.stringify(nextAll))
  await client.del(`leads:${ownerUid}`)
  for (const id of removeIds) {
    await client.del(`lead-entity:${id}`)
    await client.del(`lead-index:${id}`)
  }
  // Drop this owner from every collaborator shared-leads set.
  const sharedKeys = await client.keys('shared-leads:*')
  for (const key of sharedKeys) {
    await client.sRem(key, ownerUid)
  }
  await client.del(`shared-leads:${ownerUid}`)
  await bumpUserDataVersions(DATAVER_LEADS, [...bumpUids])
}

console.log(JSON.stringify({ ...report, bumpedUids: [...bumpUids] }, null, 2))
await client.quit()
process.exit(0)
