import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { requireAuth } from './_lib/apiAuth.js'
import { getLeadWithAccess, canEditLead } from './_lib/leadAccess.js'
import { presignedPhotosEnabled, createPresignedPutUrl, createPresignedGetUrl } from './_lib/photoPresign.js'

import {
  ENTITY_STORAGE_LIMITS,
  MAX_SINGLE_UPLOAD_BYTES,
  entityStorageError,
  formatStorageBytes,
  sumDealFileBytes,
} from './_lib/uploadLimits.js'

/**
 * Lead file upload/download via R2.
 * - POST: { leadId, fileName, fileBase64, contentType }
 * - GET: ?key=lead-files/... — download
 * - DELETE: { key, leadId } — remove file
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

function sanitizeFileName(v) {
  return String(v || 'file').replace(/[^a-zA-Z0-9._\- ]/g, '_').slice(0, 120)
}

function leadDisplayName(lead) {
  const parts = [lead?.firstName, lead?.lastName].filter(Boolean)
  if (parts.length) return parts.join(' ')
  return (lead?.address || 'Lead').trim()
}

export const config = {
  api: { bodyParser: { sizeLimit: '14mb' } },
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const user = await requireAuth(req, res)
  if (!user) return

  try {
    if (req.method === 'POST') {
      const { leadId, fileName, fileBase64, contentType, action, size } = req.body || {}
      const lid = sanitizeId(leadId)
      if (!lid) return res.status(400).json({ error: 'leadId is required' })

      // Presigned direct-to-R2 upload (no base64 proxying through the function).
      if (action === 'presign') {
        if (!presignedPhotosEnabled()) {
          return res.status(503).json({ error: 'Direct upload not configured' })
        }
        const declaredSize = Number(size) || 0
        if (declaredSize <= 0) return res.status(400).json({ error: 'size is required' })
        if (declaredSize > MAX_SINGLE_UPLOAD_BYTES) {
          return res.status(413).json({
            error: `Single upload must be ${formatStorageBytes(MAX_SINGLE_UPLOAD_BYTES)} or smaller`,
          })
        }

        const { lead, access } = await getLeadWithAccess(user, lid)
        if (!lead) return res.status(404).json({ error: 'Lead not found' })
        if (!canEditLead(access)) return res.status(403).json({ error: 'Forbidden' })

        const existingBytes = sumDealFileBytes(lead.files)
        if (existingBytes + declaredSize > ENTITY_STORAGE_LIMITS.leadFiles) {
          return res.status(413).json({ error: entityStorageError('leadFiles', ENTITY_STORAGE_LIMITS.leadFiles) })
        }

        const safeName = sanitizeFileName(fileName)
        const fileId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
        const ownerUid = lead.ownerId || user.uid
        const key = `lead-files/${ownerUid}/${lid}/${fileId}_${safeName}`
        const uploadUrl = await createPresignedPutUrl(key, contentType || 'application/octet-stream', 900)

        const fileRecord = {
          id: fileId,
          name: safeName,
          size: declaredSize,
          key,
          contentType: contentType || 'application/octet-stream',
          uploadedAt: new Date().toISOString(),
        }
        return res.status(200).json({
          uploadUrl,
          file: fileRecord,
          key,
          url: `/api/lead-files?key=${encodeURIComponent(key)}`,
        })
      }

      if (!fileBase64 || typeof fileBase64 !== 'string') {
        return res.status(400).json({ error: 'fileBase64 is required' })
      }

      const { lead, access } = await getLeadWithAccess(user, lid)
      if (!lead) return res.status(404).json({ error: 'Lead not found' })
      if (!canEditLead(access)) return res.status(403).json({ error: 'Forbidden' })

      const cleaned = fileBase64.replace(/^data:[^;]+;base64,/, '')
      let buf
      try {
        buf = Buffer.from(cleaned, 'base64')
      } catch {
        return res.status(400).json({ error: 'Invalid base64 file' })
      }
      if (!buf.length) {
        return res.status(400).json({ error: 'Empty file' })
      }
      if (buf.length > MAX_SINGLE_UPLOAD_BYTES) {
        return res.status(413).json({
          error: `Single upload must be ${formatStorageBytes(MAX_SINGLE_UPLOAD_BYTES)} or smaller`,
        })
      }

      const existingBytes = sumDealFileBytes(lead.files)
      if (existingBytes + buf.length > ENTITY_STORAGE_LIMITS.leadFiles) {
        return res.status(413).json({ error: entityStorageError('leadFiles', ENTITY_STORAGE_LIMITS.leadFiles) })
      }

      const safeName = sanitizeFileName(fileName)
      const fileId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
      const ownerUid = lead.ownerId || user.uid
      const key = `lead-files/${ownerUid}/${lid}/${fileId}_${safeName}`

      await s3().send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: buf,
        ContentType: contentType || 'application/octet-stream',
      }))

      const fileRecord = {
        id: fileId,
        name: safeName,
        size: buf.length,
        key,
        contentType: contentType || 'application/octet-stream',
        uploadedAt: new Date().toISOString(),
      }

      const url = `/api/lead-files?key=${encodeURIComponent(key)}`

      try {
        const { logTeamActivity, actorLabel, teamIdsFromResource } = await import('./_lib/activityLog.js')
        const teamIds = teamIdsFromResource(lead)
        if (teamIds.length > 0) {
          await logTeamActivity({
            teamIds,
            actor: user,
            type: 'lead.file_uploaded',
            summary: `${actorLabel(user)} uploaded "${safeName}" to lead "${leadDisplayName(lead)}"`,
            entity: { kind: 'lead', leadId: lid, fileId },
            nav: { type: 'lead', leadId: lid },
          })
        }
      } catch (e) {
        console.warn('lead file activity log', e.message)
      }

      return res.status(200).json({ file: fileRecord, key, url })
    }

    if (req.method === 'GET') {
      const key = String(req.query.key || '')
      if (!key) return res.status(400).json({ error: 'key is required' })
      if (!key.startsWith('lead-files/')) return res.status(400).json({ error: 'Malformed key' })

      const parts = key.split('/')
      const ownerUid = parts[1]
      const leadId = parts[2]

      let allowed = ownerUid === user.uid
      if (!allowed) {
        const { lead, access } = await getLeadWithAccess(user, leadId)
        allowed = !!lead && !!access
      }
      if (!allowed) return res.status(403).json({ error: 'Forbidden' })

      // Presigned GET: short-lived direct R2 URL instead of proxying bytes.
      if (req.query.format === 'url' && presignedPhotosEnabled()) {
        const url = await createPresignedGetUrl(key, 3600)
        res.setHeader('Cache-Control', 'private, max-age=300')
        return res.status(200).json({ url })
      }

      try {
        const r = await s3().send(new GetObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: key,
        }))
        const chunks = []
        for await (const c of r.Body) chunks.push(c)
        const body = Buffer.concat(chunks)
        res.setHeader('Content-Type', r.ContentType || 'application/octet-stream')
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
      const { key, leadId } = req.body || {}
      if (!key || typeof key !== 'string') return res.status(400).json({ error: 'key is required' })
      if (!key.startsWith('lead-files/')) return res.status(400).json({ error: 'Malformed key' })
      const lid = sanitizeId(leadId)

      // Validate the key belongs to the referenced lead so a collaborator can't
      // delete arbitrary objects under lead-files/ (IDOR).
      const parts = key.split('/')
      const ownerFromKey = parts[1] || ''
      const leadIdFromKey = sanitizeId(parts[2])

      if (lid) {
        const { lead, access } = await getLeadWithAccess(user, lid)
        if (!lead || !canEditLead(access)) return res.status(403).json({ error: 'Forbidden' })
        if (leadIdFromKey !== lid || ownerFromKey !== String(lead.ownerId)) {
          return res.status(403).json({ error: 'Forbidden' })
        }
      } else if (ownerFromKey !== String(user.uid)) {
        return res.status(403).json({ error: 'Forbidden' })
      }

      try {
        await s3().send(new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: key,
        }))
      } catch (e) {
        if (e.name !== 'NoSuchKey') throw e
      }

      if (lid) {
        try {
          const { lead } = await getLeadWithAccess(user, lid)
          const { logTeamActivity, actorLabel, teamIdsFromResource } = await import('./_lib/activityLog.js')
          const teamIds = lead ? teamIdsFromResource(lead) : []
          const fileName = key.split('/').pop()?.replace(/^\d+_[a-z0-9]+_/, '') || 'file'
          if (teamIds.length > 0 && lead) {
            await logTeamActivity({
              teamIds,
              actor: user,
              type: 'lead.file_deleted',
              summary: `${actorLabel(user)} deleted "${fileName}" from lead "${leadDisplayName(lead)}"`,
              entity: { kind: 'lead', leadId: lid },
              nav: { type: 'lead', leadId: lid },
            })
          }
        } catch (e) {
          console.warn('lead file delete activity log', e.message)
        }
      }

      return res.status(200).json({ message: 'File deleted' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('lead-files error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
