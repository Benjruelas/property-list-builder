/**
 * Rebuild lead.photos[] from objects still present in R2/local photo storage.
 * Keys: lead-photos/{ownerUid}/{leadId}/{photoId}/{original|thumbnail|annotated}.jpg
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { presignedPhotosEnabled } from './photoPresign.js'
import { getLeadEntity } from './entityLeadStore.js'
import { mutateSingleLead } from './leadStore.js'
import { localPhotoStorageEnabled, readLocalPhotoBlob } from './photoBlobStore.js'

const LOCAL_ROOT = path.join(process.cwd(), '.local-dev-data', 'photo-blobs')
const VARIANTS = new Set(['original', 'thumbnail', 'annotated'])

function r2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  })
}

export function parseLeadPhotoKey(key) {
  const parts = String(key || '').split('/').filter(Boolean)
  if (parts[0] !== 'lead-photos' || parts.length < 5) return null
  const [, ownerUid, leadId, photoId] = parts
  const variant = parts[4].replace(/\.jpg$/i, '')
  if (!VARIANTS.has(variant)) return null
  if (!ownerUid || !leadId || !photoId) return null
  return { ownerUid, leadId, photoId, variant, key: parts.join('/') }
}

function emptyPhotoGroup(ownerUid, leadId, photoId) {
  return {
    ownerUid,
    leadId,
    photoId,
    original: null,
    thumbnail: null,
    annotated: null,
    originalSize: 0,
    thumbnailSize: 0,
    annotatedSize: 0,
    lastModified: null,
  }
}

export function indexLeadPhotoObjects(objects = []) {
  const groups = new Map()
  for (const obj of objects) {
    const parsed = parseLeadPhotoKey(obj.key)
    if (!parsed) continue
    const id = `${parsed.ownerUid}/${parsed.leadId}/${parsed.photoId}`
    const group = groups.get(id) || emptyPhotoGroup(parsed.ownerUid, parsed.leadId, parsed.photoId)
    group[parsed.variant] = parsed.key
    const size = Number(obj.size) || 0
    if (parsed.variant === 'original') group.originalSize = size
    if (parsed.variant === 'thumbnail') group.thumbnailSize = size
    if (parsed.variant === 'annotated') group.annotatedSize = size
    if (obj.lastModified) {
      const ts = new Date(obj.lastModified).getTime()
      if (!group.lastModified || ts > new Date(group.lastModified).getTime()) {
        group.lastModified = new Date(obj.lastModified).toISOString()
      }
    }
    groups.set(id, group)
  }
  return groups
}

function buildRestoredPhotoRecord(group) {
  if (!group.original && !group.thumbnail && !group.annotated) return null
  const key = group.original || group.thumbnail || group.annotated
  const thumbnailKey = group.thumbnail || group.original || key
  const capturedAt = group.lastModified || new Date().toISOString()
  const record = {
    id: group.photoId,
    key,
    thumbnailKey,
    annotatedKey: group.annotated || null,
    contentType: 'image/jpeg',
    size: group.originalSize || group.thumbnailSize || 0,
    thumbnailSize: group.thumbnailSize || group.originalSize || 0,
    width: null,
    height: null,
    blurHash: null,
    capturedAt,
    capturedByUid: group.ownerUid,
    capturedByName: null,
    lat: null,
    lng: null,
    addressLabel: null,
    parcelId: null,
    annotations: { version: 1, objects: [] },
    createdAt: capturedAt,
    updatedAt: capturedAt,
    restoredFromStorage: true,
  }
  if (group.annotated) {
    record.annotatedSize = group.annotatedSize || 0
  }
  return record
}

async function listR2LeadPhotoObjects({ ownerUid } = {}) {
  if (!presignedPhotosEnabled()) return []
  const client = r2Client()
  const prefix = ownerUid ? `lead-photos/${ownerUid}/` : 'lead-photos/'
  const objects = []
  let continuationToken
  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET_NAME,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }))
    for (const item of page.Contents || []) {
      if (!item.Key) continue
      objects.push({
        key: item.Key,
        size: item.Size || 0,
        lastModified: item.LastModified || null,
      })
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (continuationToken)
  return objects
}

async function walkLocalPhotoKeys(dir, base = '') {
  const entries = []
  let names = []
  try {
    names = await fs.readdir(dir)
  } catch {
    return entries
  }
  for (const name of names) {
    const full = path.join(dir, name)
    const rel = base ? `${base}/${name}` : name
    const stat = await fs.stat(full)
    if (stat.isDirectory()) {
      entries.push(...await walkLocalPhotoKeys(full, rel))
      continue
    }
    if (!name.endsWith('.jpg')) continue
    entries.push({
      key: rel.replace(/\\/g, '/'),
      size: stat.size,
      lastModified: stat.mtime,
    })
  }
  return entries
}

async function listLocalLeadPhotoObjects({ ownerUid } = {}) {
  if (!localPhotoStorageEnabled()) return []
  const root = ownerUid ? path.join(LOCAL_ROOT, 'lead-photos', ownerUid) : path.join(LOCAL_ROOT, 'lead-photos')
  const keys = await walkLocalPhotoKeys(root, ownerUid ? `lead-photos/${ownerUid}` : 'lead-photos')
  return keys
}

export async function listStoredLeadPhotoObjects({ ownerUid } = {}) {
  const [remote, local] = await Promise.all([
    listR2LeadPhotoObjects({ ownerUid }),
    listLocalLeadPhotoObjects({ ownerUid }),
  ])
  const byKey = new Map()
  for (const obj of [...remote, ...local]) {
    byKey.set(obj.key, obj)
  }
  return [...byKey.values()]
}

function photosMissingFromLead(lead, groupsForLead) {
  const existingIds = new Set((lead.photos || []).map((p) => p.id))
  const existingKeys = new Set((lead.photos || []).map((p) => p.key).filter(Boolean))
  const missing = []
  for (const group of groupsForLead) {
    const record = buildRestoredPhotoRecord(group)
    if (!record) continue
    if (existingIds.has(record.id)) continue
    if (record.key && existingKeys.has(record.key)) continue
    missing.push(record)
  }
  missing.sort((a, b) => String(a.capturedAt).localeCompare(String(b.capturedAt)))
  return missing
}

function groupObjectsByLead(groups) {
  const byLead = new Map()
  for (const group of groups.values()) {
    const leadId = group.leadId
    if (!byLead.has(leadId)) byLead.set(leadId, [])
    byLead.get(leadId).push(group)
  }
  return byLead
}

/**
 * Scan storage and reattach missing photo records to leads.
 *
 * @param {{ ownerUid: string, dryRun?: boolean, leadIds?: string[]|null }} opts
 */
