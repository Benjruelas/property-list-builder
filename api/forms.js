import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { resolveDevBypassUser, isDevBypassToken } from './lib/devBypassUsers.js'
import {
  getAllTeams,
  fullTeamsIndex,
  resolveAccess
} from './lib/teams.js'

/**
 * Vercel Serverless Function - form templates. Firebase Bearer auth.
 *
 * Mirrors api/lists.js storage/auth + sharing pattern.
 *
 * - GET    : templates owned by user, shared via email, or shared via team
 * - POST   : create template (owner = current user)
 * - PATCH  : owner-only update of { name, fields, originalPdfKey,
 *            originalPdfUrl, sharedWith, teamShares }. Collaborators get
 *            view+fill only — no PATCH access at all (sending a filled PDF
 *            goes through api/forms-send.js which doesn't mutate the
 *            template; only `lastUsedAt` is collaborator-writable here).
 * - DELETE : owner-only delete (best-effort R2 cleanup of originalPdfKey)
 */

let kv = null
let kvAvailable = false

if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  try {
    const kvModule = await import('@vercel/kv')
    kv = kvModule.kv
    kvAvailable = true
  } catch (e) {
    kvAvailable = false
  }
} else if (process.env.REDIS_URL) {
  try {
    const { createClient } = await import('redis')
    kv = createClient({ url: process.env.REDIS_URL })
    await kv.connect()
    kvAvailable = true
  } catch (e) {
    kvAvailable = false
  }
}

const KV_KEY = 'user_form_templates'
let fallbackStore = []

async function getAllTemplates() {
  if (!kvAvailable || !kv) return fallbackStore
  try {
    const data = await kv.get(KV_KEY)
    const parsed = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    const result = Array.isArray(parsed) ? parsed : []
    fallbackStore = result
    return result
  } catch (e) {
    return fallbackStore
  }
}

