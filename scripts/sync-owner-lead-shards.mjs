#!/usr/bin/env node
/**
 * Merge monolith user_leads into per-owner shards (preserves photos via mergeLeadPair).
 *
 *   OWNER_UID=firebase-uid node scripts/sync-owner-lead-shards.mjs
 *   node scripts/sync-owner-lead-shards.mjs   # all owners
 */
import { createClient } from 'redis'
import { mergeLeadsByUpdatedAt } from '../api/_lib/leadRepo.js'
import { writeLeadEntities } from '../api/_lib/entityLeadStore.js'
import { bumpUserDataVersions, DATAVER_LEADS } from '../api/_lib/dataVersion.js'
import { getAllTeams } from '../api/_lib/teams.js'
import { collectAffectedUidsForResource } from '../api/_lib/shareIndex.js'

const ownerFilter = String(process.env.OWNER_UID || '').trim()

const client = createClient({ url: process.env.REDIS_URL })
await client.connect()

const raw = await client.get('user_leads')
const leads = typeof raw === 'string' ? JSON.parse(raw) : raw || []
const byOwner = new Map()
for (const lead of leads) {
  if (!lead?.ownerId) continue
  if (ownerFilter && lead.ownerId !== ownerFilter) continue
  if (!byOwner.has(lead.ownerId)) byOwner.set(lead.ownerId, [])
  byOwner.get(lead.ownerId).push(lead)
}

const report = []
const bumpUids = new Set()
const allTeams = await getAllTeams()
let monolith = [...leads]
for (const [ownerId, monoLeads] of byOwner) {
  const shardRaw = await client.get(`leads:${ownerId}`)
  const shardLeads = typeof shardRaw === 'string' ? JSON.parse(shardRaw) : shardRaw || []
  const monoPhotos = monoLeads.reduce((n, l) => n + (l.photos || []).length, 0)
  const shardPhotosBefore = shardLeads.reduce((n, l) => n + (l.photos || []).length, 0)
  const merged = mergeLeadsByUpdatedAt(monoLeads, shardLeads)
  const shardPhotosAfter = merged.reduce((n, l) => n + (l.photos || []).length, 0)
  const mergedById = new Map(merged.map((l) => [l.id, l]))
  monolith = monolith.map((l) => (l.ownerId === ownerId ? (mergedById.get(l.id) || l) : l))
  await client.set(`leads:${ownerId}`, JSON.stringify(merged))
  await writeLeadEntities(merged)
  bumpUids.add(ownerId)
  for (const lead of merged) {
    for (const uid of collectAffectedUidsForResource(lead, allTeams)) bumpUids.add(uid)
  }
  report.push({
    ownerId,
    leads: merged.length,
    monoPhotos,
    shardPhotosBefore,
    shardPhotosAfter,
    photosRecovered: Math.max(0, shardPhotosAfter - shardPhotosBefore),
  })
}

await client.set('user_leads', JSON.stringify(monolith))
await bumpUserDataVersions(DATAVER_LEADS, [...bumpUids])

console.log(JSON.stringify({ owners: report.length, bumpedUids: [...bumpUids], report }, null, 2))
await client.quit()
process.exit(0)
