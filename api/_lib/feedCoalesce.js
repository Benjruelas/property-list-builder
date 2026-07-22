/** @typedef {{ type?: string, actorUid?: string|null, entity?: object, coalesceKey?: string|null, count?: number, delta?: number, summary?: string, title?: string, body?: string, data?: object, source?: string, unseen?: boolean, id?: string, createdAt?: string, collapsedIds?: string[] }} FeedCoalesceItem */

export const ACTIVITY_COALESCE_WINDOW_MS = 2 * 60 * 60 * 1000
export const ACTIVITY_COALESCE_SCAN_LIMIT = 30

export const COLLAPSIBLE_ACTIVITY_TYPES = new Set([
  'list.parcel_added',
  'list.parcel_removed',
  'lead.created',
  'lead.updated',
  'deal.created',
  'deal.moved',
  'deal.removed',
  'lead.file_uploaded',
  'deal.file_uploaded',
  'task.created',
])

export const COLLAPSIBLE_NOTIFICATION_TYPES = new Set([
  'pipelineDealStage',
  'pipelineLeadStage',
])

function entityIdForActivityCoalesce(type, entity) {
  if (!entity || typeof entity !== 'object') return ''
  if (type === 'list.parcel_added' || type === 'list.parcel_removed') {
    return String(entity.listId || '')
  }
  if (type === 'lead.updated') {
    return String(entity.leadId || '')
  }
  if (type === 'lead.created') {
    return '_batch'
  }
  if (type === 'deal.created' || type === 'deal.moved' || type === 'deal.removed') {
    return String(entity.pipelineId || '')
  }
  if (type === 'lead.file_uploaded') {
    return String(entity.leadId || '')
  }
  if (type === 'deal.file_uploaded') {
    return String(entity.dealId || entity.pipelineId || '')
  }
  if (type === 'task.created') {
    return String(entity.taskId || entity.pipelineId || '_batch')
  }
  return String(entity.listId || entity.leadId || entity.pipelineId || entity.dealId || entity.taskId || '')
}

function entityKindForActivityCoalesce(type, entity) {
  if (type === 'list.parcel_added' || type === 'list.parcel_removed') return 'list'
  if (type === 'lead.created' || type === 'lead.updated' || type === 'lead.file_uploaded') return 'lead'
  if (type === 'deal.created' || type === 'deal.moved' || type === 'deal.removed' || type === 'deal.file_uploaded') {
    return type.startsWith('deal.') && entity?.pipelineId ? 'pipeline' : 'deal'
  }
  if (type === 'task.created') return 'task'
  return String(entity?.kind || '')
}

/**
 * @param {{ type?: string, actorUid?: string|null, entity?: object }} params
 * @returns {string|null}
 */
export function buildActivityCoalesceKey({ type, actorUid, entity }) {
  const activityType = String(type || '')
  if (!COLLAPSIBLE_ACTIVITY_TYPES.has(activityType)) return null
  const entityObj = entity && typeof entity === 'object' ? entity : {}
  const entityId = entityIdForActivityCoalesce(activityType, entityObj)
  if (!entityId) return null
  const kind = entityKindForActivityCoalesce(activityType, entityObj)
  return `${activityType}:${actorUid || ''}:${kind}:${entityId}`
}

/**
 * @param {{ type?: string, data?: object, coalesceKey?: string|null }} params
 * @returns {string|null}
 */
export function buildNotificationCoalesceKey({ type, data, coalesceKey = null }) {
  if (coalesceKey) return coalesceKey
  const notificationType = String(type || '')
  if (!COLLAPSIBLE_NOTIFICATION_TYPES.has(notificationType)) return null
  const payload = data && typeof data === 'object' ? data : {}
  if (notificationType === 'pipelineDealStage' || notificationType === 'pipelineLeadStage') {
    if (payload.pipelineId) return `${notificationType}:${payload.pipelineId}`
  }
  return null
}