async function saveAllTemplates(templates) {
  fallbackStore = templates
  if (!kvAvailable || !kv) return
  try {
    await kv.set(KV_KEY, templates).catch(() => kv.set(KV_KEY, JSON.stringify(templates)))
  } catch (e) {
    console.warn('KV save failed', e.message)
  }
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

const ALLOWED_FIELD_TYPES = new Set(['text', 'date', 'checkbox', 'signature'])

function clamp01(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return 0
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}

function normalizeField(f) {
  if (!f || typeof f !== 'object') return null
  const type = String(f.type || '').toLowerCase()
  if (!ALLOWED_FIELD_TYPES.has(type)) return null
  return {
    id: String(f.id || `field_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`),
    type,
    page: Math.max(0, parseInt(f.page, 10) || 0),
    x: clamp01(f.x),
    y: clamp01(f.y),
    width: clamp01(f.width),
    height: clamp01(f.height),
    label: String(f.label || '').slice(0, 200),
    required: !!f.required
  }
}

function normalizeFields(fields) {
  if (!Array.isArray(fields)) return []
  return fields.map(normalizeField).filter(Boolean).slice(0, 500)
}

async function deleteR2Key(key) {
  if (!key) return
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) return
  try {
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    })
    await client.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }))
  } catch (e) {
    console.warn('R2 delete failed', e.message)
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const authHeader = req.headers.authorization
  const idToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  const host = req.headers.host || req.headers['x-forwarded-host'] || ''
  const origin = req.headers.origin || ''
  const isLocalhost = /localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0/.test(host) || /localhost|127\.0\.0\.1|\[::1\]/.test(origin)
  const allowDevBypass = isLocalhost || process.env.ENABLE_DEV_BYPASS === 'true'
  let user = allowDevBypass ? resolveDevBypassUser(idToken) : null
  if (!user) user = await verifyFirebaseToken(idToken)

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Sign in and send Authorization: Bearer <token>.' })
  }

  const { method, body = {} } = req

  try {
    if (method === 'GET') {
      const [all, allTeams] = await Promise.all([getAllTemplates(), getAllTeams()])
      const teamsIndex = fullTeamsIndex(allTeams)
      const templates = all.filter((t) => resolveAccess(t, user, teamsIndex) !== null)
      return res.status(200).json({ templates })
    }

    if (method === 'POST') {
      const { name, fields = [], originalPdfKey = null, originalPdfUrl = null, pageCount = 0 } = body
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'Template name is required' })
      }
      const now = new Date().toISOString()
      const newTemplate = {
        id: `form_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        ownerId: user.uid,
        ownerEmail: user.email,
        name: String(name).trim().slice(0, 200),
        originalPdfKey: originalPdfKey ? String(originalPdfKey) : null,
        originalPdfUrl: originalPdfUrl ? String(originalPdfUrl) : null,
        pageCount: Math.max(0, parseInt(pageCount, 10) || 0),
        fields: normalizeFields(fields),
        sharedWith: [],
        teamShares: [],
        lastUsedAt: null,
        createdAt: now,
        updatedAt: now
      }
      const all = await getAllTemplates()
      all.push(newTemplate)
      await saveAllTemplates(all)
      return res.status(201).json({ template: newTemplate })
    }

    if (method === 'PATCH') {
      const {
        templateId,
        name,
        fields,
        originalPdfKey,
        originalPdfUrl,
        pageCount,
        lastUsedAt,
        sharedWith,
        teamShares
      } = body
      if (!templateId) return res.status(400).json({ error: 'templateId is required' })

      const [all, allTeams] = await Promise.all([getAllTemplates(), getAllTeams()])
      const idx = all.findIndex((t) => t.id === templateId)
      if (idx === -1) return res.status(404).json({ error: 'Template not found' })

      const t = all[idx]
      const teamsIndex = fullTeamsIndex(allTeams)
      const access = resolveAccess(t, user, teamsIndex)
      if (!access) {
        return res.status(403).json({ error: 'You do not have access to this template' })
      }
      const isOwner = access === 'owner'

      // Collaborators (shared users / team members) get view+fill only.
      // The only field they may update is `lastUsedAt` so the list UI can
      // surface "last used" for everyone with access. Everything else is
      // owner-only.
      if (!isOwner) {
        const touchedOwnerField =
          name !== undefined ||
          fields !== undefined ||
          originalPdfKey !== undefined ||
          originalPdfUrl !== undefined ||
          pageCount !== undefined ||
          sharedWith !== undefined ||
          teamShares !== undefined
        if (touchedOwnerField) {
          return res.status(403).json({ error: 'Only the template owner can edit this form' })
        }
        if (lastUsedAt === undefined) {
          return res.status(400).json({ error: 'No permitted updates' })
        }
      }

      if (name !== undefined) {
        const trimmed = String(name || '').trim()
        if (!trimmed) return res.status(400).json({ error: 'Template name cannot be empty' })
        t.name = trimmed.slice(0, 200)
      }
      if (fields !== undefined) {
        t.fields = normalizeFields(fields)
      }
      if (originalPdfKey !== undefined) t.originalPdfKey = originalPdfKey ? String(originalPdfKey) : null
      if (originalPdfUrl !== undefined) t.originalPdfUrl = originalPdfUrl ? String(originalPdfUrl) : null
      if (pageCount !== undefined) t.pageCount = Math.max(0, parseInt(pageCount, 10) || 0)
      if (lastUsedAt !== undefined) t.lastUsedAt = lastUsedAt ? String(lastUsedAt) : null

      if (sharedWith !== undefined) {
        const arr = Array.isArray(sharedWith) ? sharedWith : []
        const emails = arr.map((e) => (e && String(e).trim()).toLowerCase()).filter(Boolean)
        const uniqueEmails = [...new Set(emails)]
        if (uniqueEmails.length > 50) return res.status(400).json({ error: 'Maximum 50 share emails allowed' })
        if (uniqueEmails.length > 0) {
          const knownEmails = new Set()
          all.forEach((f) => {
            const o = (f.ownerEmail || '').toLowerCase().trim()
            if (o) knownEmails.add(o)
            ;(f.sharedWith || []).forEach((s) => {
              const e = (s || '').toLowerCase().trim()
              if (e) knownEmails.add(e)
            })
          })
          if (allowDevBypass && isDevBypassToken(idToken)) {
            // skip validation in dev bypass mode
          } else {
            // Also allow emails that already own/collaborate on lists — a
            // strong signal they're registered users. Cheap and consistent
            // with validate-share-email.js behavior.
            const unknown = uniqueEmails.filter((e) => !knownEmails.has(e))
            if (unknown.length > 0) {
              return res.status(400).json({ error: `No user found with email: ${unknown[0]}` })
            }
          }
        }
        t.sharedWith = uniqueEmails
      }

      if (teamShares !== undefined) {
        const arr = Array.isArray(teamShares) ? teamShares : []
        const unique = [...new Set(arr.filter(Boolean))]
        for (const tid of unique) {
          const team = teamsIndex[tid]
          if (!team) return res.status(400).json({ error: `Team not found: ${tid}` })
          const isMember =
            team.ownerId === user.uid ||
            (Array.isArray(team.members) && team.members.some((m) => m.uid === user.uid))
          if (!isMember) {
            return res.status(403).json({ error: 'You must be a member of each team you share with' })
          }
        }
        t.teamShares = unique
      }

      t.updatedAt = new Date().toISOString()
      all[idx] = t
      await saveAllTemplates(all)
      return res.status(200).json({ template: t })
    }

    if (method === 'DELETE') {
      const { templateId } = body
      if (!templateId) return res.status(400).json({ error: 'templateId is required' })

      const all = await getAllTemplates()
      const idx = all.findIndex((t) => t.id === templateId)
      if (idx === -1) return res.status(404).json({ error: 'Template not found' })
      if (all[idx].ownerId !== user.uid) {
        return res.status(403).json({ error: 'Only the template owner can delete it' })
      }
      const removed = all[idx]
      all.splice(idx, 1)
      await saveAllTemplates(all)
      if (removed.originalPdfKey) {
        deleteR2Key(removed.originalPdfKey).catch(() => {})
      }
      return res.status(200).json({ message: 'Template deleted' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('forms API error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
