/**
 * Shared lead lookup + access for photo/report APIs.
 */

import { getAllTeams } from './teams.js'
import {
  buildAccessContext,
  getResourceAccess,
  canEdit,
  filterVisibleResources,
} from './resourceContext.js'
import { getAllLeads, saveAllLeads } from './leadStore.js'
import {
  isLeadOwner,
  userCapturedPhoto,
  userCapturedAllPhotos,
  withRepairedLeadOwnership,
} from './leadOwnership.js'

export { getAllLeads, saveAllLeads }

export async function buildLeadAccessContext(user) {
  const allTeams = await getAllTeams()
  const ctx = buildAccessContext(allTeams, user)
  return ctx
}

export async function getLeadWithAccess(user, leadId) {
  const all = await getAllLeads()
  const ctx = await buildLeadAccessContext(user)
  const lead = all.find((l) => l.id === leadId)
  if (!lead) return { lead: null, access: null, all, ctx, index: -1 }
  const access = getResourceAccess(lead, user, ctx)
  if (!access) return { lead: null, access: null, all, ctx, index: -1 }
  const index = all.findIndex((l) => l.id === leadId)
  return { lead, access, all, ctx, index }
}

export async function getVisibleLeads(user) {
  const all = await getAllLeads()
  const ctx = await buildLeadAccessContext(user)
  return filterVisibleResources(all, user, ctx)
}

export function canEditLead(access) {
  return canEdit(access) && access !== 'admin_view'
}

/** Whether the user may add, edit, or delete photos on a lead. */
export function canMutateLeadPhotos(user, lead, access, photo = null) {
  if (!user?.uid || !lead) return false
  if (isLeadOwner(user, lead)) return true
  if (canEditLead(access)) return true
  if (photo && userCapturedPhoto(user, photo)) return true
  // Legacy/mis-attributed records: user captured every photo on the lead.
  if (userCapturedAllPhotos(user, lead)) return true
  return false
}

export {
  isLeadOwner,
  userCapturedPhoto,
  userCapturedAllPhotos,
  withRepairedLeadOwnership,
}
