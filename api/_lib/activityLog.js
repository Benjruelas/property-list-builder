import { appendTeamActivity, upsertTeamActivity } from './activityStore.js'
import { normalizeResourceVisibility } from './access.js'
import {
  buildActivityCoalesceKey,
  buildActivitySummary,
  COLLAPSIBLE_ACTIVITY_TYPES,
  collapseFeedItems,
  collectActivityIdsFromFeedItems,
  expandActivityIdsForMarkSeen,
  activityCoalesceKey,
  generalizeActivitySummary,
  collapseFeedActivityItems,
} from './feedCoalesce.js'

export {
  COLLAPSIBLE_ACTIVITY_TYPES,
  buildActivityCoalesceKey,
  buildActivitySummary,
  collapseFeedItems,
  collapseFeedActivityItems,
  collectActivityIdsFromFeedItems,
  expandActivityIdsForMarkSeen,
  activityCoalesceKey,
  generalizeActivitySummary,
}

/**
 * Append or coalesce an activity record to one or more team feeds.
 *
 * @param {{ teamIds: string[], actor: { uid?: string, email?: string }, type: string, summary?: string, entity?: object, nav?: object, audience?: 'admin_only'|'resource_viewers', coalesceKey?: string|null, delta?: number, summaryContext?: object|null }} params
 */
export async function logTeamActivity({
  teamIds,
  actor,
  type,
  summary,
  entity = {},
  nav = {},
  audience = 'resource_viewers',
  coalesceKey = null,
  delta = 1,
  summaryContext = null,
}) {
  const ids = [...new Set((teamIds || []).filter(Boolean))]
  const activityType = String(type || 'general').slice(0, 64)
  const summaryContextObj = summaryContext && typeof summaryContext === 'object' ? summaryContext : null
  const initialSummary = summaryContextObj
    ? buildActivitySummary(activityType, { ...summaryContextObj, count: delta })
    : String(summary || '')
  if (ids.length === 0 || !initialSummary) return []

  const now = new Date().toISOString()
  const actorUid = actor?.uid || null
  const actorEmail = (actor?.email || '').toLowerCase().trim() || null
  const entityObj = entity && typeof entity === 'object' ? entity : {}
  const navObj = nav && typeof nav === 'object' ? nav : {}
  const key = coalesceKey || buildActivityCoalesceKey({ type: activityType, actorUid, entity: entityObj })
  const shouldCoalesce = !!key && COLLAPSIBLE_ACTIVITY_TYPES.has(activityType)

  const records = []
  for (const teamId of ids) {
    const record = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      teamId,
      type: activityType,
      actorUid,
      actorEmail,
      summary: initialSummary.slice(0, 500),
      entity: entityObj,
      nav: navObj,
      audience: audience === 'admin_only' ? 'admin_only' : 'resource_viewers',
      createdAt: now,
      coalesceKey: key,
      count: delta,
      delta,
    }
    try {
      const stored = shouldCoalesce
        ? await upsertTeamActivity(teamId, record, {
          coalesceKey: key,
          delta,
          type: activityType,
          summaryContext: summaryContextObj,
        })
        : await appendTeamActivity(teamId, record)
      if (stored) records.push(stored)
    } catch (e) {
      console.warn('logTeamActivity failed', teamId, e.message)
    }
  }
  return records
}

/**
 * Merge activity feeds from multiple teams, sorted newest first.
 */
export function mergeActivityFeeds(feeds, { limit = 50, before = null } = {}) {
  const merged = feeds.flat().sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime()
    const tb = new Date(b.createdAt || 0).getTime()
    return tb - ta
  })

  let filtered = merged
  if (before) {
    const cutoff = new Date(before).getTime()
    filtered = merged.filter((a) => new Date(a.createdAt || 0).getTime() < cutoff)
  }

  return filtered.slice(0, Math.min(Math.max(limit, 1), 100))
}

/** Derive team IDs from a resource (v2 visibility or v1 teamShares). */
export function teamIdsFromResource(resource) {
  if (!resource) return []
  const r = normalizeResourceVisibility(resource)
  if (r.teamId && r.visibility && r.visibility !== 'private') return [r.teamId]
  if (Array.isArray(r.teamShares) && r.teamShares.length) return r.teamShares.filter(Boolean)
  return []
}

/** Format actor name for summaries. */
export function actorLabel(actor) {
  const name = (actor?.displayName || '').trim()
  if (name) return name
  const email = (actor?.email || '').trim()
  if (email) return email.split('@')[0]
  return 'Someone'
}

/** Diff deal array changes for activity logging. */
export function diffDealChanges(oldDeals, newDeals) {
  const oldById = new Map()
  for (const d of oldDeals || []) {
    if (d?.id) oldById.set(d.id, d)
  }
  const newById = new Map()
  for (const d of newDeals || []) {
    if (d?.id) newById.set(d.id, d)
  }

  const changes = []
  for (const [id, nd] of newById) {
    if (!oldById.has(id)) {
      changes.push({ type: 'deal.created', deal: nd })
      continue
    }
    const od = oldById.get(id)
    if (od.status !== nd.status) {
      changes.push({ type: 'deal.moved', deal: nd, oldStatus: od.status, newStatus: nd.status })
    }
  }
  for (const [id, od] of oldById) {
    if (!newById.has(id)) {
      changes.push({ type: 'deal.removed', deal: od })
    }
  }
  return changes
}

export function dealActivityLabel(deal) {
  return (deal?.title || deal?.leadName || deal?.leadAddress || 'Deal').trim() || 'Deal'
}

/**
 * Summarize pipeline deal diffs into batched team activity payloads.
 */
export function batchPipelineDealActivities(dealChanges, { label, pipeTitle, pipelineId }) {
  const grouped = {
    'deal.created': [],
    'deal.moved': [],
    'deal.removed': [],
  }
  for (const change of dealChanges || []) {
    if (grouped[change.type]) grouped[change.type].push(change)
  }

  return Object.entries(grouped)
    .filter(([, changes]) => changes.length > 0)
    .map(([activityType, changes]) => ({
      type: activityType,
      delta: changes.length,
      summaryContext: {
        label,
        pipeTitle,
        count: changes.length,
      },
      entity: { kind: 'pipeline', pipelineId, count: changes.length },
      nav: { type: 'pipeline', pipelineId },
    }))
}
