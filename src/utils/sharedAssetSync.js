import { JOB_STATUS } from '@/photos/PhotoUploadManager'
import { parseEntityKey } from '@/photos/entityRef'

/** Count in-flight photo uploads per lead id. */
export function countPendingUploadsByLeadId(jobs = []) {
  const counts = new Map()
  for (const job of jobs) {
    if (job.status === JOB_STATUS.done) continue
    const ref = job.entityRef || parseEntityKey(job.entityKey)
    if (ref.entityType !== 'lead') continue
    const leadId = ref.leadId || ref.entityId
    if (!leadId) continue
    counts.set(leadId, (counts.get(leadId) || 0) + 1)
  }
  return counts
}

/** True when the user may be viewing assets owned or edited by collaborators. */
export function shouldEnableSharedAssetSync({ teams = [], leads = [], pipelines = [], currentUserId } = {}) {
  if (!currentUserId) return false
  if (teams.length > 0) return true

  const hasSharedLead = leads.some((lead) => {
    if (!lead) return false
    if (lead.ownerId && lead.ownerId !== currentUserId) return true
    if (lead.visibility && lead.visibility !== 'private') return true
    if (Array.isArray(lead.sharedMemberUids) && lead.sharedMemberUids.length > 0) return true
    if (Array.isArray(lead.teamShares) && lead.teamShares.length > 0) return true
    return false
  })
  if (hasSharedLead) return true

  return pipelines.some((pipeline) => {
    if (!pipeline) return false
    if (pipeline.ownerId && pipeline.ownerId !== currentUserId) return true
    if (pipeline.visibility && pipeline.visibility !== 'private') return true
    if (Array.isArray(pipeline.sharedMemberUids) && pipeline.sharedMemberUids.length > 0) return true
    if (Array.isArray(pipeline.teamShares) && pipeline.teamShares.length > 0) return true
    return false
  })
}