export function isWithinActivityCoalesceWindow(createdAt, now = Date.now(), windowMs = ACTIVITY_COALESCE_WINDOW_MS) {
  const ts = new Date(createdAt || 0).getTime()
  if (!ts) return false
  return now - ts <= windowMs
}

function plural(count, singular, pluralWord = `${singular}s`) {
  return count === 1 ? singular : pluralWord
}

/**
 * @param {string} type
 * @param {{ label?: string, count?: number, listName?: string, pipeTitle?: string, leadName?: string, taskTitle?: string }} ctx
 */
export function buildActivitySummary(type, ctx = {}) {
  const label = String(ctx.label || 'Someone')
  const count = Math.max(1, Number(ctx.count) || 1)
  const listName = ctx.listName || 'list'
  const pipeTitle = ctx.pipeTitle || 'pipeline'
  const leadName = ctx.leadName || 'Lead'
  const taskTitle = ctx.taskTitle || 'task'

  switch (type) {
    case 'list.parcel_added':
      return `${label} added ${count} ${plural(count, 'parcel')} to "${listName}"`
    case 'list.parcel_removed':
      return `${label} removed ${count} ${plural(count, 'parcel')} from "${listName}"`
    case 'lead.created':
      return count > 1
        ? `${label} created ${count} leads`
        : `${label} created lead ${leadName}`
    case 'lead.updated':
      return count > 1
        ? `${label} updated ${count} leads`
        : `${label} updated lead ${leadName}`
    case 'deal.created':
      return `${label} added ${count} ${plural(count, 'deal')} to ${pipeTitle}`
    case 'deal.moved':
      return `${label} moved ${count} ${plural(count, 'deal')} in ${pipeTitle}`
    case 'deal.removed':
      return `${label} removed ${count} ${plural(count, 'deal')} from ${pipeTitle}`
    case 'lead.file_uploaded':
      return count > 1
        ? `${label} uploaded ${count} files to leads`
        : `${label} uploaded a file to lead ${leadName}`
    case 'deal.file_uploaded':
      return count > 1
        ? `${label} uploaded ${count} files to deals`
        : `${label} uploaded a file to deal ${leadName}`
    case 'task.created':
      return count > 1
        ? `${label} created ${count} tasks`
        : `${label} created task ${taskTitle}`
    default:
      return `${label} posted an update`
  }
}

/**
 * @param {string} type
 * @param {{ count?: number, pipelineTitle?: string, title?: string, body?: string }} ctx
 */
export function buildNotificationContent(type, ctx = {}) {
  const count = Math.max(1, Number(ctx.count) || 1)
  const pipelineTitle = ctx.pipelineTitle || 'pipeline'

  if (type === 'pipelineDealStage') {
    return {
      title: count > 1 ? 'Deals moved' : 'Deal moved',
      body: count > 1
        ? `${count} deals moved in ${pipelineTitle}`
        : String(ctx.body || ctx.title || 'A deal was moved'),
    }
  }

  if (type === 'pipelineLeadStage') {
    return {
      title: count > 1 ? 'Leads moved' : 'Lead moved',
      body: count > 1
        ? `${count} leads moved in ${pipelineTitle}`
        : String(ctx.body || ctx.title || 'A lead was moved'),
    }
  }

  return {
    title: String(ctx.title || 'Notification'),
    body: String(ctx.body || ''),
  }
}

/** @deprecated use buildActivityCoalesceKey */
export function activityCoalesceKey(activity) {
  if (activity?.coalesceKey) return activity.coalesceKey
  return buildActivityCoalesceKey({
    type: activity?.type,
    actorUid: activity?.actorUid,
    entity: activity?.entity,
  })
}

