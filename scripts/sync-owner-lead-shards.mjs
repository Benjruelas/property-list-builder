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
for (const [ownerId, monoLeads] of byOwner) {
  const shardRaw = await client.get(`leads:${ownerId}`)
  const shardLeads = typeof shardRaw === 'string' ? JSON.parse(shardRaw) : shardRaw || []
  const monoPhotos = monoLeads.reduce((n, l) => n + (l.photos || []).length, 0)
  const shardPhotosBefore = shardLeads.reduce((n, l) => n + (l.photos || []).length, 0)
  const merged = mergeLeadsByUpdatedAt(monoLeads, shardLeads)
  const shardPhotosAfter = merged.reduce((n, l) => n + (l.photos || []).length, 0)
  await client.set(`leads:${ownerId}`, JSON.stringify(merged))
  await writeLeadEntities(merged)
  report.push({
    ownerId,
    leads: merged.length,
    monoPhotos,
    shardPhotosBefore,
    shardPhotosAfter,
    photosRecovered: Math.max(0, shardPhotosAfter - shardPhotosBefore),
  })
}

console.log(JSON.stringify({ owners: report.length, report }, null, 2))
await client.quit()
process.exit(0)
