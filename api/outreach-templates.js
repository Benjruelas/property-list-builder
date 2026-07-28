import { requireAuth } from './_lib/apiAuth.js'
import { getAllTeams } from './_lib/teams.js'
import {
  buildAccessContext,
  getResourceAccess,
  filterVisibleResources,
  canEdit,
  canDelete,
  canChangeVisibility,
  applyResourceVisibilityPatch,
} from './_lib/resourceContext.js'
import { getAllOutreachTemplates, saveAllOutreachTemplates } from './_lib/outreachTemplateStore.js'

function normalizeChannel(v) {
  return v === 'text' ? 'text' : 'email'
}

function buildTemplateFromBody(body, user, existing = null) {
  const now = new Date().toISOString()
  const channel = normalizeChannel(body.channel ?? existing?.channel)
  return {
    id: existing?.id || `otpl_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    channel,
    name: String(body.name ?? existing?.name ?? 'Untitled Template').trim().slice(0, 200),
    subject: channel === 'email' ? String(body.subject ?? existing?.subject ?? '').slice(0, 500) : '',
    body: String(body.body ?? existing?.body ?? '').slice(0, 16000),
    ownerId: existing?.ownerId || user.uid,
    ownerEmail: existing?.ownerEmail || user.email,
    sharedWith: existing?.sharedWith || [],
    teamShares: existing?.teamShares || [],
    teamId: existing?.teamId ?? null,
    visibility: existing?.visibility || 'private',
    sharedMemberUids: existing?.sharedMemberUids || [],
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const user = await requireAuth(req, res)
  if (!user) return

  const { method, body = {} } = req

  try {
    if (method === 'GET') {
      const channel = req.query?.channel != null ? normalizeChannel(req.query.channel) : null
      const [all, allTeams] = await Promise.all([getAllOutreachTemplates(), getAllTeams()])
      const ctx = buildAccessContext(allTeams, user)
      let templates = filterVisibleResources(all, user, ctx)
      if (channel) templates = templates.filter((t) => normalizeChannel(t.channel) === channel)
      return res.status(200).json({ templates })
    }

    if (method === 'POST') {
      if (!body.name || !String(body.name).trim()) {
        return res.status(400).json({ error: 'Template name is required' })
      }
      const template = buildTemplateFromBody(body, user)
      const all = await getAllOutreachTemplates()
      all.push(template)
      await saveAllOutreachTemplates(all)
      return res.status(201).json({ template })
    }

    if (method === 'PATCH') {
      const { templateId } = body
      if (!templateId) return res.status(400).json({ error: 'templateId is required' })

      const [all, allTeams] = await Promise.all([getAllOutreachTemplates(), getAllTeams()])
      const idx = all.findIndex((t) => t.id === templateId)
      if (idx === -1) return res.status(404).json({ error: 'Template not found' })

      const existing = all[idx]
      const ctx = buildAccessContext(allTeams, user)
      const access = getResourceAccess(existing, user, ctx)
      if (!canEdit(access)) {
        return res.status(403).json({ error: 'You do not have access to edit this template' })
      }

      const updated = buildTemplateFromBody(body, user, existing)

      if (canChangeVisibility(access) && (body.visibility !== undefined || body.sharedMemberUids !== undefined)) {
        try {
          const patched = applyResourceVisibilityPatch(existing, body, ctx)
          updated.visibility = patched.visibility
          updated.teamId = patched.teamId
          updated.sharedMemberUids = patched.sharedMemberUids
          if (patched.teamShares?.length) updated.teamShares = patched.teamShares
        } catch (e) {
          return res.status(400).json({ error: e.message })
        }
      }

      all[idx] = updated
      await saveAllOutreachTemplates(all)
      return res.status(200).json({ template: updated })
    }

    if (method === 'DELETE') {
      const { templateId } = body
      if (!templateId) return res.status(400).json({ error: 'templateId is required' })

      const [all, allTeams] = await Promise.all([getAllOutreachTemplates(), getAllTeams()])
      const ctx = buildAccessContext(allTeams, user)
      const idx = all.findIndex((t) => t.id === templateId)
      if (idx === -1) return res.status(404).json({ error: 'Template not found' })
      const access = getResourceAccess(all[idx], user, ctx)
      if (!canDelete(access)) return res.status(403).json({ error: 'Only the owner can delete this template' })

      all.splice(idx, 1)
      await saveAllOutreachTemplates(all)
      return res.status(200).json({ message: 'Template deleted' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('outreach-templates API error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
