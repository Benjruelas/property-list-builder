import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { authenticate } from './lib/auth.js'
import { getAllTeams, fullTeamsIndex, resolveAccess } from './lib/teams.js'
import { getAllPipelines, mutatePipelines } from './lib/pipelineStoreFull.js'
import {
  presignedPhotosEnabled,
  createPresignedGetUrl,
  createPresignedPutUrl,
} from './lib/photoPresign.js'
import {
  ENTITY_STORAGE_LIMITS,
  MAX_SINGLE_UPLOAD_BYTES,
  entityStorageError,
  formatStorageBytes,
  sumLeadPhotoBytes,
} from './lib/uploadLimits.js'

/**
 * Deal photo upload/download via R2.
 * POST / PATCH / GET / DELETE — mirrors lead-photos, stored on deal.photos in pipeline KV.
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

function photoKey(ownerUid, dealId, photoId, variant) {
  return `deal-photos/${ownerUid}/${dealId}/${photoId}/${variant}.jpg`
}

async function canAccessPipeline(user, pipelineId) {
  const [pipelines, allTeams] = await Promise.all([getAllPipelines(), getAllTeams()])
  const pipeline = pipelines.find((p) => p.id === pipelineId)
  if (!pipeline) return { allowed: false, pipeline: null, all: pipelines, pipelineIndex: -1 }
  const teamsIndex = fullTeamsIndex(allTeams)
  const access = resolveAccess(pipeline, user, teamsIndex)
  const pipelineIndex = pipelines.findIndex((p) => p.id === pipelineId)
  return { allowed: !!access, pipeline, all: pipelines, pipelineIndex }
}

function getDealFromPipeline(pipeline, dealId) {
  const deals = Array.isArray(pipeline?.deals) ? pipeline.deals : []
  const dealIndex = deals.findIndex((d) => d.id === dealId)
  if (dealIndex === -1) return { deal: null, dealIndex: -1 }
  return { deal: deals[dealIndex], dealIndex }
}

function replaceDealInAll(all, pipelineIndex, dealIndex, updatedDeal) {
  const pipeline = all[pipelineIndex]
  const deals = [...(pipeline.deals || [])]
  deals[dealIndex] = updatedDeal
  const nextPipeline = { ...pipeline, deals, updatedAt: new Date().toISOString() }
  const nextAll = [...all]
  nextAll[pipelineIndex] = nextPipeline
  return { nextAll, nextPipeline }
}

async function saveDealMutation(all, pipelineIndex, dealIndex, updatedDeal) {
  const prevPipeline = all[pipelineIndex]
  const deals = [...(prevPipeline.deals || [])]
  deals[dealIndex] = updatedDeal
  const nextPipeline = { ...prevPipeline, deals, updatedAt: new Date().toISOString() }
  await mutatePipelines((current) => {
    const at = current.findIndex((p) => p.id === prevPipeline.id)
    if (at === -1) return undefined
    const next = [...current]
    next[at] = nextPipeline
    return next
  }, { changedResources: [{ resource: nextPipeline, prevResource: prevPipeline }] })
  return updatedDeal
}

async function canAccessPhotoKey(user, key) {
  if (!key.startsWith('deal-photos/')) return false
  const parts = key.split('/')
  const ownerUid = parts[1]
  const dealId = parts[2]
  if (ownerUid === user.uid) return true
  const pipelines = await getAllPipelines()
  const allTeams = await getAllTeams()
  const teamsIndex = fullTeamsIndex(allTeams)
  for (const pipeline of pipelines) {
    if ((pipeline.deals || []).some((d) => d.id === dealId) && resolveAccess(pipeline, user, teamsIndex)) {
      return true
    }
  }
  return false
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
      const pipelineId = sanitizeId(body.pipelineId)
      const dealId = sanitizeId(body.dealId)
      if (!pipelineId || !dealId) return res.status(400).json({ error: 'pipelineId and dealId are required' })

      const { allowed, pipeline, all, pipelineIndex } = await canAccessPipeline(user, pipelineId)
      if (!allowed || !pipeline) return res.status(403).json({ error: 'Forbidden' })
      const { deal, dealIndex } = getDealFromPipeline(pipeline, dealId)
      if (!deal) return res.status(404).json({ error: 'Deal not found in pipeline' })

      const photos = Array.isArray(deal.photos) ? deal.photos : []
      const originalBuf = decodeBase64(body.fileBase64)
      if (!originalBuf) {
        return res.status(400).json({
          error: `Invalid or oversized image (max ${formatStorageBytes(MAX_SINGLE_UPLOAD_BYTES)} per upload)`,
        })
      }
      const thumbBuf = body.thumbnailBase64 ? decodeBase64(body.thumbnailBase64) : null
      const existingBytes = sumLeadPhotoBytes(photos)
      const newBytes = originalBuf.length + (thumbBuf?.length || 0)
      if (existingBytes + newBytes > ENTITY_STORAGE_LIMITS.dealPhotos) {
        return res.status(413).json({ error: entityStorageError('dealPhotos', ENTITY_STORAGE_LIMITS.dealPhotos) })
      }

      const photoId = `photo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
      const ownerUid = pipeline.ownerId || user.uid
      const key = photoKey(ownerUid, dealId, photoId, 'original')
      const thumbnailKey = photoKey(ownerUid, dealId, photoId, 'thumb')

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

      const now = new Date().toISOString()
      const photoRecord = {
        id: photoId,
        key,
        thumbnailKey: thumbBuf ? thumbnailKey : key,
        annotatedKey: null,
        contentType: body.contentType || 'image/jpeg',
        size: originalBuf.length,
        thumbnailSize: thumbBuf?.length || 0,
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

      const updatedDeal = {
        ...deal,
        photos: [...photos, photoRecord],
        updatedAt: Date.now(),
      }
      await saveDealMutation(all, pipelineIndex, dealIndex, updatedDeal)

      return res.status(200).json({ photo: photoRecord, deal: updatedDeal })
    }

    if (req.method === 'PATCH') {
      const body = req.body || {}
      const pipelineId = sanitizeId(body.pipelineId)
      const dealId = sanitizeId(body.dealId)
      const photoId = sanitizeId(body.photoId)
      if (!pipelineId || !dealId || !photoId) {
        return res.status(400).json({ error: 'pipelineId, dealId, and photoId are required' })
      }

      const { allowed, pipeline, all, pipelineIndex } = await canAccessPipeline(user, pipelineId)
      if (!allowed || !pipeline) return res.status(403).json({ error: 'Forbidden' })
      const { deal, dealIndex } = getDealFromPipeline(pipeline, dealId)
      if (!deal) return res.status(404).json({ error: 'Deal not found in pipeline' })

      const photos = Array.isArray(deal.photos) ? [...deal.photos] : []
      const pIdx = photos.findIndex((p) => p.id === photoId)
      if (pIdx === -1) return res.status(404).json({ error: 'Photo not found' })

      const existing = photos[pIdx]
      const ownerUid = pipeline.ownerId || user.uid
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
        if (withoutAnnotated + newAnnotatedBytes > ENTITY_STORAGE_LIMITS.dealPhotos) {
          return res.status(413).json({ error: entityStorageError('dealPhotos', ENTITY_STORAGE_LIMITS.dealPhotos) })
        }
        annotatedKey = photoKey(ownerUid, dealId, photoId, 'annotated')
        annotatedSize = annBuf.length
        await s3().send(new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: annotatedKey,
          Body: annBuf,
          ContentType: 'image/jpeg',
        }))
        if (thumbBuf) {
          annotatedThumbnailKey = photoKey(ownerUid, dealId, photoId, 'annotated-thumb')
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

      photos[pIdx] = {
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

      const updatedDeal = { ...deal, photos, updatedAt: Date.now() }
      await saveDealMutation(all, pipelineIndex, dealIndex, updatedDeal)

      return res.status(200).json({ photo: photos[pIdx], deal: updatedDeal })
    }

    if (req.method === 'GET') {
      const key = String(req.query.key || '')
      if (!key) return res.status(400).json({ error: 'key is required' })
      if (!key.startsWith('deal-photos/')) return res.status(400).json({ error: 'Malformed key' })

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
      const pipelineId = sanitizeId(body.pipelineId)
      const dealId = sanitizeId(body.dealId)
      const photoId = sanitizeId(body.photoId)
      if (!pipelineId || !dealId || !photoId) {
        return res.status(400).json({ error: 'pipelineId, dealId, and photoId are required' })
      }

      const { allowed, pipeline, all, pipelineIndex } = await canAccessPipeline(user, pipelineId)
      if (!allowed || !pipeline) return res.status(403).json({ error: 'Forbidden' })
      const { deal, dealIndex } = getDealFromPipeline(pipeline, dealId)
      if (!deal) return res.status(404).json({ error: 'Deal not found in pipeline' })

      const photos = Array.isArray(deal.photos) ? deal.photos : []
      const photo = photos.find((p) => p.id === photoId)
      if (!photo) return res.status(404).json({ error: 'Photo not found' })

      for (const k of [photo.key, photo.thumbnailKey, photo.annotatedKey, photo.annotatedThumbnailKey].filter(Boolean)) {
        try {
          await s3().send(new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: k,
          }))
        } catch (e) {
          if (e.name !== 'NoSuchKey') console.warn('delete deal photo key', k, e.message)
        }
      }

      const updatedDeal = {
        ...deal,
        photos: photos.filter((p) => p.id !== photoId),
        updatedAt: Date.now(),
      }
      await saveDealMutation(all, pipelineIndex, dealIndex, updatedDeal)

      return res.status(200).json({ deal: updatedDeal })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('deal-photos error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
