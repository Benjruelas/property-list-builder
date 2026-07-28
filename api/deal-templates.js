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
import { getAllDealTemplates, saveAllDealTemplates } from './_lib/dealTemplateStore.js'

function normalizeDealTasks(tasks) {
  if (!Array.isArray(tasks)) return []
  return tasks.map((t, i) => ({
    id: t.id || `dtask_${Date.now()}_${i}`,
    title: String(t.title || '').slice(0, 500),
    notes: String(t.notes || '').slice(0, 4000),
    scheduledAt: t.scheduledAt || null,
    scheduledEndAt: t.scheduledEndAt || null,
    assignedUids: Array.isArray(t.assignedUids) ? t.assignedUids.filter(Boolean) : [],
  }))
}

function normalizeFinanceRows(rows) {
  if (!Array.isArray(rows)) return []
  return rows.map((row, i) => ({
    id: row.id || `dline_${Date.now()}_${i}`,
    label: String(row.label || '').slice(0, 200),
    amount: Number(row.amount) || 0,
  }))
}

function buildTemplateFromBody(body, user, existing = null) {
  const now = new Date().toISOString()
  return {
    id: existing?.id || `dtpl_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    name: String(body.name ?? existing?.name ?? 'Untitled Template').trim().slice(0, 200),
    title: String(body.title ?? existing?.title ?? '').slice(0, 200),
    notes: String(body.notes ?? existing?.notes ?? '').slice(0, 8000),
    pipelineId: body.pipelineId ?? existing?.pipelineId ?? null,
    payments: normalizeFinanceRows(body.payments ?? existing?.payments),
    costs: normalizeFinanceRows(body.costs ?? existing?.costs),
    tasks: normalizeDealTasks(body.tasks ?? existing?.tasks),
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
      const [all, allTeams] = await Promise.all([getAllDealTemplates(), getAllTeams()])
      const ctx = buildAccessContext(allTeams, user)
      const templates = filterVisibleResources(all, user, ctx)
      return res.status(200).json({ templates })
    }

    if (method === 'POST') {
      if (!body.name || !String(body.name).trim()) {
        return res.status(400).json({ error: 'Template name is required' })
      }
      const template = buildTemplateFromBody(body, user)
      const all = await getAllDealTemplates()
      all.push(template)
      await saveAllDealTemplates(all)
      return res.status(201).json({ template })
    }

    if (method === 'PATCH') {
      const { templateId } = body
      if (!templateId) return res.status(400).json({ error: 'templateId is required' })

      const [all, allTeams] = await Promise.all([getAllDealTemplates(), getAllTeams()])
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
      await saveAllDealTemplates(all)
      return res.status(200).json({ template: updated })
    }

    if (method === 'DELETE') {
      const { templateId } = body
      if (!templateId) return res.status(400).json({ error: 'templateId is required' })

      const [all, allTeams] = await Promise.all([getAllDealTemplates(), getAllTeams()])
      const ctx = buildAccessContext(allTeams, user)
      const idx = all.findIndex((t) => t.id === templateId)
      if (idx === -1) return res.status(404).json({ error: 'Template not found' })
      const access = getResourceAccess(all[idx], user, ctx)
      if (!canDelete(access)) return res.status(403).json({ error: 'Only the owner can delete this template' })

      all.splice(idx, 1)
      await saveAllDealTemplates(all)
      return res.status(200).json({ message: 'Template deleted' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('deal-templates API error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
