/**
 * Client-side mirror of api/lib/access.js for UI gating.
 */

export const VISIBILITY = {
  PRIVATE: 'private',
  TEAM: 'team',
  MEMBERS: 'members',
}

export function normalizeResourceVisibility(resource) {
  if (!resource) return resource
  const r = { ...resource }
  if (r.visibility && ['private', 'team', 'members'].includes(r.visibility)) {
    return r
  }
  const teamShares = Array.isArray(r.teamShares) ? r.teamShares.filter(Boolean) : []
  if (teamShares.length > 0) {
    r.visibility = VISIBILITY.TEAM
    r.teamId = r.teamId || teamShares[0]
  } else {
    r.visibility = VISIBILITY.PRIVATE
  }
  r.sharedMemberUids = Array.isArray(r.sharedMemberUids) ? r.sharedMemberUids : []
  return r
}

export function getTeamMemberRole(team, uid) {
  if (!team || !uid) return null
  if (team.ownerId === uid) return 'admin'
  const m = (team.members || []).find((mem) => mem.uid === uid)
  if (!m) return null
  if (m.role === 'admin' || m.role === 'owner') return 'admin'
  return 'member'
}

export function isTeamAdmin(team, uid) {
  return getTeamMemberRole(team, uid) === 'admin'
}

function sharedWithUser(resource, uid, teamId) {
  const r = normalizeResourceVisibility(resource)
  if (r.ownerId === uid) return true
  if (r.visibility === VISIBILITY.PRIVATE) return false
  if (r.teamId && teamId && r.teamId !== teamId) return false
  if (r.visibility === VISIBILITY.TEAM) return true
  if (r.visibility === VISIBILITY.MEMBERS) {
    return (r.sharedMemberUids || []).includes(uid)
  }
  return false
}

export function resolveResourceAccess(resource, user, team = null) {
  if (!resource || !user?.uid) return null
  const r = normalizeResourceVisibility(resource)
  if (r.ownerId === user.uid) return 'owner'

  const role = team ? getTeamMemberRole(team, user.uid) : null
  const isAdmin = role === 'admin'

  if (team && r.teamId === team.id && isAdmin) {
    if (r.visibility === VISIBILITY.PRIVATE) return 'admin_view'
    return 'admin'
  }

  if (sharedWithUser(r, user.uid, team?.id)) return 'collaborator'

  if (Array.isArray(r.teamShares) && r.teamShares.length > 0 && team) {
    if (r.teamShares.includes(team.id)) return 'collaborator'
  }

  return null
}

export function canView(access) {
  return access === 'owner' || access === 'admin' || access === 'admin_view' || access === 'collaborator'
}

export function canEdit(access) {
  return access === 'owner' || access === 'admin' || access === 'collaborator'
}

export function canDelete(access) {
  return access === 'owner'
}

export function canChangeVisibility(access) {
  return access === 'owner'
}

export function visibilityLabel(resource) {
  const r = normalizeResourceVisibility(resource)
  if (r.visibility === VISIBILITY.TEAM) return 'Team'
  if (r.visibility === VISIBILITY.MEMBERS) {
    const n = (r.sharedMemberUids || []).length
    return n === 1 ? '1 member' : `${n} members`
  }
  return 'Private'
}

export function userActiveTeam(teams, uid) {
  if (!uid || !Array.isArray(teams)) return null
  if (teams.length === 0) return null
  return teams.find(
    (t) => t.ownerId === uid || (t.members || []).some((m) => m.uid === uid)
  ) || null
}
