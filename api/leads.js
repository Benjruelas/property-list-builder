import { authenticate } from './lib/auth.js'
import { getAllTeams } from './lib/teams.js'
import {
  buildAccessContext,
  getResourceAccess,
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
import { loadTagRegistry, mergeEntityTags, syncTagMetaToCollaborators, collectDealTagMetaFromPipeline, collectTagMetaFromEntities, hydrateUserRegistryFromTagMeta, adoptTagMetaIntoUserRegistry } from './lib/tagHelpers.js'
import { resolveAllowedLeadStatusIds, normalizeLeadStatusValue } from './lib/leadStatuses.js'
import { normalizeLeadContactsForStorage } from './lib/leadContact.js'
import { getAllLeads, mutateLeads, deleteLeadFromStore } from './lib/leadStore.js'
import { getLeadsForUser } from './lib/leadRepo.js'
import { deleteLeadContentFromStorage } from './lib/leadCleanup.js'
import { withRepairedLeadOwnership } from './lib/leadOwnership.js'
import { flags } from './lib/flags.js'
import {
  DATAVER_LEADS,
  getUserDataVersion,
  parseIfNoneMatch,
} from './lib/dataVersion.js'
import { projectLeadsForList } from './lib/leadListProjection.js'
import { paginateArray } from './lib/pagination.js'
import { kv, kvAvailable } from './lib/kvBootstrap.js'

/**
 * User-scoped leads CRM with team sharing v2. Firebase Bearer auth.
 */

function userDataKey(uid) {
  return `user_data_${uid}`
}

async function loadUserAppSettings(uid) {
  if (!kvAvailable || !kv || !uid) return null
  try {
    const data = await kv.get(userDataKey(uid))
    const parsed = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    return parsed?.appSettings || null
  } catch {
    return null
  }
}

const ACTIVITY_TYPES = new Set(['call', 'text', 'email', 'note', 'status', 'deal', 'photo', 'report'])
const MAX_LEAD_ACTIVITY = 200

function leadDisplayName(lead) {
  const parts = [lead?.firstName, lead?.lastName].filter(Boolean)
  if (parts.length) return parts.join(' ')
  return (lead?.address || 'Lead').trim()
}

function normalizeLeadStatus(value, existing, allowedIds) {
  return normalizeLeadStatusValue(value, existing, allowedIds)
}

function normalizeActivityEntry(entry, user, now) {
  if (!entry || typeof entry !== 'object') {
    throw new Error('activity entry is required')
  }
  const type = String(entry.type || '').trim()
  if (!ACTIVITY_TYPES.has(type)) {
    throw new Error(`Invalid activity type: ${type}`)
  }
  const summary = String(entry.summary || '').trim()
  if (!summary) throw new Error('activity summary is required')
  return {
    id: entry.id || `act_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    type,
    at: entry.at || now,
    summary: summary.slice(0, 500),
    meta: entry.meta && typeof entry.meta === 'object' ? entry.meta : {},
    byUid: entry.byUid || user.uid,
  }
}

function normalizeLeadInput(body, user, existing = null, ctx = null, tagRegistry = null, allowedStatusIds = null) {
  const now = new Date().toISOString()
  const firstName = String(body.firstName ?? existing?.firstName ?? '').trim()
  const lastName = String(body.lastName ?? existing?.lastName ?? '').trim()
  const address = String(body.address ?? existing?.address ?? '').trim()
  if (!firstName && !lastName) throw new Error('First or last name is required')

  const contact = normalizeLeadContactsForStorage(body, existing)

  const base = {
    id: existing?.id || `lead_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    firstName,
    lastName,
    address,
    parcelId: body.parcelId !== undefined ? (body.parcelId || null) : (existing?.parcelId ?? null),
    lat: body.lat !== undefined ? body.lat : (existing?.lat ?? null),
    lng: body.lng !== undefined ? body.lng : (existing?.lng ?? null),
    phone: contact.phone,
    email: contact.email,
    phones: contact.phones,
    emails: contact.emails,
    phoneDetails: contact.phoneDetails,
    emailDetails: contact.emailDetails,
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

  const allowedIds = allowedStatusIds || resolveAllowedLeadStatusIds(ctx, null)
  const nextStatus = normalizeLeadStatus(body.status, existing, allowedIds)
  base.status = nextStatus
  if (body.status !== undefined && (!existing || nextStatus !== existing.status)) {
    base.statusUpdatedAt = now
  } else {
    base.statusUpdatedAt = existing?.statusUpdatedAt || (existing?.createdAt || now)
  }
  base.activity = Array.isArray(existing?.activity) ? existing.activity : []
  base.photos = body.photos !== undefined
    ? (Array.isArray(body.photos) ? body.photos : existing?.photos || [])
    : (existing?.photos || [])
  base.files = body.files !== undefined
    ? (Array.isArray(body.files) ? body.files : existing?.files || [])
    : (existing?.files || [])

  if (body.visibility !== undefined || body.sharedMemberUids !== undefined || body.teamShares !== undefined) {
    return applyResourceVisibilityPatch(base, body, ctx)
  }
  return base
}

function leadSharingPatchChanges(existing, body) {
  if (body.visibility !== undefined && body.visibility !== (existing.visibility || 'private')) {
    return true
  }
  if (body.sharedMemberUids !== undefined) {
    const next = JSON.stringify([...(body.sharedMemberUids || [])].sort())
    const prev = JSON.stringify([...(existing.sharedMemberUids || [])].sort())
    if (next !== prev) return true
  }
  if (body.teamShares !== undefined) {
    const next = JSON.stringify([...(body.teamShares || [])].sort())
    const prev = JSON.stringify([...(existing.teamShares || [])].sort())
    if (next !== prev) return true
  }
  if (body.sharedWith !== undefined) {
    const next = JSON.stringify(body.sharedWith || [])
    const prev = JSON.stringify(existing.sharedWith || [])
    if (next !== prev) return true
  }
  return false
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, If-None-Match')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const { user } = await authenticate(req)

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Sign in and send Authorization: Bearer <token>.' })
  }

  const { method, body = {} } = req
  const query = req.query || {}

  try {
    const [allTeams, userAppSettings] = await Promise.all([
      getAllTeams(),
      loadUserAppSettings(user.uid),
    ])
    const ctx = buildAccessContext(allTeams, user)
    const allowedStatusIds = resolveAllowedLeadStatusIds(ctx, userAppSettings)

    if (method === 'GET') {
      if (flags.VERSIONED_POLL()) {
        const clientVer = parseIfNoneMatch(req)
        const serverVer = await getUserDataVersion(DATAVER_LEADS, user.uid)
        if (clientVer && clientVer === serverVer) {
          res.setHeader('ETag', `"${serverVer}"`)
          return res.status(304).end()
        }
      }

      const leads = await getLeadsForUser(user, ctx)
      const singleLeadId = String(query.leadId || '').trim()
      if (singleLeadId) {
        const lead = leads.find((l) => l.id === singleLeadId)
        if (!lead) return res.status(404).json({ error: 'Lead not found' })
        if (flags.VERSIONED_POLL()) {
          const serverVer = await getUserDataVersion(DATAVER_LEADS, user.uid)
          res.setHeader('ETag', `"${serverVer}"`)
        }
        return res.status(200).json({ lead })
      }

      const useListView = flags.LEADS_LIST_VIEW() && query.view === 'list'
      const payload = useListView ? projectLeadsForList(leads) : leads

      if (kvAvailable && kv) {
        const tagMeta = collectTagMetaFromEntities(leads)
        await hydrateUserRegistryFromTagMeta(kv, user.uid, 'leads', tagMeta)
      }
      if (flags.VERSIONED_POLL()) {
        const serverVer = await getUserDataVersion(DATAVER_LEADS, user.uid)
        res.setHeader('ETag', `"${serverVer}"`)
      }
      // Opt-in cursor pagination (?limit=&cursor=) — full array without limit.
      const page = paginateArray(payload, query)
      if (page.paginated) {
        return res.status(200).json({ leads: page.items, nextCursor: page.nextCursor })
      }
      return res.status(200).json({ leads: payload })
    }

    if (method === 'POST') {
      const tagRegistry = (body.tagIds !== undefined || body.tagMeta !== undefined)
        ? await loadTagRegistry(kv, user.uid)
        : null
      let lead
      try {
        lead = normalizeLeadInput(body, user, null, ctx, tagRegistry, allowedStatusIds)
      } catch (e) {
        return res.status(400).json({ error: e.message })
      }

      const all = await getAllLeads()
      if (lead.parcelId && all.some((l) => l.parcelId === lead.parcelId)) {
        const conflict = all.find((l) => l.parcelId === lead.parcelId)
        const canSee = conflict && getResourceAccess(conflict, user, ctx) !== null
        if (canSee || conflict?.ownerId === user.uid) {
          return res.status(409).json({ error: 'A lead already exists for this parcel' })
        }
      }

      await mutateLeads((current) => [...current, lead], {
        changedResources: [{ resource: lead }],
      })

      if (lead.tagMeta?.length) {
        await syncTagMetaToCollaborators(kv, {
          resource: lead,
          type: 'leads',
          tagMeta: lead.tagMeta,
          actorUid: user.uid,
          ctx,
        })
        await adoptTagMetaIntoUserRegistry(kv, user.uid, 'leads', lead.tagMeta)
      }

      const label = actorLabel(user)
      const name = leadDisplayName(lead)
      await logLeadActivity('lead.created', lead, user, `${label} created lead ${name}`)

      return res.status(201).json({ lead })
    }

    if (method === 'PATCH') {
      const { leadId, action } = body
      if (!leadId) return res.status(400).json({ error: 'leadId is required' })

      const all = await getAllLeads()
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

      if (action === 'append-activity') {
        const now = new Date().toISOString()
        let entry
        try {
          entry = normalizeActivityEntry(body.entry, user, now)
        } catch (e) {
          return res.status(400).json({ error: e.message })
        }
        const activities = [...(existing.activity || []), entry]
        const lead = {
          ...existing,
          activity: activities.length > MAX_LEAD_ACTIVITY
            ? activities.slice(-MAX_LEAD_ACTIVITY)
            : activities,
          updatedAt: now,
        }
        await mutateLeads((current) => {
          const at = current.findIndex((l) => l.id === leadId)
          if (at === -1) return undefined
          const next = [...current]
          next[at] = lead
          return next
        }, { changedResources: [{ resource: lead, prevResource: existing }] })
        return res.status(200).json({ lead })
      }

      if (leadSharingPatchChanges(existing, body) && !canChangeVisibility(access)) {
        return res.status(403).json({ error: 'Only the lead owner can change sharing' })
      }

      const tagRegistry = (body.tagIds !== undefined || body.tagMeta !== undefined)
        ? await loadTagRegistry(kv, user.uid)
        : null
      let lead
      try {
        lead = normalizeLeadInput(body, user, existing, ctx, tagRegistry, allowedStatusIds)
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

      await mutateLeads((current) => {
        const at = current.findIndex((l) => l.id === leadId)
        if (at === -1) return undefined
        const next = [...current]
        next[at] = lead
        return next
      }, { changedResources: [{ resource: lead, prevResource: existing }] })

      if (body.tagIds !== undefined || body.tagMeta !== undefined) {
        await syncTagMetaToCollaborators(kv, {
          resource: lead,
          type: 'leads',
          tagMeta: lead.tagMeta,
          actorUid: user.uid,
          ctx,
        })
        await adoptTagMetaIntoUserRegistry(kv, user.uid, 'leads', lead.tagMeta)
      }

      if (visibilityChanged && lead.tagMeta?.length) {
        await syncTagMetaToCollaborators(kv, {
          resource: lead,
          type: 'leads',
          tagMeta: lead.tagMeta,
          actorUid: user.uid,
          ctx,
        })
      }

      const label = actorLabel(user)
      const name = leadDisplayName(lead)
      if (visibilityChanged) {
        await logLeadActivity('lead.shared', lead, user, `${label} updated sharing on lead ${name}`)
        const { rebuildSharedIndexForLead } = await import('./lib/leadRepo.js')
        await rebuildSharedIndexForLead(lead, allTeams)
      } else {
        await logLeadActivity('lead.updated', lead, user, `${label} updated lead ${name}`)
      }

      return res.status(200).json({ lead })
    }

    if (method === 'DELETE') {
      const { leadId } = body
      if (!leadId) return res.status(400).json({ error: 'leadId is required' })

      const all = await getAllLeads()
      const idx = all.findIndex((l) => l.id === leadId)
      if (idx === -1) return res.status(404).json({ error: 'Lead not found' })
      const candidate = withRepairedLeadOwnership(all[idx], user)
      const access = getResourceAccess(candidate, user, ctx)
      if (!canDelete(access)) {
        return res.status(403).json({ error: 'Only the lead owner can delete this lead' })
      }

      const removed = candidate
      await deleteLeadContentFromStorage(removed)
      await deleteLeadFromStore(leadId)

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
