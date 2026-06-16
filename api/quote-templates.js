import {resolveDevBypassUser, isDevBypassAllowed} from './lib/devBypassUsers.js'
import { getAllTeams } from './lib/teams.js'
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
import { getAllQuoteTemplates, saveAllQuoteTemplates } from './lib/quoteStore.js'
import { computeQuoteTotals, defaultValidUntil } from './lib/quoteMath.js'

/**
 * Quote templates CRUD — mirrors api/forms.js pattern.
 */

async function verifyFirebaseToken(idToken) {
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY
  if (!apiKey || !idToken) return null
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
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

function buildTemplateFromBody(body, user, existing = null) {
  const now = new Date().toISOString()
  let lineItems = body.lineItems ?? existing?.lineItems ?? []
  if (body.globalMarkupPercent !== undefined && body.globalMarkupPercent !== null) {
    const rate = Math.max(0, parseFloat(body.globalMarkupPercent) || 0)
    lineItems = (lineItems || []).map((item) =>
      item?.priceOverridden ? item : { ...item, markupPercent: rate }
    )
  }
  const totals = computeQuoteTotals(lineItems, body.taxRate ?? existing?.taxRate ?? 0)
  return {
    id: existing?.id || `qtpl_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    name: String(body.name ?? existing?.name ?? 'Untitled Template').trim().slice(0, 200),
    title: String(body.title ?? existing?.title ?? '').trim().slice(0, 200),
    description: String(body.description ?? existing?.description ?? '').slice(0, 4000),
    lineItems: totals.lineItems,
    globalMarkupPercent: body.globalMarkupPercent ?? existing?.globalMarkupPercent ?? null,
    terms: String(body.terms ?? existing?.terms ?? '').slice(0, 8000),
    notes: String(body.notes ?? existing?.notes ?? '').slice(0, 4000),
    defaultValidDays: Math.max(1, parseInt(body.defaultValidDays ?? existing?.defaultValidDays ?? 30, 10) || 30),
    taxRate: totals.taxRate,
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

  const authHeader = req.headers.authorization
  const idToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  const allowDevBypass = isDevBypassAllowed(req)
  let user = allowDevBypass ? resolveDevBypassUser(idToken) : null
  if (!user) user = await verifyFirebaseToken(idToken)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { method, body = {} } = req

  try {
    if (method === 'GET') {
      const [all, allTeams] = await Promise.all([getAllQuoteTemplates(), getAllTeams()])
      const ctx = buildAccessContext(allTeams, user)
      const templates = filterVisibleResources(all, user, ctx)
      return res.status(200).json({ templates })
    }

    if (method === 'POST') {
      if (!body.name || !String(body.name).trim()) {
        return res.status(400).json({ error: 'Template name is required' })
      }
      const template = buildTemplateFromBody(body, user)
      const all = await getAllQuoteTemplates()
      all.push(template)
      await saveAllQuoteTemplates(all)
      return res.status(201).json({ template })
    }

    if (method === 'PATCH') {
      const { templateId } = body
      if (!templateId) return res.status(400).json({ error: 'templateId is required' })

      const [all, allTeams] = await Promise.all([getAllQuoteTemplates(), getAllTeams()])
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
      await saveAllQuoteTemplates(all)
      return res.status(200).json({ template: updated })
    }

    if (method === 'DELETE') {
      const { templateId } = body
      if (!templateId) return res.status(400).json({ error: 'templateId is required' })

      const [all, allTeams] = await Promise.all([getAllQuoteTemplates(), getAllTeams()])
      const ctx = buildAccessContext(allTeams, user)
      const idx = all.findIndex((t) => t.id === templateId)
      if (idx === -1) return res.status(404).json({ error: 'Template not found' })
      const access = getResourceAccess(all[idx], user, ctx)
      if (!canDelete(access)) return res.status(403).json({ error: 'Only the owner can delete this template' })

      all.splice(idx, 1)
      await saveAllQuoteTemplates(all)
      return res.status(200).json({ message: 'Template deleted' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('quote-templates API error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}

export { defaultValidUntil }
