import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import {resolveDevBypassUser, isDevBypassAllowed} from './lib/devBypassUsers.js'
import { getAllTeams, fullTeamsIndex, resolveAccess } from './lib/teams.js'

import {
  ENTITY_STORAGE_LIMITS,
  MAX_SINGLE_UPLOAD_BYTES,
  entityStorageError,
  formatStorageBytes,
  sumDealFileBytes,
} from './lib/uploadLimits.js'

/**
 * Deal file upload/download via R2.
 * - POST: { pipelineId, dealId, fileName, fileBase64, contentType }
 * - GET: ?key=deal-files/... — download
 * - DELETE: { key, pipelineId, dealId } — remove file
 */

let kv = null
let kvAvailable = false

if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  try {
    const kvModule = await import('@vercel/kv')
    kv = kvModule.kv
    kvAvailable = true
  } catch {
    kvAvailable = false
  }
} else if (process.env.REDIS_URL) {
  try {
    const { createClient } = await import('redis')
    kv = createClient({ url: process.env.REDIS_URL })
    await kv.connect()
    kvAvailable = true
  } catch {
    kvAvailable = false
  }
}

const PIPELINES_KV_KEY = 'user_pipelines'

async function loadPipelinesSnapshot() {
  if (!kvAvailable || !kv) return []
  try {
    const data = await kv.get(PIPELINES_KV_KEY)
    const parsed = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

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

async function verifyFirebaseToken(idToken) {
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY
  if (!apiKey || !idToken) return null
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      }
    )
    if (!r.ok) return null
    const data = await r.json()
    const user = data.users && data.users[0]
    if (!user) return null
    return { uid: user.localId, email: (user.email || '').toLowerCase() }
  } catch (e) {
    console.error('Token verify error', e.message)
    return null
  }
}

function sanitizeId(v) {
  return String(v || '').replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 80)
}

function sanitizeFileName(v) {
  return String(v || 'file').replace(/[^a-zA-Z0-9._\- ]/g, '_').slice(0, 120)
}

async function canAccessPipeline(user, pipelineId) {
  const [pipelines, allTeams] = await Promise.all([loadPipelinesSnapshot(), getAllTeams()])
  const pipeline = pipelines.find((p) => p.id === pipelineId)
  if (!pipeline) return { allowed: false, pipeline: null }
  const teamsIndex = fullTeamsIndex(allTeams)
  const access = resolveAccess(pipeline, user, teamsIndex)
  return { allowed: !!access, pipeline }
}

export const config = {
  api: { bodyParser: { sizeLimit: '14mb' } }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const authHeader = req.headers.authorization
  const idToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  const allowDevBypass = isDevBypassAllowed(req)
  let user = allowDevBypass ? resolveDevBypassUser(idToken) : null
  if (!user) user = await verifyFirebaseToken(idToken)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  try {
    if (req.method === 'POST') {
      const { pipelineId, dealId, fileName, fileBase64, contentType } = req.body || {}
      const pid = sanitizeId(pipelineId)
      const did = sanitizeId(dealId)
      if (!pid || !did) return res.status(400).json({ error: 'pipelineId and dealId are required' })
      if (!fileBase64 || typeof fileBase64 !== 'string') {
        return res.status(400).json({ error: 'fileBase64 is required' })
      }

      const { allowed, pipeline } = await canAccessPipeline(user, pid)
      if (!allowed) return res.status(403).json({ error: 'Forbidden' })
      const deal = (pipeline.deals || []).find((d) => d.id === did)
      if (!deal) return res.status(404).json({ error: 'Deal not found in pipeline' })

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

      const existingBytes = sumDealFileBytes(deal.files)
      if (existingBytes + buf.length > ENTITY_STORAGE_LIMITS.deal) {
        return res.status(413).json({ error: entityStorageError('deal', ENTITY_STORAGE_LIMITS.deal) })
      }

      const safeName = sanitizeFileName(fileName)
      const fileId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
      const key = `deal-files/${pipeline.ownerId}/${did}/${fileId}_${safeName}`

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

      const url = `/api/deal-files?key=${encodeURIComponent(key)}`

      try {
        const { logTeamActivity, actorLabel, teamIdsFromResource, dealActivityLabel } = await import('./lib/activityLog.js')
        const teamIds = teamIdsFromResource(pipeline)
        if (teamIds.length > 0) {
          await logTeamActivity({
            teamIds,
            actor: user,
            type: 'deal.file_uploaded',
            summary: `${actorLabel(user)} uploaded "${safeName}" to deal "${dealActivityLabel(deal)}"`,
            entity: { kind: 'deal', dealId: did, pipelineId: pid, fileId },
            nav: { type: 'deal', dealId: did, pipelineId: pid },
          })
        }
      } catch (e) {
        console.warn('deal file activity log', e.message)
      }

      return res.status(200).json({ file: fileRecord, key, url })
    }

    if (req.method === 'GET') {
      const key = String(req.query.key || '')
      if (!key) return res.status(400).json({ error: 'key is required' })
      if (!key.startsWith('deal-files/')) return res.status(400).json({ error: 'Malformed key' })

      const parts = key.split('/')
      const ownerUid = parts[1]
      const dealId = parts[2]

      let allowed = ownerUid === user.uid
      if (!allowed) {
        const pipelines = await loadPipelinesSnapshot()
        const teamsIndex = fullTeamsIndex(await getAllTeams())
        for (const p of pipelines) {
          if ((p.deals || []).some((d) => d.id === dealId) && resolveAccess(p, user, teamsIndex)) {
            allowed = true
            break
          }
        }
      }
      if (!allowed) return res.status(403).json({ error: 'Forbidden' })

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
      const { key, pipelineId } = req.body || {}
      if (!key) return res.status(400).json({ error: 'key is required' })
      const pid = sanitizeId(pipelineId)
      if (pid) {
        const { allowed } = await canAccessPipeline(user, pid)
        if (!allowed) return res.status(403).json({ error: 'Forbidden' })
      } else if (!key.includes(`/${user.uid}/`)) {
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

      if (pid) {
        try {
          const keyParts = key.split('/')
          const dealIdFromKey = sanitizeId(keyParts[2])
          const { allowed, pipeline } = await canAccessPipeline(user, pid)
          if (allowed && pipeline && dealIdFromKey) {
            const deal = (pipeline.deals || []).find((d) => d.id === dealIdFromKey)
            const { logTeamActivity, actorLabel, teamIdsFromResource, dealActivityLabel } = await import('./lib/activityLog.js')
            const teamIds = teamIdsFromResource(pipeline)
            const fileName = key.split('/').pop()?.replace(/^\d+_[a-z0-9]+_/, '') || 'file'
            if (teamIds.length > 0 && deal) {
              await logTeamActivity({
                teamIds,
                actor: user,
                type: 'deal.file_deleted',
                summary: `${actorLabel(user)} deleted "${fileName}" from deal "${dealActivityLabel(deal)}"`,
                entity: { kind: 'deal', dealId: dealIdFromKey, pipelineId: pid },
                nav: { type: 'deal', dealId: dealIdFromKey, pipelineId: pid },
              })
            }
          }
        } catch (e) {
          console.warn('deal file delete activity log', e.message)
        }
      }

      return res.status(200).json({ message: 'File deleted' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('deal-files error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
