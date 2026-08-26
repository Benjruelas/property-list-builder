/**
 * Filter team activity so resource_viewers only see events for resources they can view.
 * Admins still see all activity on teams they administer (including admin_only).
 */

import { buildAccessContext, filterVisibleResources } from './resourceContext.js'
import { getTeamMemberRole } from './access.js'
import { taskVisibleToUser } from './taskAccess.js'

const PIPELINE_KINDS = new Set([
  'pipeline',
  'deal',
  'pipelinedealstage',
  'pipelineshared',
])
const LEAD_KINDS = new Set(['lead'])
const LIST_KINDS = new Set(['list', 'listshared'])
const PATH_KINDS = new Set(['path', 'pathshared'])
const TASK_KINDS = new Set(['task'])

/**
 * Resolve the CRM resource an activity refers to for access checks.
 * Deals inherit pipeline access.
 * @returns {{ kind: 'pipeline'|'lead'|'list'|'path'|'task', id: string }|null}
 */
export function activityResourceRef(activity) {
  const entity = activity?.entity && typeof activity.entity === 'object' ? activity.entity : {}
  const nav = activity?.nav && typeof activity.nav === 'object' ? activity.nav : {}
  const rawKind = String(entity.kind || nav.type || '').toLowerCase()

  if (PIPELINE_KINDS.has(rawKind) || (!rawKind && (entity.pipelineId || nav.pipelineId))) {
    const id = entity.pipelineId || nav.pipelineId || null
    return id ? { kind: 'pipeline', id: String(id) } : null
  }
  if (LEAD_KINDS.has(rawKind)) {
    const id = entity.leadId || nav.leadId || null
    return id ? { kind: 'lead', id: String(id) } : null
  }
  if (LIST_KINDS.has(rawKind)) {
    const id = entity.listId || nav.listId || null
    return id ? { kind: 'list', id: String(id) } : null
  }
  if (PATH_KINDS.has(rawKind)) {
    const id = entity.pathId || nav.pathId || null
    return id ? { kind: 'path', id: String(id) } : null
  }
  if (TASK_KINDS.has(rawKind)) {
    const id = entity.taskId || nav.taskId || null
    return id ? { kind: 'task', id: String(id) } : null
  }
  return null
}

/**
 * @param {object[]} activities
 * @param {{ adminTeamIds: Set<string>, visibleIds: Record<string, Set<string>> }} opts
 */
export function filterActivitiesForViewer(activities, { adminTeamIds, visibleIds }) {
  const adminIds = adminTeamIds instanceof Set ? adminTeamIds : new Set(adminTeamIds || [])
  const visible = visibleIds || {}

  return (activities || []).filter((a) => {
    if (adminIds.has(a.teamId)) return true
    if (a.audience === 'admin_only') return false

    const ref = activityResourceRef(a)
    if (!ref) return true

    const allowed = visible[ref.kind]
    if (!(allowed instanceof Set)) return true
    return allowed.has(ref.id)
  })
}

function idSet(resources) {
  return new Set((resources || []).map((r) => r?.id).filter(Boolean).map(String))
}

/**
 * Load id sets for resources the user can view (used to filter resource_viewers activities).
 * Only loads kinds present in `activities` to keep feed reads light.
 */
export async function loadVisibleActivityResourceIds(user, ctx, activities = []) {
  const needed = new Set()
  for (const a of activities) {
    const ref = activityResourceRef(a)
    if (ref?.kind) needed.add(ref.kind)
  }

  const visibleIds = {
    pipeline: new Set(),
    lead: new Set(),
    list: new Set(),
    path: new Set(),
    task: new Set(),
  }

  if (needed.size === 0) return visibleIds

  const loaders = []

  if (needed.has('pipeline')) {
    loaders.push(
      (async () => {
        const { getPipelinesForUser } = await import('./pipelineRepo.js')
        visibleIds.pipeline = idSet(await getPipelinesForUser(user, ctx))
      })()
    )
  }
  if (needed.has('lead')) {
    loaders.push(
      (async () => {
        const { getLeadsForUser } = await import('./leadRepo.js')
        visibleIds.lead = idSet(await getLeadsForUser(user, ctx))
      })()
    )
  }
  if (needed.has('list')) {
    loaders.push(
      (async () => {
        const { getAllLists } = await import('./listStore.js')
        const all = await getAllLists()
        visibleIds.list = idSet(filterVisibleResources(all, user, ctx))
      })()
    )
  }
  if (needed.has('path')) {
    loaders.push(
      (async () => {
        const { getAllPaths } = await import('./pathStore.js')
        const all = await getAllPaths()
        visibleIds.path = idSet(filterVisibleResources(all, user, ctx))
      })()
    )
  }
  if (needed.has('task')) {
    loaders.push(
      (async () => {
        const { getAllTasks } = await import('./taskStore.js')
        const all = await getAllTasks()
        const visible = (all || []).filter((t) => {
          const team = t?.teamId && ctx.teamsIndex?.[t.teamId] ? ctx.teamsIndex[t.teamId] : ctx.team
          return taskVisibleToUser(t, user, team)
        })
        visibleIds.task = idSet(visible)
      })()
    )
  }

  await Promise.all(loaders)
  return visibleIds
}

/**
 * Apply admin_only + resource_viewers access filtering for a user's activity feed.
 */
export async function filterActivitiesForUser(activities, user, userTeams, allTeams) {
  const adminTeamIds = new Set(
    (userTeams || [])
      .filter((t) => getTeamMemberRole(t, user.uid) === 'admin')
      .map((t) => t.id)
  )

  const needsResourceFilter = (activities || []).some(
    (a) => !adminTeamIds.has(a.teamId) && a.audience !== 'admin_only' && activityResourceRef(a)
  )

  if (!needsResourceFilter) {
    return (activities || []).filter((a) => adminTeamIds.has(a.teamId) || a.audience !== 'admin_only')
  }

  const ctx = buildAccessContext(allTeams, user)
  const visibleIds = await loadVisibleActivityResourceIds(user, ctx, activities)
  return filterActivitiesForViewer(activities, { adminTeamIds, visibleIds })
}
