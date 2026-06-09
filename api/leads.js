import { resolveDevBypassUser } from './lib/devBypassUsers.js'
import { getAllTeams } from './lib/teams.js'
import {
  buildAccessContext,
  getResourceAccess,
  filterVisibleResources,
  canEdit,
  canDelete,
  canChangeVisibility,
  applyResourceVisibilityPatch,
  activityAudienceForResource,
} from './lib/resourceContext.js'
import {
  logTeamActivity,
  actorLabel,
  teamIdsFromResource,
} from './lib/activityLog.js'
import { loadTagRegistry, mergeEntityTags } from './lib/tagHelpers.js'

/**
 * User-scoped leads CRM with team sharing v2. Firebase Bearer auth.
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

const KV_KEY = 'user_leads'
let fallbackStore = []

async function getAllLeads() {
  if (!kvAvailable || !kv) return fallbackStore
  try {
    const data = await kv.get(KV_KEY)
    const leads = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    const result = Array.isArray(leads) ? leads : []
    fallbackStore = result
    return result
  } catch {
    return fallbackStore
  }
}

async function saveAllLeads(leads) {
  fallbackStore = leads
  if (!kvAvailable || !kv) return
  try {
    await kv.set(KV_KEY, leads).catch(() => kv.set(KV_KEY, JSON.stringify(leads)))
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

function leadDisplayName(lead) {
  const parts = [lead?.firstName, lead?.lastName].filter(Boolean)
  if (parts.length) return parts.join(' ')
  return (lead?.address || 'Lead').trim()
}

function normalizeLeadInput(body, user, existing = null, ctx = null, tagRegistry = null) {
  const now = new Date().toISOString()
  const firstName = String(body.firstName ?? existing?.firstName ?? '').trim()
  const lastName = String(body.lastName ?? existing?.lastName ?? '').trim()
  const address = String(body.address ?? existing?.address ?? '').trim()
  if (!address) throw new Error('Address is required')
  if (!firstName && !lastName) throw new Error('First or last name is required')

  const base = {
    id: existing?.id || `lead_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    firstName,
    lastName,
    address,
    parcelId: body.parcelId !== undefined ? (body.parcelId || null) : (existing?.parcelId ?? null),
    lat: body.lat !== undefined ? body.lat : (existing?.lat ?? null),
    lng: body.lng !== undefined ? body.lng : (existing?.lng ?? null),
    phone: body.phone !== undefined ? String(body.phone || '').trim() || null : (existing?.phone ?? null),
    email: body.email !== undefined ? String(body.email || '').trim() || null : (existing?.email ?? null),
    notes: body.notes !== undefined ? String(body.notes || '') : (existing?.notes ?? ''),
    properties: body.properties !== undefined ? body.properties : (existing?.properties ?? null),
    ownerId: existing?.ownerId || user.uid,
    ownerEmail: existing?.ownerEmail || user.email,
    sharedWith: existing?.sharedWith || [],
    teamShares: existing?.teamShares || [],
    teamId: existing?.teamId ?? ctx?.team?.id ?? null,
    visibility: existing?.visibility || 'private',
    sharedMemberUids: existing?.sharedMemberUids || [],
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }

  const tags = mergeEntityTags(body, existing, tagRegistry, 'leads')
  base.tagIds = tags.tagIds
  base.tagMeta = tags.tagMeta

  if (body.visibility !== undefined || body.sharedMemberUids !== undefined || body.teamShares !== undefined) {
    return applyResourceVisibilityPatch(base, body, ctx)
  }
  return base
}

async function logLeadActivity(type, lead, user, summary, { audience } = {}) {
  const teamIds = teamIdsFromResource(lead)
  if (teamIds.length === 0) return
  await logTeamActivity({
    teamIds,
    actor: user,
    type,
    summary,
    entity: { kind: 'lead', leadId: lead.id },
    nav: { type: 'lead', leadId: lead.id },
    audience: audience || activityAudienceForResource(lead),
  })
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
    const [all, allTeams] = await Promise.all([getAllLeads(), getAllTeams()])
    const ctx = buildAccessContext(allTeams, user)

    if (method === 'GET') {
      const leads = filterVisibleResources(all, user, ctx)
      return res.status(200).json({ leads })
    }

    if (method === 'POST') {
      const tagRegistry = (body.tagIds !== undefined || body.tagMeta !== undefined)
        ? await loadTagRegistry(kv, user.uid)
        : null
      let lead
      try {
        lead = normalizeLeadInput(body, user, null, ctx, tagRegistry)
      } catch (e) {
        return res.status(400).json({ error: e.message })
      }

      if (lead.parcelId && all.some((l) => l.parcelId === lead.parcelId)) {
        const conflict = all.find((l) => l.parcelId === lead.parcelId)
        const canSee = conflict && getResourceAccess(conflict, user, ctx) !== null
        if (canSee || conflict?.ownerId === user.uid) {
          return res.status(409).json({ error: 'A lead already exists for this parcel' })
        }
      }

      all.push(lead)
      await saveAllLeads(all)

      const label = actorLabel(user)
      const name = leadDisplayName(lead)
      await logLeadActivity('lead.created', lead, user, `${label} created lead ${name}`)

      return res.status(201).json({ lead })
    }

    if (method === 'PATCH') {
      const { leadId } = body
      if (!leadId) return res.status(400).json({ error: 'leadId is required' })

      const idx = all.findIndex((l) => l.id === leadId)
      if (idx === -1) return res.status(404).json({ error: 'Lead not found' })

      const existing = all[idx]
      const access = getResourceAccess(existing, user, ctx)
      if (!canEdit(access) && access !== 'admin_view') {
        return res.status(403).json({ error: 'No access to edit this lead' })
      }
      if (access === 'admin_view') {
        return res.status(403).json({ error: 'Admins can view but not edit private leads' })
      }

      if (
        (body.visibility !== undefined || body.sharedMemberUids !== undefined || body.teamShares !== undefined || body.sharedWith !== undefined) &&
        !canChangeVisibility(access)
      ) {
        return res.status(403).json({ error: 'Only the lead owner can change sharing' })
      }

      const tagRegistry = (body.tagIds !== undefined || body.tagMeta !== undefined)
        ? await loadTagRegistry(kv, user.uid)
        : null
      let lead
      try {
        lead = normalizeLeadInput(body, user, existing, ctx, tagRegistry)
      } catch (e) {
        return res.status(400).json({ error: e.message })
      }

      if (!canChangeVisibility(access)) {
        lead.teamId = existing.teamId
        lead.visibility = existing.visibility
        lead.sharedMemberUids = existing.sharedMemberUids || []
        lead.teamShares = existing.teamShares || []
        lead.sharedWith = existing.sharedWith || []
      }

      if (lead.parcelId && all.some((l, i) => i !== idx && l.parcelId === lead.parcelId)) {
        const conflict = all.find((l, i) => i !== idx && l.parcelId === lead.parcelId)
        if (conflict && (getResourceAccess(conflict, user, ctx) !== null || conflict.ownerId === user.uid)) {
          return res.status(409).json({ error: 'A lead already exists for this parcel' })
        }
      }

      const visibilityChanged =
        lead.visibility !== existing.visibility ||
        JSON.stringify(lead.sharedMemberUids || []) !== JSON.stringify(existing.sharedMemberUids || [])

      all[idx] = lead
      await saveAllLeads(all)

      const label = actorLabel(user)
      const name = leadDisplayName(lead)
      if (visibilityChanged) {
        await logLeadActivity('lead.shared', lead, user, `${label} updated sharing on lead ${name}`)
      } else {
        await logLeadActivity('lead.updated', lead, user, `${label} updated lead ${name}`)
      }

      return res.status(200).json({ lead })
    }

    if (method === 'DELETE') {
      const { leadId } = body
      if (!leadId) return res.status(400).json({ error: 'leadId is required' })

      const idx = all.findIndex((l) => l.id === leadId)
      if (idx === -1) return res.status(404).json({ error: 'Lead not found' })
      const access = getResourceAccess(all[idx], user, ctx)
      if (!canDelete(access)) {
        return res.status(403).json({ error: 'Only the lead owner can delete this lead' })
      }

      const removed = all[idx]
      all.splice(idx, 1)
      await saveAllLeads(all)

      const label = actorLabel(user)
      const name = leadDisplayName(removed)
      await logLeadActivity('lead.deleted', removed, user, `${label} deleted lead ${name}`)

      return res.status(200).json({ message: 'Lead deleted' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('leads API error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