export async function restoreLeadPhotosForOwner({ ownerUid, dryRun = true, leadIds = null } = {}) {
  if (!ownerUid) throw new Error('ownerUid is required')

  const objects = await listStoredLeadPhotoObjects({ ownerUid })
  const groups = indexLeadPhotoObjects(objects)
  const byLead = groupObjectsByLead(groups)

  const targetLeadIds = leadIds?.length
    ? leadIds.map(String)
    : [...byLead.keys()]

  const report = {
    ownerUid,
    dryRun: !!dryRun,
    scannedObjects: objects.length,
    leadsInspected: 0,
    leadsUpdated: 0,
    photosRestored: 0,
    orphanedLeadIds: [],
    details: [],
  }

  for (const leadId of targetLeadIds) {
    const groupsForLead = byLead.get(leadId) || []
    if (!groupsForLead.length) continue

    const lead = await getLeadEntity(leadId)
    if (!lead) {
      report.orphanedLeadIds.push({
        leadId,
        photoCount: groupsForLead.length,
        photoIds: groupsForLead.map((g) => g.photoId),
      })
      continue
    }

    if (lead.ownerId && lead.ownerId !== ownerUid) {
      report.details.push({
        leadId,
        skipped: true,
        reason: `Lead owned by ${lead.ownerId}, not ${ownerUid}`,
      })
      continue
    }

    report.leadsInspected += 1
    const missing = photosMissingFromLead(lead, groupsForLead)
    if (!missing.length) {
      report.details.push({ leadId, restored: 0, skipped: true, reason: 'Photos already present' })
      continue
    }

    if (dryRun) {
      report.leadsUpdated += 1
      report.photosRestored += missing.length
      report.details.push({
        leadId,
        restored: missing.length,
        photoIds: missing.map((p) => p.id),
        dryRun: true,
      })
      continue
    }

    const updated = await mutateSingleLead(leadId, (existing) => ({
      ...existing,
      photos: [...(existing.photos || []), ...missing],
      updatedAt: new Date().toISOString(),
    }))

    if (!updated) {
      report.details.push({ leadId, restored: 0, error: 'Lead not found during write' })
      continue
    }

    report.leadsUpdated += 1
    report.photosRestored += missing.length
    report.details.push({
      leadId,
      restored: missing.length,
      photoIds: missing.map((p) => p.id),
    })
  }

  return report
}

/** Dev helper: confirm a blob exists before reporting it restorable. */
export async function photoBlobExists(key) {
  if (await readLocalPhotoBlob(key)) return true
  if (!presignedPhotosEnabled()) return false
  const objects = await listR2LeadPhotoObjects({})
  return objects.some((obj) => obj.key === key)
}
