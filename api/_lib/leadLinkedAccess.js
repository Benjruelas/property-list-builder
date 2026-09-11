/**
 * Access helpers for lead-linked instances (photo reports, quotes, etc.).
 * Team members who can view/edit a lead may view/mutate resources attached to it,
 * even when they are not the resource owner.
 */

import { getLeadWithAccess, getVisibleLeads, canEditLead } from './leadAccess.js'
import { getAllTeams } from './teams.js'
import { buildAccessContext, getResourceAccess, canView, canEdit } from './resourceContext.js'

function isResourceOwner(user, resource) {
  return !!(user?.uid && resource?.ownerId && resource.ownerId === user.uid)
}

async function pipelineAccess(user, pipelineId) {
  if (!pipelineId) return null
  const { findPipelineById } = await import('./pipelineRepo.js')
  const [pipeline, allTeams] = await Promise.all([
    findPipelineById(pipelineId),
    getAllTeams(),
  ])
  if (!pipeline) return null
  const ctx = buildAccessContext(allTeams, user)
  return getResourceAccess(pipeline, user, ctx)
}

/**
 * View access: owner, or can view the linked lead, or can view the linked pipeline.
 */
export async function canAccessLeadLinkedResource(user, resource) {
  if (!user?.uid || !resource) return false
  if (isResourceOwner(user, resource)) return true

  if (resource.leadId) {
    const { lead } = await getLeadWithAccess(user, resource.leadId)
    return !!lead
  }

  if (resource.pipelineId) {
    return canView(await pipelineAccess(user, resource.pipelineId))
  }

  return false
}

/**
 * Mutate (edit/delete) access: owner, or can edit the linked lead, or can edit the linked pipeline.
 * Intentionally uses lead/pipeline canEdit (not resource canDelete) so teammates can
 * update and delete instances on shared leads/deals.
 */
export async function canMutateLeadLinkedResource(user, resource) {
  if (!user?.uid || !resource) return false
  if (isResourceOwner(user, resource)) return true

  if (resource.leadId) {
    const { lead, access } = await getLeadWithAccess(user, resource.leadId)
    return !!lead && canEditLead(access)
  }

  if (resource.pipelineId) {
    return canEdit(await pipelineAccess(user, resource.pipelineId))
  }

  return false
}

/**
 * Filter instances visible to the user (own + attached to visible leads/pipelines).
 */
export async function filterVisibleLeadLinkedResources(user, resources) {
  if (!user?.uid || !Array.isArray(resources)) return []

  const owned = []
  const withLead = []
  const withPipelineOnly = []
  for (const r of resources) {
    if (!r) continue
    if (isResourceOwner(user, r)) {
      owned.push(r)
      continue
    }
    if (r.leadId) withLead.push(r)
    else if (r.pipelineId) withPipelineOnly.push(r)
  }

  let leadVisible = []
  if (withLead.length > 0) {
    const visibleLeads = await getVisibleLeads(user)
    const visibleLeadIds = new Set(visibleLeads.map((l) => l.id))
    leadVisible = withLead.filter((r) => visibleLeadIds.has(r.leadId))
  }

  let pipelineVisible = []
  if (withPipelineOnly.length > 0) {
    const allTeams = await getAllTeams()
    const ctx = buildAccessContext(allTeams, user)
    const { getPipelinesForUser } = await import('./pipelineRepo.js')
    const pipelines = await getPipelinesForUser(user, ctx)
    const pipeIds = new Set(pipelines.map((p) => p.id))
    pipelineVisible = withPipelineOnly.filter((r) => pipeIds.has(r.pipelineId))
  }

  return [...owned, ...leadVisible, ...pipelineVisible]
}
