/**
 * Shared team + access context for resource APIs (leads, lists, paths, pipelines, forms).
 */

import { fullTeamsIndex } from './teams.js'
import {
  resolveResourceAccess,
  canView,
  canEdit,
  canDelete,
  canChangeVisibility,
  applyVisibilityPatch,
  normalizeResourceVisibility,
  isTeamAdmin,
  userHasTeamMembership,
} from './access.js'

export function buildAccessContext(allTeams, user) {
  const team = userHasTeamMembership(allTeams, user.uid)
  return {
    team,
    teamsIndex: fullTeamsIndex(allTeams),
  }
}

/** Prefer the resource's team for role checks (multi-team users). */
export function accessContextForResource(ctx, resource) {
  const tid = resource?.teamId
  const team = tid && ctx.teamsIndex?.[tid] ? ctx.teamsIndex[tid] : ctx.team
  return { team, teamsIndex: ctx.teamsIndex }
}

export function getResourceAccess(resource, user, ctx) {
  return resolveResourceAccess(resource, user, accessContextForResource(ctx, resource))
}

export function filterVisibleResources(resources, user, ctx) {
  return resources.filter((r) => canView(getResourceAccess(r, user, ctx)))
}

export function assertExternalSharingAllowed(team, body) {
  if (body.sharedWith === undefined) return
  const arr = Array.isArray(body.sharedWith) ? body.sharedWith : []
  const emails = arr.map((e) => String(e || '').trim()).filter(Boolean)
  if (emails.length > 0 && team && !team.allowExternalSharing) {
    throw new Error('External email sharing is disabled for this team')
  }
}

export function applyResourceVisibilityPatch(existing, body, ctx) {
  assertExternalSharingAllowed(ctx.team, body)
  return applyVisibilityPatch(existing, body, ctx.team?.id || null)
}

export function activityAudienceForResource(resource, { forceAdminOnly = false } = {}) {
  if (forceAdminOnly) return 'admin_only'
  const r = normalizeResourceVisibility(resource)
  if (r.visibility === 'private') return 'admin_only'
  return 'resource_viewers'
}

export { canView, canEdit, canDelete, canChangeVisibility, isTeamAdmin, normalizeResourceVisibility }
