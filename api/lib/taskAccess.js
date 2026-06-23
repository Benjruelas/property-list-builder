/** Who can see or mutate server-backed team tasks (/api/tasks). */

export function taskVisibleToUser(task, user, membership) {
  if (!task || !user) return false
  if (task.ownerId === user.uid) return true
  if ((task.assignedUids || []).includes(user.uid)) return true
  if (membership && task.teamId === membership.id) {
    if (task.visibility === 'team') return true
    if (task.visibility === 'members' && (task.sharedMemberUids || []).includes(user.uid)) return true
  }
  return false
}

export function canManageTask(task, user) {
  if (!task || !user) return false
  return task.ownerId === user.uid || (task.assignedUids || []).includes(user.uid)
}

const MANAGER_ONLY_PATCH_KEYS = [
  'title',
  'scheduledAt',
  'scheduledEndAt',
  'notes',
  'assignedUids',
  'visibility',
  'sharedMemberUids',
  'leadId',
  'dealId',
  'pipelineId',
  'parcelId',
]

/** Shared viewers may only toggle completion (no other fields). */
export function sharedViewerMayPatch(body) {
  if (!body || body.completed === undefined) return false
  return !MANAGER_ONLY_PATCH_KEYS.some((key) => body[key] !== undefined)
}
