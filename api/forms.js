import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { isDevBypassToken } from './lib/devBypassUsers.js'
import { authenticate } from './lib/auth.js'
import { getAllFormTemplates, saveAllFormTemplates } from './lib/formTemplateStore.js'
import {
  getAllTeams,
} from './lib/teams.js'
import {
  buildAccessContext,
  getResourceAccess,
  filterVisibleResources,
  canEdit,
  canDelete,
  canChangeVisibility,
  applyResourceVisibilityPatch,
  isTeamAdmin,
} from './lib/resourceContext.js'

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

  const { user, allowDevBypass, idToken } = await authenticate(req)

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Sign in and send Authorization: Bearer <token>.' })
  }

  const { method, body = {} } = req

  try {
    if (method === 'GET') {
      const [all, allTeams] = await Promise.all([getAllFormTemplates(), getAllTeams()])
      const ctx = buildAccessContext(allTeams, user)
      const templates = filterVisibleResources(all, user, ctx)
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
        teamId: null,
        visibility: 'private',
        sharedMemberUids: [],
        isTeamLibrary: body.isTeamLibrary === true,
        lastUsedAt: null,
        createdAt: now,
        updatedAt: now
      }
      const all = await getAllFormTemplates()
      all.push(newTemplate)
      await saveAllFormTemplates(all)
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

      const [all, allTeams] = await Promise.all([getAllFormTemplates(), getAllTeams()])
      const idx = all.findIndex((t) => t.id === templateId)
      if (idx === -1) return res.status(404).json({ error: 'Template not found' })

      const t = all[idx]
      const ctx = buildAccessContext(allTeams, user)
      const teamsIndex = ctx.teamsIndex
      const access = getResourceAccess(t, user, ctx)
      if (!canEdit(access) && access !== 'admin_view' && lastUsedAt === undefined) {
        return res.status(403).json({ error: 'You do not have access to this template' })
      }
      if (access === 'admin_view' && lastUsedAt === undefined) {
        return res.status(403).json({ error: 'Admins can view but not edit private forms' })
      }
      const isOwner = canChangeVisibility(access)

      if (!isOwner) {
        const touchedOwnerField =
          name !== undefined ||
          fields !== undefined ||
          originalPdfKey !== undefined ||
          originalPdfUrl !== undefined ||
          pageCount !== undefined ||
          sharedWith !== undefined ||
          teamShares !== undefined ||
          body.visibility !== undefined ||
          body.sharedMemberUids !== undefined ||
          body.isTeamLibrary !== undefined
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
        const prevTeamShares = new Set(t.teamShares || [])
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
        const newlyAddedTeamShares = unique.filter((tid) => !prevTeamShares.has(tid))
        t.teamShares = unique
        if (isOwner && newlyAddedTeamShares.length > 0) {
          try {
            const { notifyTeamResourceShare } = await import('./lib/pushUtils.js')
            await notifyTeamResourceShare(newlyAddedTeamShares, teamsIndex, {
              resourceType: 'form',
              resourceName: t.name,
              resourceId: t.id,
              actorEmail: user.email
            })
          } catch (e) {
            console.warn('form team push notify', e.message)
          }
        }
      }

      if (body.isTeamLibrary !== undefined && isOwner) {
        if (body.isTeamLibrary === true && !isTeamAdmin(ctx.team, user.uid)) {
          return res.status(403).json({ error: 'Only team admins can publish to team library' })
        }
        t.isTeamLibrary = body.isTeamLibrary === true
        if (t.isTeamLibrary && ctx.team?.id) {
          t.visibility = 'team'
          t.teamId = ctx.team.id
        }
      }

      if (isOwner && (body.visibility !== undefined || body.sharedMemberUids !== undefined)) {
        try {
          const patched = applyResourceVisibilityPatch(t, body, ctx)
          t.visibility = patched.visibility
          t.teamId = patched.teamId
          t.sharedMemberUids = patched.sharedMemberUids
          if (patched.teamShares?.length) t.teamShares = patched.teamShares
        } catch (e) {
          return res.status(400).json({ error: e.message })
        }
      }

      t.updatedAt = new Date().toISOString()
      all[idx] = t
      await saveAllFormTemplates(all)
      return res.status(200).json({ template: t })
    }

    if (method === 'DELETE') {
      const { templateId } = body
      if (!templateId) return res.status(400).json({ error: 'templateId is required' })

      const [all, allTeams] = await Promise.all([getAllFormTemplates(), getAllTeams()])
      const ctx = buildAccessContext(allTeams, user)
      const idx = all.findIndex((t) => t.id === templateId)
      if (idx === -1) return res.status(404).json({ error: 'Template not found' })
      const access = getResourceAccess(all[idx], user, ctx)
      if (!canDelete(access)) {
        return res.status(403).json({ error: 'Only the template owner can delete it' })
      }
      const removed = all[idx]
      all.splice(idx, 1)
      await saveAllFormTemplates(all)
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
