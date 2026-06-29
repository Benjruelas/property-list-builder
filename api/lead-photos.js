import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { authenticate } from './lib/auth.js'
import {
  getLeadWithAccess,
  mutateSingleLead,
  canMutateLeadPhotos,
  withRepairedLeadOwnership,
} from './lib/leadAccess.js'
import {
  ENTITY_STORAGE_LIMITS,
  MAX_SINGLE_UPLOAD_BYTES,
  entityStorageError,
  formatStorageBytes,
  sumLeadPhotoBytes,
} from './lib/uploadLimits.js'
import {
  presignedPhotosEnabled,
  createPresignedPutUrl,
  createPresignedGetUrl,
} from './lib/photoPresign.js'

/**
 * Lead photo upload/download via R2.
 * POST: upload original + thumbnail, append to lead.photos
 * PATCH: update annotations / annotated image
 * GET: ?key=lead-photos/... (or 302 redirect when presigned enabled)
 * DELETE: remove photo from R2 + lead.photos
 */

let _s3
function s3() {
  if (_s3) return _s3
  _s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  })
  return _s3
}

function sanitizeId(v) {
  return String(v || '').replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 80)
}

function decodeBase64(fileBase64, maxBytes = MAX_SINGLE_UPLOAD_BYTES) {
  const cleaned = String(fileBase64 || '').replace(/^data:[^;]+;base64,/, '')
  try {
    const buf = Buffer.from(cleaned, 'base64')
    if (!buf.length || buf.length > maxBytes) return null
    return buf
  } catch {
    return null
  }
}

function photoKey(ownerUid, leadId, photoId, variant) {
  return `lead-photos/${ownerUid}/${leadId}/${photoId}/${variant}.jpg`
}

async function canAccessPhotoKey(user, key) {
  if (!key.startsWith('lead-photos/')) return false
  const parts = key.split('/')
  const ownerUid = parts[1]
  const leadId = parts[2]
  if (ownerUid === user.uid) return true
  const { lead, access } = await getLeadWithAccess(user, leadId)
  return !!lead && !!access
}