/** @deprecated use buildActivitySummary via collapse count */
export function generalizeActivitySummary(activity, collapseCount = 1) {
  const type = String(activity?.type || '')
  const ctx = {
    label: String(activity?.summary || '').split(' ')[0] || 'Someone',
    count: collapseCount,
    listName: activity?.entity?.listName,
    pipeTitle: activity?.entity?.pipeTitle,
    leadName: activity?.entity?.leadName,
  }
  if (type && COLLAPSIBLE_ACTIVITY_TYPES.has(type)) {
    return buildActivitySummary(type, ctx)
  }
  const suffix = collapseCount > 1 ? ` (${collapseCount} updates)` : ''
  return `${activity?.summary || ''}${suffix}`
}

/**
 * @param {FeedCoalesceItem} item
 * @returns {string|null}
 */
export function feedItemCoalesceKey(item) {
  if (item?.coalesceKey) return item.coalesceKey
  if (item?.source === 'notification') {
    return buildNotificationCoalesceKey({ type: item.type, data: item.nav || item.data })
  }
  if (item?.source === 'activity') {
    return buildActivityCoalesceKey({
      type: item.type,
      actorUid: item.actorUid,
      entity: item.entity,
    })
  }
  return null
}

function mergeFeedGroup(group) {
  const sorted = [...group].sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  )
  const primary = sorted[0]
  const collapsedIds = sorted.slice(1).map((item) => item.id).filter(Boolean)
  const count = sorted.reduce((sum, item) => sum + (item.count || 1), 0)
  const mergedCollapsedIds = [
    ...collapsedIds,
    ...sorted.flatMap((item) => item.collapsedIds || []),
  ].filter(Boolean)

  let summary = primary.summary
  let title = primary.title
  let body = primary.body

  if (primary.source === 'activity') {
    summary = buildActivitySummary(primary.type, {
      label: (primary.summary || '').split(' ')[0] || 'Someone',
      count,
      listName: primary.entity?.listName,
      pipeTitle: primary.entity?.pipeTitle || primary.entity?.pipelineTitle,
      leadName: primary.entity?.leadName,
      taskTitle: primary.entity?.taskTitle,
    })
  } else if (primary.source === 'notification') {
    const content = buildNotificationContent(primary.type, {
      count,
      pipelineTitle: primary.nav?.pipelineTitle || primary.data?.pipelineTitle,
      body: primary.body,
      title: primary.title,
    })
    title = content.title
    body = content.body
    summary = title
  }

  return {
    ...primary,
    summary,
    title,
    body,
    count,
    collapseCount: sorted.length,
    ...(mergedCollapsedIds.length ? { collapsedIds: [...new Set(mergedCollapsedIds)] } : {}),
  }
}

/**
 * Collapse unread/unseen feed rows that share a coalesce key.
 * @param {FeedCoalesceItem[]} items
 */
export function collapseFeedItems(items) {
  const list = Array.isArray(items) ? items : []
  const consumed = new Set()
  const result = []

  for (let i = 0; i < list.length; i += 1) {
    if (consumed.has(i)) continue
    const item = list[i]
    const key = item?.unseen ? feedItemCoalesceKey(item) : null
    if (!key) {
      result.push(item)
      continue
    }

    const group = [item]
    const indices = [i]
    for (let j = i + 1; j < list.length; j += 1) {
      if (consumed.has(j)) continue
      const other = list[j]
      if (!other?.unseen || feedItemCoalesceKey(other) !== key) continue
      group.push(other)
      indices.push(j)
    }

    if (group.length === 1) {
      result.push(item)
    } else {
      result.push(mergeFeedGroup(group))
      for (const idx of indices) consumed.add(idx)
    }
  }

  return result.sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  )
}

/** @deprecated alias */
export const collapseFeedActivityItems = collapseFeedItems

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

export function collectActivityIdsFromFeedItems(items = []) {
  const ids = []
  for (const item of items) {
    if (item?.source !== 'activity' || !item.id) continue
    ids.push(item.id)
    if (Array.isArray(item.collapsedIds)) ids.push(...item.collapsedIds.filter(Boolean))
  }
  return [...new Set(ids)]
}
