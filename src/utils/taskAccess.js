/** Client mirror of api/lib/taskAccess.js for server-backed tasks. */

export function canManageServerTask(task, user, teamMembership = null) {
  if (!task || task.__source !== 'server' || !user?.uid) return false
  if (task.ownerId === user.uid) return true
  if ((task.assignedUids || []).includes(user.uid)) return true
  if (!teamMembership || task.teamId !== teamMembership.id) return false
  if (task.visibility === 'team') return true
  if (task.visibility === 'members' && (task.sharedMemberUids || []).includes(user.uid)) {
    return true
  }
  return false
}

export function canDeleteServerTask(task, user) {
  if (!task || task.__source !== 'server' || !user?.uid) return false
  return task.ownerId === user.uid
}
