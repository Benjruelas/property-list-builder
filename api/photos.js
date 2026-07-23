/**
 * Unified photo API for leads and deals — presigned upload only (no base64 POST).
 */

import { S3Client, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { authenticate } from './_lib/auth.js'
import {
  presignedPhotosEnabled,
  createPresignedPutUrl,
  createPresignedGetUrl,
} from './_lib/photoPresign.js'
import {
  entityStorageError,
  formatStorageBytes,
} from './_lib/uploadLimits.js'
import {
  sanitizePhotoId,
  buildPhotoKey,
  parseEntityType,
  storageLimit,
  sumPhotoBytes,
  buildPhotoRecord,
  resolvePhotoContext,
  appendPhotoRecord,
  updatePhotoRecord,
  deletePhotoRecord,
  canAccessPhotoKey,
  photoKeyPrefix,
} from './_lib/photoEntity.js'
import { photoLog, photoLogError } from './_lib/photoDebug.js'
import {
  writeLocalPhotoBlob,
  readLocalPhotoBlob,
  localPhotoBlobExists,
  deleteLocalPhotoBlob,
  localPhotoStorageEnabled,
} from './_lib/photoBlobStore.js'

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

async function objectExists(key) {
  if (await localPhotoBlobExists(key)) return true
  if (!presignedPhotosEnabled()) return false
  try {
    await s3().send(new HeadObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    }))
    return true
  } catch (e) {
    if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) return false
    throw e
  }
}

async function readPhotoBytes(key) {
  const local = await readLocalPhotoBlob(key)
  if (local) return { body: local, contentType: 'image/jpeg' }
  if (!presignedPhotosEnabled()) return null
  const r = await s3().send(new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
  }))
  const chunks = []
  for await (const c of r.Body) chunks.push(c)
  return { body: Buffer.concat(chunks), contentType: r.ContentType || 'image/jpeg' }
}

async function writePhotoBytes(key, buf, contentType = 'image/jpeg') {
  if (presignedPhotosEnabled()) {
    await s3().send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: buf,
      ContentType: contentType,
    }))
  } else if (!localPhotoStorageEnabled()) {
    throw new Error('Photo storage is not configured')
  }
  await writeLocalPhotoBlob(key, buf)
}

function entityResponse(ctx, entity) {
  if (ctx.entityType === 'deal') return { deal: entity }
  return { lead: entity }
}

export const config = {
  api: { bodyParser: { sizeLimit: '6mb' } },
}

