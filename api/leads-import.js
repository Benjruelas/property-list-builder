/**
 * Batched lead create for CSV import.
 * POST { leads: LeadInput[], visibility?, sharedMemberUids? }
 */

import { authenticate } from './_lib/auth.js'
import { getAllTeams } from './_lib/teams.js'
import {
  buildAccessContext,
  activityAudienceForResource,
} from './_lib/resourceContext.js'
import {
  logTeamActivity,
  actorLabel,
  teamIdsFromResource,
} from './_lib/activityLog.js'
import { loadTagRegistry, syncTagMetaToCollaborators, adoptTagMetaIntoUserRegistry } from './_lib/tagHelpers.js'
import { resolveAllowedLeadStatusIds } from './_lib/leadStatuses.js'
import { getAllLeads, mutateLeads } from './_lib/leadStore.js'
import {
  loadUserAppSettings,
  resolveLeadCustomFieldDefs,
} from './_lib/normalizeLeadInput.js'
import { isKvLockUnavailable, respondKvLockUnavailable } from './_lib/kvLockErrors.js'
import { getLeadsForUser } from './_lib/leadRepo.js'
import { kv } from './_lib/kvBootstrap.js'
import { rateLimit } from './_lib/rateLimit.js'
import { prepareImportedLeads, MAX_IMPORT_BATCH, MAX_IMPORT_LEADS_PER_HOUR } from './_lib/importLeadsBatch.js'

export const config = {
  maxDuration: 30,
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { user } = await authenticate(req)
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Sign in and send Authorization: Bearer <token>.' })
  }

  const body = req.body || {}
  const inputs = body.leads
  if (!Array.isArray(inputs) || inputs.length === 0) {
    return res.status(400).json({ error: 'leads must be a non-empty array' })
  }
  if (inputs.length > MAX_IMPORT_BATCH) {
    return res.status(400).json({
      error: `Import up to ${MAX_IMPORT_BATCH} leads per request`,
    })
  }

  const isLocalDev = process.env.VERCEL_ENV === 'development'
  if (!isLocalDev) {
    const rl = await rateLimit({
      key: `leads-import:${user.uid}`,
      limit: MAX_IMPORT_LEADS_PER_HOUR,
      windowSec: 3600,
      increment: inputs.length,
    })
    if (!rl.allowed) {
      res.setHeader('Retry-After', String(rl.retryAfter))
      return res.status(429).json({
        error: 'Too many imports. Please try again later.',
        retryAfter: rl.retryAfter,
      })
    }
  }

  try {
    const [allTeams, userAppSettings] = await Promise.all([
      getAllTeams(),
      loadUserAppSettings(user.uid),
    ])
    const ctx = buildAccessContext(allTeams, user)
    const allowedStatusIds = resolveAllowedLeadStatusIds(ctx, userAppSettings)
    const fieldDefs = resolveLeadCustomFieldDefs(ctx, userAppSettings)
    const needsTags = inputs.some((row) => (
      row && (row.tagIds !== undefined || row.tagMeta !== undefined)
    ))
    const tagRegistry = needsTags ? await loadTagRegistry(kv, user.uid) : null

    const [visibleLeads, allLeads] = await Promise.all([
      getLeadsForUser(user, ctx),
      getAllLeads(),
    ])

    const { created, errors } = prepareImportedLeads({
      inputs,
      user,
      ctx,
      visibleLeads,
      allLeads,
      tagRegistry,
      allowedStatusIds,
      fieldDefs,
      visibility: body.visibility,
      sharedMemberUids: body.sharedMemberUids,
      sharedWith: body.sharedWith,
    })

    if (created.length) {
      await mutateLeads((current) => {
        const existingIds = new Set(current.map((lead) => lead.id))
        const toAdd = created.filter((lead) => !existingIds.has(lead.id))
        if (!toAdd.length) return undefined
        return [...current, ...toAdd]
      }, {
        changedResources: created.map((resource) => ({ resource })),
        appendOnly: true,
      })

      const tagMeta = created.flatMap((lead) => lead.tagMeta || [])
      if (tagMeta.length) {
        const seen = new Set()
        const uniqueMeta = tagMeta.filter((t) => {
          if (!t?.id || seen.has(t.id)) return false
          seen.add(t.id)
          return true
        })
        await adoptTagMetaIntoUserRegistry(kv, user.uid, 'leads', uniqueMeta)
        for (const lead of created) {
          if (!lead.tagMeta?.length) continue
          await syncTagMetaToCollaborators(kv, {
            resource: lead,
            type: 'leads',
            tagMeta: lead.tagMeta,
            actorUid: user.uid,
            ctx,
          })
        }
      }

      const label = actorLabel(user)
      const sample = created[0]
      const teamIds = ctx.team?.id ? [ctx.team.id] : teamIdsFromResource(sample)
      if (teamIds.length) {
        await logTeamActivity({
          teamIds,
          actor: user,
          type: 'lead.imported',
          summary: `${label} imported ${created.length} lead${created.length === 1 ? '' : 's'}`,
          entity: { kind: 'lead', leadId: sample.id, leadName: 'Imported leads' },
          nav: { type: 'leads' },
          audience: activityAudienceForResource(sample),
          delta: created.length,
          summaryContext: { label, count: created.length },
        })
      }
    }

    return res.status(200).json({ created, errors })
  } catch (err) {
    if (isKvLockUnavailable(err)) return respondKvLockUnavailable(res, err)
    console.error('leads-import API error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
