import { appendTeamActivity } from './activityStore.js'
import { normalizeResourceVisibility } from './access.js'

/**
 * Append an activity record to one or more team feeds.
 *
 * @param {{ teamIds: string[], actor: { uid?: string, email?: string }, type: string, summary: string, entity?: object, nav?: object, audience?: 'admin_only'|'resource_viewers' }} params
 */
export async function logTeamActivity({ teamIds, actor, type, summary, entity = {}, nav = {}, audience = 'resource_viewers' }) {
  const ids = [...new Set((teamIds || []).filter(Boolean))]
  if (ids.length === 0 || !summary) return []

  const now = new Date().toISOString()
  const actorUid = actor?.uid || null
  const actorEmail = (actor?.email || '').toLowerCase().trim() || null

  const records = []
  for (const teamId of ids) {
    const record = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      teamId,
      type: String(type || 'general').slice(0, 64),
      actorUid,
      actorEmail,
      summary: String(summary).slice(0, 500),
      entity: entity && typeof entity === 'object' ? entity : {},
      nav: nav && typeof nav === 'object' ? nav : {},
      audience: audience === 'admin_only' ? 'admin_only' : 'resource_viewers',
      createdAt: now,
    }
    try {
      await appendTeamActivity(teamId, record)
      records.push(record)
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

/** Activity types eligible for per-user unseen collapse in the feed. */
export const COLLAPSIBLE_ACTIVITY_TYPES = new Set([
  'list.parcel_added',
  'list.parcel_removed',
  'lead.updated',
  'deal.created',
  'deal.moved',
  'deal.removed',
])

function entityIdForCoalesce(type, entity) {
  if (!entity || typeof entity !== 'object') return ''
  if (type === 'list.parcel_added' || type === 'list.parcel_removed') {
    return String(entity.listId || '')
  }
  if (type === 'lead.updated') {
    return String(entity.leadId || '')
  }
  if (type === 'deal.created' || type === 'deal.moved' || type === 'deal.removed') {
    return String(entity.pipelineId || '')
  }
  return ''
}

function entityKindForCoalesce(type, entity) {
  if (type === 'list.parcel_added' || type === 'list.parcel_removed') return 'list'
  if (type === 'lead.updated') return 'lead'
  if (type === 'deal.created' || type === 'deal.moved' || type === 'deal.removed') return 'pipeline'
  return String(entity?.kind || '')
}

/**
 * Stable key for collapsing repeated unseen activities.
 * @param {{ type?: string, actorUid?: string|null, entity?: object }} activity
 * @returns {string|null}
 */
export function activityCoalesceKey(activity) {
  const type = String(activity?.type || '')
  if (!COLLAPSIBLE_ACTIVITY_TYPES.has(type)) return null
  const entity = activity?.entity && typeof activity.entity === 'object' ? activity.entity : {}
  const entityId = entityIdForCoalesce(type, entity)
  if (!entityId) return null
  const actorUid = activity?.actorUid || ''
  const entityKind = entityKindForCoalesce(type, entity)
  return `${type}|${actorUid}|${entityKind}|${entityId}`
}

/**
 * Rewrite noisy per-event summaries into generalized copy for collapsed rows.
 */
export function generalizeActivitySummary(activity, collapseCount = 1) {
  const type = String(activity?.type || '')
  const summary = String(activity?.summary || '')
  const suffix = collapseCount > 1 ? ` (${collapseCount} updates)` : ''

  if (type === 'list.parcel_added') {
    const counted = summary.match(/^(.+?) added \d+ parcels? to "(.+)"$/i)
    if (counted) return `${counted[1]} added parcels to "${counted[2]}"${suffix}`
    const plain = summary.match(/^(.+?) added parcels to "(.+)"$/i)
    if (plain) return `${plain[1]} added parcels to "${plain[2]}"${suffix}`
    return `${summary}${suffix}`
  }

  if (type === 'list.parcel_removed') {
    const counted = summary.match(/^(.+?) removed \d+ parcels? from "(.+)"$/i)
    if (counted) return `${counted[1]} removed parcels from "${counted[2]}"${suffix}`
    const plain = summary.match(/^(.+?) removed parcels from "(.+)"$/i)
    if (plain) return `${plain[1]} removed parcels from "${plain[2]}"${suffix}`
    return `${summary}${suffix}`
  }

  if (type === 'lead.updated') {
    const updated = summary.match(/^(.+?) updated lead (.+)$/i)
    if (updated) return `${updated[1]} updated lead ${updated[2]}${suffix}`
    return `${summary}${suffix}`
  }

  if (type === 'deal.created') {
    const created = summary.match(/^(.+?) added deal "(.+)" to (.+)$/i)
    if (created) return `${created[1]} added deals to ${created[3]}${suffix}`
    return `${summary}${suffix}`
  }

  if (type === 'deal.moved') {
    const moved = summary.match(/^(.+?) moved "(.+)" from (.+?) to (.+)$/i)
    if (moved) return `${moved[1]} moved deals on ${moved[4]}${suffix}`
    return `${summary}${suffix}`
  }

  if (type === 'deal.removed') {
    const removed = summary.match(/^(.+?) removed deal "(.+)" from (.+)$/i)
    if (removed) return `${removed[1]} removed deals from ${removed[3]}${suffix}`
    return `${summary}${suffix}`
  }

  return `${summary}${suffix}`
}

function buildCollapsedActivityItem(run) {
  const primary = run[0]
  const collapsedIds = run.slice(1).map((item) => item.id).filter(Boolean)
  const collapseCount = run.length
  return {
    ...primary,
    summary: generalizeActivitySummary(primary, collapseCount),
    collapseCount,
    ...(collapsedIds.length ? { collapsedIds } : {}),
  }
}

/**
 * Collapse consecutive unseen activity feed rows that share a coalesce key.
 * Notifications and seen activities break a run.
 *
 * @param {object[]} items — feed rows (newest first), each with source + unseen
 */
export function collapseFeedActivityItems(items) {
  const result = []
  let i = 0
  while (i < items.length) {
    const item = items[i]
    const key = item?.source === 'activity' && item.unseen ? activityCoalesceKey(item) : null
    if (!key) {
      result.push(item)
      i += 1
      continue
    }

    const run = [item]
    let j = i + 1
    while (j < items.length) {
      const next = items[j]
      if (next?.source !== 'activity' || !next.unseen) break
      if (activityCoalesceKey(next) !== key) break
      run.push(next)
      j += 1
    }

    result.push(run.length === 1 ? item : buildCollapsedActivityItem(run))
    i = j
  }
  return result
}

/**
 * Expand PATCH mark-seen payloads to include collapsed sibling activity ids.
 */
export function expandActivityIdsForMarkSeen(rawItems = []) {
  const ids = new Set()
  for (const item of rawItems) {
    if (item?.source !== 'activity' || !item.id) continue
    ids.add(item.id)
    if (Array.isArray(item.collapsedIds)) {
      for (const id of item.collapsedIds) {
        if (id) ids.add(id)
      }
    }
  }
  return [...ids]
}

/**
 * Collect all raw activity ids represented by collapsed feed rows.
 */
export function collectActivityIdsFromFeedItems(items = []) {
  const ids = []
  for (const item of items) {
    if (item?.source !== 'activity' || !item.id) continue
    ids.push(item.id)
    if (Array.isArray(item.collapsedIds)) ids.push(...item.collapsedIds.filter(Boolean))
  }
  return [...new Set(ids)]
}