function keyMatchesEntity(key, ctx) {
  const prefix = photoKeyPrefix(ctx.entityType)
  if (!key.startsWith(`${prefix}/`)) return false
  const parts = key.split('/')
  return parts[1] === ctx.ownerUid && parts[2] === ctx.entity.id
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { user } = await authenticate(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  try {
    photoLog('request', `${req.method} /api/photos`, {
      action: req.body?.action || req.query?.action,
      entityType: req.body?.entityType,
      leadId: req.body?.leadId,
      dealId: req.body?.dealId,
      key: req.query?.key ? `…${String(req.query.key).slice(-48)}` : undefined,
    })

    if (req.method === 'POST') {
      const body = req.body || {}
      const action = String(body.action || req.query?.action || '').toLowerCase()

      if (action === 'presign' || action === 'presign-annotation') {
        if (!presignedPhotosEnabled() && !localPhotoStorageEnabled()) {
          photoLog('presign', 'Photo storage not configured')
          return res.status(503).json({ error: 'Photo storage is not configured' })
        }

        const ctx = await resolvePhotoContext(user, body)
        if (ctx.error) {
          photoLog('presign', 'Context error', { status: ctx.error.status, error: ctx.error.message })
          return res.status(ctx.error.status).json({ error: ctx.error.message })
        }
        if (!ctx.canAdd()) {
          photoLog('presign', 'Permission denied')
          return res.status(403).json({ error: 'No permission to add photos' })
        }

        const entityType = ctx.entityType
        const entityId = entityType === 'deal' ? ctx.entity.id : ctx.entity.id
        const ownerUid = ctx.ownerUid
        const photoId = body.photoId
          ? sanitizePhotoId(body.photoId)
          : `photo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

        if (action === 'presign-annotation') {
          const presignStarted = Date.now()
          const existingPhotoId = sanitizePhotoId(body.photoId)
          if (!existingPhotoId) return res.status(400).json({ error: 'photoId is required' })
          const annotatedKey = buildPhotoKey(entityType, ownerUid, entityId, existingPhotoId, 'annotated')
          const annotatedThumbnailKey = buildPhotoKey(entityType, ownerUid, entityId, existingPhotoId, 'annotated-thumb')
          let annotatedUploadUrl = ''
          let annotatedThumbnailUploadUrl = ''
          if (presignedPhotosEnabled()) {
            ;[annotatedUploadUrl, annotatedThumbnailUploadUrl] = await Promise.all([
              createPresignedPutUrl(annotatedKey, 'image/jpeg'),
              createPresignedPutUrl(annotatedThumbnailKey, 'image/jpeg'),
            ])
          }
          photoLog('presign-annotation', 'Presigned annotation keys', {
            photoId: existingPhotoId,
            ms: Date.now() - presignStarted,
            entityType,
          })
          return res.status(200).json({
            photoId: existingPhotoId,
            annotatedKey,
            annotatedThumbnailKey,
            annotatedUploadUrl,
            annotatedThumbnailUploadUrl,
          })
        }

        const key = buildPhotoKey(entityType, ownerUid, entityId, photoId, 'original')
        const thumbnailKey = buildPhotoKey(entityType, ownerUid, entityId, photoId, 'thumb')
        let uploadUrl = ''
        let thumbnailUploadUrl = ''
        if (presignedPhotosEnabled()) {
          ;[uploadUrl, thumbnailUploadUrl] = await Promise.all([
            createPresignedPutUrl(key, body.contentType || 'image/jpeg'),
            createPresignedPutUrl(thumbnailKey, 'image/jpeg'),
          ])
        }
        photoLog('presign', 'Presigned URLs created', { photoId, key, entityType })
        return res.status(200).json({
          photoId,
          key,
          thumbnailKey,
          uploadUrl,
          thumbnailUploadUrl,
        })
      }

      if (action === 'upload-bytes') {
        const uploadStarted = Date.now()
        if (!presignedPhotosEnabled() && !localPhotoStorageEnabled()) {
          return res.status(503).json({ error: 'Photo storage is not configured' })
        }
        const ctx = await resolvePhotoContext(user, body)
        if (ctx.error) return res.status(ctx.error.status).json({ error: ctx.error.message })
        if (!ctx.canAdd()) return res.status(403).json({ error: 'No permission to add photos' })

        const key = String(body.key || '')
        if (!key) return res.status(400).json({ error: 'key is required' })
        if (!keyMatchesEntity(key, ctx)) return res.status(403).json({ error: 'Forbidden key' })

        const raw = String(body.dataBase64 || '').replace(/^data:[^;]+;base64,/, '')
        if (!raw) return res.status(400).json({ error: 'dataBase64 is required' })

        let buf
        try {
          buf = Buffer.from(raw, 'base64')
        } catch {
          return res.status(400).json({ error: 'Invalid base64' })
        }
        if (!buf.length) return res.status(400).json({ error: 'Empty upload' })

        await writePhotoBytes(key, buf, body.contentType || 'image/jpeg')
        photoLog('upload-bytes', 'Stored via API proxy', {
          key: key.slice(0, 80),
          bytes: buf.length,
          ms: Date.now() - uploadStarted,
        })
        return res.status(200).json({ ok: true, key, size: buf.length })
      }

      if (action === 'complete' || body.recordOnly) {
        photoLog('complete', 'Verifying uploads and saving record', {
          photoId: body.photoId,
          key: body.key,
        })
        const ctx = await resolvePhotoContext(user, body)
        if (ctx.error) return res.status(ctx.error.status).json({ error: ctx.error.message })
        if (!ctx.canAdd()) return res.status(403).json({ error: 'No permission to add photos' })

        const key = String(body.key || '')
        const thumbnailKey = String(body.thumbnailKey || key)
        if (!key) return res.status(400).json({ error: 'key is required' })

        const prefix = photoKeyPrefix(ctx.entityType)
        if (!key.startsWith(`${prefix}/`)) return res.status(400).json({ error: 'Malformed key' })

        const [origExists, thumbExists] = await Promise.all([
          objectExists(key),
          thumbnailKey !== key ? objectExists(thumbnailKey) : Promise.resolve(true),
        ])
        if (!origExists) return res.status(400).json({ error: 'Original upload not found in storage' })
        if (!thumbExists) return res.status(400).json({ error: 'Thumbnail upload not found in storage' })

        const newBytes = (Number(body.size) || 0) + (Number(body.thumbnailSize) || 0)
        const limit = storageLimit(ctx.entityType)
        if (sumPhotoBytes(ctx.photos) + newBytes > limit) {
          return res.status(413).json({ error: entityStorageError(ctx.entityType === 'deal' ? 'dealPhotos' : 'lead', limit) })
        }

        const photoId = sanitizePhotoId(body.photoId || key.split('/')[4])
        const photoRecord = buildPhotoRecord(body, user, photoId, key, thumbnailKey, {
          original: Number(body.size) || 0,
          thumbnail: Number(body.thumbnailSize) || 0,
        })

        const result = await appendPhotoRecord(user, ctx, photoRecord)
        if (result.error) return res.status(result.error.status).json({ error: result.error.message })
        photoLog('complete', 'Photo record saved', { photoId: photoRecord.id, entityType: ctx.entityType })
        return res.status(200).json({ photo: result.photo, ...entityResponse(ctx, result.entity) })
      }

      return res.status(400).json({
        error: 'Invalid action. Use action=presign, upload-bytes, or action=complete',
      })
    }

    if (req.method === 'PATCH') {
      const patchStarted = Date.now()
      const body = req.body || {}
      const ctx = await resolvePhotoContext(user, body)
      if (ctx.error) return res.status(ctx.error.status).json({ error: ctx.error.message })

      const photoId = sanitizePhotoId(body.photoId)
      if (!photoId) return res.status(400).json({ error: 'photoId is required' })

      const existing = ctx.photos.find((p) => p.id === photoId)
      if (!existing) return res.status(404).json({ error: 'Photo not found' })
      if (!ctx.canMutate(existing)) return res.status(403).json({ error: 'No permission to edit photos' })

      const now = new Date().toISOString()
      const limit = storageLimit(ctx.entityType)
      const entityType = ctx.entityType
      const entityId = ctx.entity.id
      const ownerUid = ctx.ownerUid

      let annotatedKey = existing.annotatedKey
      let annotatedSize = existing.annotatedSize || 0
      let annotatedThumbnailKey = existing.annotatedThumbnailKey || null
      let annotatedThumbnailSize = existing.annotatedThumbnailSize || 0

      if (body.annotatedKey && body.annotatedSize != null) {
        const newAnnotatedBytes = Number(body.annotatedSize) + (Number(body.annotatedThumbnailSize) || 0)
        const oldAnnotatedBytes = (Number(existing.annotatedSize) || 0) + (Number(existing.annotatedThumbnailSize) || 0)
        const withoutAnnotated = sumPhotoBytes(ctx.photos) - oldAnnotatedBytes
        if (withoutAnnotated + newAnnotatedBytes > limit) {
          return res.status(413).json({ error: entityStorageError(entityType === 'deal' ? 'dealPhotos' : 'lead', limit) })
        }
        if (body.annotatedThumbnailKey) {
          const [exists, thumbOk] = await Promise.all([
            objectExists(body.annotatedKey),
            objectExists(body.annotatedThumbnailKey),
          ])
          if (!exists) return res.status(400).json({ error: 'Annotated upload not found in storage' })
          if (!thumbOk) return res.status(400).json({ error: 'Annotated thumbnail upload not found in storage' })
          annotatedKey = String(body.annotatedKey)
          annotatedSize = Number(body.annotatedSize) || 0
          annotatedThumbnailKey = String(body.annotatedThumbnailKey)
          annotatedThumbnailSize = Number(body.annotatedThumbnailSize) || 0
        } else {
          const exists = await objectExists(body.annotatedKey)
          if (!exists) return res.status(400).json({ error: 'Annotated upload not found in storage' })
          annotatedKey = String(body.annotatedKey)
          annotatedSize = Number(body.annotatedSize) || 0
        }
      } else if (body.clearAnnotated) {
        annotatedKey = null
        annotatedSize = 0
        annotatedThumbnailKey = null
        annotatedThumbnailSize = 0
      }

      const updatedPhoto = {
        ...existing,
        annotations: body.annotations !== undefined ? body.annotations : existing.annotations,
        annotatedKey: body.clearAnnotated ? null : (body.annotatedKey ? annotatedKey : existing.annotatedKey),
        annotatedSize: body.clearAnnotated ? 0 : (body.annotatedKey ? annotatedSize : existing.annotatedSize),
        annotatedThumbnailKey: body.clearAnnotated
          ? null
          : (body.annotatedThumbnailKey ? annotatedThumbnailKey : existing.annotatedThumbnailKey),
        annotatedThumbnailSize: body.clearAnnotated
          ? 0
          : (body.annotatedThumbnailKey ? annotatedThumbnailSize : existing.annotatedThumbnailSize),
        updatedAt: now,
      }

      const result = await updatePhotoRecord(user, ctx, photoId, () => updatedPhoto)
      if (result.error) return res.status(result.error.status).json({ error: result.error.message })
      photoLog('patch', 'Photo metadata saved', {
        photoId,
        annotatedKey: updatedPhoto.annotatedKey?.slice?.(-48),
        entityType: ctx.entityType,
        ms: Date.now() - patchStarted,
      })
      return res.status(200).json({ photo: result.photo, ...entityResponse(ctx, result.entity) })
    }

    if (req.method === 'GET') {
      const key = String(req.query.key || '')
      if (!key) return res.status(400).json({ error: 'key is required' })
      const prefix = key.startsWith('lead-photos/') ? 'lead-photos' : key.startsWith('deal-photos/') ? 'deal-photos' : null
      if (!prefix) return res.status(400).json({ error: 'Malformed key' })

      const allowed = await canAccessPhotoKey(user, key)
      if (!allowed) return res.status(403).json({ error: 'Forbidden' })

      // format=url → JSON signed URL (e.g. reports). redirect=0 → proxy bytes (gallery thumbnails, no R2 CORS).
      if (presignedPhotosEnabled() && req.query.format === 'url') {
        const url = await createPresignedGetUrl(key)
        res.setHeader('Cache-Control', 'private, max-age=60')
        return res.status(200).json({ url })
      }

      if (presignedPhotosEnabled() && req.query.redirect !== '0') {
        const url = await createPresignedGetUrl(key)
        res.setHeader('Cache-Control', 'private, max-age=60')
        return res.redirect(302, url)
      }

      try {
        const stored = await readPhotoBytes(key)
        if (!stored) return res.status(404).json({ error: 'File not found' })
        res.setHeader('Content-Type', stored.contentType)
        res.setHeader('Cache-Control', 'private, max-age=300')
        return res.status(200).send(stored.body)
      } catch (e) {
        if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) {
          return res.status(404).json({ error: 'File not found' })
        }
        throw e
      }
    }

    if (req.method === 'DELETE') {
      const body = req.body || {}
      const ctx = await resolvePhotoContext(user, body)
      if (ctx.error) return res.status(ctx.error.status).json({ error: ctx.error.message })

      const photoId = sanitizePhotoId(body.photoId)
      if (!photoId) return res.status(400).json({ error: 'photoId is required' })

      const photo = ctx.photos.find((p) => p.id === photoId)
      if (!photo) return res.status(404).json({ error: 'Photo not found' })
      if (!ctx.canMutate(photo)) {
        return res.status(403).json({ error: 'No permission to delete photos' })
      }

      for (const k of [photo.key, photo.thumbnailKey, photo.annotatedKey, photo.annotatedThumbnailKey].filter(Boolean)) {
        await deleteLocalPhotoBlob(k)
        if (!presignedPhotosEnabled()) continue
        try {
          await s3().send(new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: k,
          }))
        } catch (e) {
          if (e.name !== 'NoSuchKey') console.warn('delete photo key', k, e.message)
        }
      }

      const result = await deletePhotoRecord(user, ctx, photoId)
      if (result.error) return res.status(result.error.status).json({ error: result.error.message })
      return res.status(200).json(entityResponse(ctx, result.entity))
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    photoLogError('error', 'Unhandled photos handler error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
