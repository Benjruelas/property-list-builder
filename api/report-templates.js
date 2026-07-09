import { requireAuth } from './lib/apiAuth.js'
import { getAllTeams } from './lib/teams.js'
import {
  buildAccessContext,
  getResourceAccess,
  filterVisibleResources,
  canEdit,
  canDelete,
  canChangeVisibility,
  applyResourceVisibilityPatch,
} from './lib/resourceContext.js'
import { getAllReportTemplates, saveAllReportTemplates } from './lib/reportStore.js'

/**
 * Report layout templates CRUD — mirrors api/quote-templates.js pattern.
 */

function normalizeTemplateSections(sections) {
  if (!Array.isArray(sections)) return []
  return sections
    .map((s, i) => ({
      id: s.id || `sec_${Date.now()}_${i}`,
      subtitle: String(s.subtitle || '').slice(0, 200),
      description: String(s.description || '').slice(0, 4000),
      photoIds: [],
      order: typeof s.order === 'number' ? s.order : i,
    }))
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({ ...s, order: i }))
}

function buildTemplateFromBody(body, user, existing = null) {
  const now = new Date().toISOString()
  return {
    id: existing?.id || `rtpl_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    name: String(body.name ?? existing?.name ?? 'Untitled Template').trim().slice(0, 200),
    title: String(body.title ?? existing?.title ?? 'Photo Report').trim().slice(0, 200),
    sections: normalizeTemplateSections(body.sections ?? existing?.sections ?? []),
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
      const [all, allTeams] = await Promise.all([getAllReportTemplates(), getAllTeams()])
      const ctx = buildAccessContext(allTeams, user)
      const templates = filterVisibleResources(all, user, ctx)
      return res.status(200).json({ templates })
    }

    if (method === 'POST') {
      if (!body.name || !String(body.name).trim()) {
        return res.status(400).json({ error: 'Template name is required' })
      }
      const template = buildTemplateFromBody(body, user)
      const all = await getAllReportTemplates()
      all.push(template)
      await saveAllReportTemplates(all)
      return res.status(201).json({ template })
    }

    if (method === 'PATCH') {
      const { templateId } = body
      if (!templateId) return res.status(400).json({ error: 'templateId is required' })

      const [all, allTeams] = await Promise.all([getAllReportTemplates(), getAllTeams()])
      const idx = all.findIndex((t) => t.id === templateId)
      if (idx === -1) return res.status(404).json({ error: 'Template not found' })

      const existing = all[idx]
      const ctx = buildAccessContext(allTeams, user)
      const access = getResourceAccess(existing, user, ctx)
      if (!canEdit(access)) {
        return res.status(403).json({ error: 'You do not have access to edit this template' })
      }

      const updated = buildTemplateFromBody(body, user, existing)
      if (body.sharedWith !== undefined && canChangeVisibility(access)) {
        const emails = [...new Set((Array.isArray(body.sharedWith) ? body.sharedWith : []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))]
        updated.sharedWith = emails.slice(0, 50)
      } else {
        updated.sharedWith = existing.sharedWith || []
      }

      if (body.teamShares !== undefined && canChangeVisibility(access)) {
        const unique = [...new Set((Array.isArray(body.teamShares) ? body.teamShares : []).filter(Boolean))]
        for (const tid of unique) {
          const team = ctx.teamsIndex[tid]
          if (!team) return res.status(400).json({ error: `Team not found: ${tid}` })
        }
        updated.teamShares = unique
      }

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
      await saveAllReportTemplates(all)
      return res.status(200).json({ template: updated })
    }

    if (method === 'DELETE') {
      const { templateId } = body
      if (!templateId) return res.status(400).json({ error: 'templateId is required' })

      const [all, allTeams] = await Promise.all([getAllReportTemplates(), getAllTeams()])
      const ctx = buildAccessContext(allTeams, user)
      const idx = all.findIndex((t) => t.id === templateId)
      if (idx === -1) return res.status(404).json({ error: 'Template not found' })
      const access = getResourceAccess(all[idx], user, ctx)
      if (!canDelete(access)) return res.status(403).json({ error: 'Only the owner can delete this template' })

      all.splice(idx, 1)
      await saveAllReportTemplates(all)
      return res.status(200).json({ message: 'Template deleted' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('report-templates API error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