function buildPhotoRecord(body, user, lead, photoId, key, thumbnailKey, sizes) {
  const now = new Date().toISOString()
  return {
    id: photoId,
    key,
    thumbnailKey: thumbnailKey || key,
    annotatedKey: null,
    contentType: body.contentType || 'image/jpeg',
    size: sizes.original,
    thumbnailSize: sizes.thumbnail,
    width: body.width ?? null,
    height: body.height ?? null,
    capturedAt: body.capturedAt || now,
    capturedByUid: user.uid,
    capturedByName: String(body.capturedByName || '').slice(0, 120) || null,
    lat: body.lat ?? null,
    lng: body.lng ?? null,
    addressLabel: String(body.addressLabel || '').slice(0, 300) || null,
    parcelId: body.parcelId ? sanitizeId(body.parcelId) : null,
    annotations: { version: 1, objects: [] },
    createdAt: now,
    updatedAt: now,
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: '14mb' } },
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { user } = await authenticate(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  try {
    if (req.method === 'POST') {
      const body = req.body || {}
      const leadId = sanitizeId(body.leadId)
      if (!leadId) return res.status(400).json({ error: 'leadId is required' })

      const { lead, access } = await getLeadWithAccess(user, leadId)
      if (!lead) return res.status(404).json({ error: 'Lead not found' })
      if (!canMutateLeadPhotos(user, lead, access)) return res.status(403).json({ error: 'No permission to add photos' })

      const photos = Array.isArray(lead.photos) ? lead.photos : []
      const ownerUid = lead.ownerId || user.uid
      const photoId = body.photoId
        ? sanitizeId(body.photoId)
        : `photo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

      // Presign: return upload URLs without storing yet
      if (req.query?.presign === '1' || body.presign) {
        if (!presignedPhotosEnabled()) {
          return res.status(400).json({ error: 'Presigned uploads are not enabled' })
        }
        const key = photoKey(ownerUid, leadId, photoId, 'original')
        const thumbnailKey = photoKey(ownerUid, leadId, photoId, 'thumb')
        const [uploadUrl, thumbnailUploadUrl] = await Promise.all([
          createPresignedPutUrl(key, body.contentType || 'image/jpeg'),
          createPresignedPutUrl(thumbnailKey, 'image/jpeg'),
        ])
        return res.status(200).json({
          photoId,
          key,
          thumbnailKey,
          uploadUrl,
          thumbnailUploadUrl,
        })
      }

      // Metadata-only record after client uploaded via presigned URLs
      if (body.recordOnly && body.key) {
        const key = String(body.key)
        const thumbnailKey = String(body.thumbnailKey || key)
        const newBytes = (Number(body.size) || 0) + (Number(body.thumbnailSize) || 0)
        if (sumLeadPhotoBytes(photos) + newBytes > ENTITY_STORAGE_LIMITS.lead) {
          return res.status(413).json({ error: entityStorageError('lead', ENTITY_STORAGE_LIMITS.lead) })
        }
        const photoRecord = buildPhotoRecord(body, user, lead, photoId, key, thumbnailKey, {
          original: Number(body.size) || 0,
          thumbnail: Number(body.thumbnailSize) || 0,
        })
        const updatedLead = await mutateSingleLead(leadId, (existing) =>
          withRepairedLeadOwnership({
            ...existing,
            ownerId: existing.ownerId || user.uid,
            ownerEmail: existing.ownerEmail || user.email || null,
            photos: [...(existing.photos || []), photoRecord],
            updatedAt: new Date().toISOString(),
          }, user))
        if (!updatedLead) return res.status(404).json({ error: 'Lead not found' })
        return res.status(200).json({ photo: photoRecord, lead: updatedLead })
      }

      const originalBuf = decodeBase64(body.fileBase64)
      if (!originalBuf) {
        return res.status(400).json({
          error: `Invalid or oversized image (max ${formatStorageBytes(MAX_SINGLE_UPLOAD_BYTES)} per upload)`,
        })
      }

      const thumbBuf = body.thumbnailBase64 ? decodeBase64(body.thumbnailBase64) : null
      const newBytes = originalBuf.length + (thumbBuf?.length || 0)
      if (sumLeadPhotoBytes(photos) + newBytes > ENTITY_STORAGE_LIMITS.lead) {
        return res.status(413).json({ error: entityStorageError('lead', ENTITY_STORAGE_LIMITS.lead) })
      }
      const key = photoKey(ownerUid, leadId, photoId, 'original')
      const thumbnailKey = photoKey(ownerUid, leadId, photoId, 'thumb')

      await s3().send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: originalBuf,
        ContentType: body.contentType || 'image/jpeg',
      }))

      if (thumbBuf) {
        await s3().send(new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: thumbnailKey,
          Body: thumbBuf,
          ContentType: 'image/jpeg',
        }))
      }

      const photoRecord = buildPhotoRecord(body, user, lead, photoId, key, thumbBuf ? thumbnailKey : key, {
        original: originalBuf.length,
        thumbnail: thumbBuf?.length || 0,
      })

      const updatedLead = await mutateSingleLead(leadId, (existing) =>
        withRepairedLeadOwnership({
          ...existing,
          ownerId: existing.ownerId || user.uid,
          ownerEmail: existing.ownerEmail || user.email || null,
          photos: [...(existing.photos || []), photoRecord],
          updatedAt: new Date().toISOString(),
        }, user))
      if (!updatedLead) return res.status(404).json({ error: 'Lead not found' })

      return res.status(200).json({ photo: photoRecord, lead: updatedLead })
    }

    if (req.method === 'PATCH') {
      const body = req.body || {}
      const leadId = sanitizeId(body.leadId)
      const photoId = sanitizeId(body.photoId)
      if (!leadId || !photoId) return res.status(400).json({ error: 'leadId and photoId are required' })

      const { lead, access } = await getLeadWithAccess(user, leadId)
      if (!lead) return res.status(404).json({ error: 'Lead not found' })

      const photos = Array.isArray(lead.photos) ? [...lead.photos] : []
      const pIdx = photos.findIndex((p) => p.id === photoId)
      if (pIdx === -1) return res.status(404).json({ error: 'Photo not found' })

      if (!canMutateLeadPhotos(user, lead, access, photos[pIdx])) {
        return res.status(403).json({ error: 'No permission to edit photos' })
      }

      const existing = photos[pIdx]
      const ownerUid = lead.ownerId || user.uid
      const now = new Date().toISOString()
      let annotatedKey = existing.annotatedKey
      let annotatedSize = existing.annotatedSize || 0
      let annotatedThumbnailKey = existing.annotatedThumbnailKey || null
      let annotatedThumbnailSize = existing.annotatedThumbnailSize || 0

      if (body.annotatedBase64) {
        const annBuf = decodeBase64(body.annotatedBase64)
        if (!annBuf) return res.status(400).json({ error: 'Invalid annotated image' })
        const thumbBuf = body.annotatedThumbnailBase64
          ? decodeBase64(body.annotatedThumbnailBase64, 512 * 1024)
          : null
        const oldAnnotatedBytes = (Number(existing.annotatedSize) || 0) + (Number(existing.annotatedThumbnailSize) || 0)
        const newAnnotatedBytes = annBuf.length + (thumbBuf?.length || 0)
        const withoutAnnotated = sumLeadPhotoBytes(photos) - oldAnnotatedBytes
        if (withoutAnnotated + newAnnotatedBytes > ENTITY_STORAGE_LIMITS.lead) {
          return res.status(413).json({ error: entityStorageError('lead', ENTITY_STORAGE_LIMITS.lead) })
        }
        annotatedKey = photoKey(ownerUid, leadId, photoId, 'annotated')
        annotatedSize = annBuf.length
        await s3().send(new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: annotatedKey,
          Body: annBuf,
          ContentType: 'image/jpeg',
        }))
        if (thumbBuf) {
          annotatedThumbnailKey = photoKey(ownerUid, leadId, photoId, 'annotated-thumb')
          annotatedThumbnailSize = thumbBuf.length
          await s3().send(new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: annotatedThumbnailKey,
            Body: thumbBuf,
            ContentType: 'image/jpeg',
          }))
        }
      } else if (body.clearAnnotated) {
        annotatedSize = 0
        annotatedThumbnailSize = 0
        annotatedThumbnailKey = null
      }

      const updatedPhoto = {
        ...existing,
        annotations: body.annotations !== undefined ? body.annotations : existing.annotations,
        annotatedKey: body.annotatedBase64 ? annotatedKey : (body.clearAnnotated ? null : existing.annotatedKey),
        annotatedSize,
        annotatedThumbnailKey: body.annotatedBase64
          ? annotatedThumbnailKey
          : (body.clearAnnotated ? null : existing.annotatedThumbnailKey),
        annotatedThumbnailSize: body.annotatedBase64
          ? annotatedThumbnailSize
          : (body.clearAnnotated ? 0 : existing.annotatedThumbnailSize),
        updatedAt: now,
      }

      const updatedLead = await mutateSingleLead(leadId, (prev) => {
        const list = [...(prev.photos || [])]
        const at = list.findIndex((p) => p.id === photoId)
        if (at === -1) return null
        list[at] = updatedPhoto
        return { ...prev, photos: list, updatedAt: now }
      })
      if (!updatedLead) return res.status(404).json({ error: 'Lead not found' })

      return res.status(200).json({ photo: updatedPhoto, lead: updatedLead })
    }

    if (req.method === 'GET') {
      const key = String(req.query.key || '')
      if (!key) return res.status(400).json({ error: 'key is required' })
      if (!key.startsWith('lead-photos/')) return res.status(400).json({ error: 'Malformed key' })

      const allowed = await canAccessPhotoKey(user, key)
      if (!allowed) return res.status(403).json({ error: 'Forbidden' })

      if (presignedPhotosEnabled() && req.query.redirect !== '0') {
        const url = await createPresignedGetUrl(key)
        res.setHeader('Cache-Control', 'private, max-age=60')
        return res.redirect(302, url)
      }

      try {
        const r = await s3().send(new GetObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: key,
        }))
        const chunks = []
        for await (const c of r.Body) chunks.push(c)
        const body = Buffer.concat(chunks)
        res.setHeader('Content-Type', r.ContentType || 'image/jpeg')
        res.setHeader('Cache-Control', 'private, max-age=300')
        return res.status(200).send(body)
      } catch (e) {
        if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) {
          return res.status(404).json({ error: 'File not found' })
        }
        throw e
      }
    }

    if (req.method === 'DELETE') {
      const body = req.body || {}
      const leadId = sanitizeId(body.leadId)
      const photoId = sanitizeId(body.photoId)
      if (!leadId || !photoId) return res.status(400).json({ error: 'leadId and photoId are required' })

      const { lead, access } = await getLeadWithAccess(user, leadId)
      if (!lead) return res.status(404).json({ error: 'Lead not found' })

      const photos = Array.isArray(lead.photos) ? lead.photos : []
      const photo = photos.find((p) => p.id === photoId)
      if (!photo) return res.status(404).json({ error: 'Photo not found' })

      if (!canMutateLeadPhotos(user, lead, access, photo)) {
        const message = access === 'admin_view'
          ? 'This private lead is view-only. You can delete photos you captured, but not photos added by the lead owner.'
          : 'No permission to delete photos'
        return res.status(403).json({ error: message })
      }

      for (const k of [photo.key, photo.thumbnailKey, photo.annotatedKey, photo.annotatedThumbnailKey].filter(Boolean)) {
        try {
          await s3().send(new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: k,
          }))
        } catch (e) {
          if (e.name !== 'NoSuchKey') console.warn('delete photo key', k, e.message)
        }
      }

      const updatedLead = await mutateSingleLead(leadId, (existing) =>
        withRepairedLeadOwnership({
          ...existing,
          photos: (existing.photos || []).filter((p) => p.id !== photoId),
          updatedAt: new Date().toISOString(),
        }, user))
      if (!updatedLead) return res.status(404).json({ error: 'Lead not found' })

      return res.status(200).json({ lead: updatedLead })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('lead-photos error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
