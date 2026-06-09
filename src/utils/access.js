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

function teamById(teams, teamId) {
  if (!teamId || !Array.isArray(teams)) return null
  return teams.find((t) => t.id === teamId) || null
}

function isMemberOfTeam(team, uid) {
  if (!team || !uid) return false
  return (
    team.ownerId === uid ||
    (team.members || []).some((m) => m.uid === uid)
  )
}

function sharedWithUser(resource, uid, activeTeam, teams = []) {
  const r = normalizeResourceVisibility(resource)
  if (r.ownerId === uid) return true
  if (r.visibility === VISIBILITY.PRIVATE) return false

  if (r.visibility === VISIBILITY.MEMBERS && (r.sharedMemberUids || []).includes(uid)) {
    return true
  }

  const resourceTeam = teamById(teams, r.teamId)
  if (r.visibility === VISIBILITY.TEAM && resourceTeam && isMemberOfTeam(resourceTeam, uid)) {
    return true
  }

  if (activeTeam && r.teamId === activeTeam.id) {
    if (r.visibility === VISIBILITY.TEAM) return true
    if (r.visibility === VISIBILITY.MEMBERS) return (r.sharedMemberUids || []).includes(uid)
  }

  if (Array.isArray(r.teamShares) && r.teamShares.length > 0) {
    for (const tid of r.teamShares) {
      const t = teamById(teams, tid)
      if (t && isMemberOfTeam(t, uid)) return true
    }
  }

  return false
}

export function resolveResourceAccess(resource, user, team = null, teams = []) {
  if (!resource || !user?.uid) return null
  const r = normalizeResourceVisibility(resource)
  if (r.ownerId === user.uid) return 'owner'

  const role = team ? getTeamMemberRole(team, user.uid) : null
  const isAdmin = role === 'admin'

  if (team && r.teamId === team.id && isAdmin) {
    if (r.visibility === VISIBILITY.PRIVATE) return 'admin_view'
    return 'admin'
  }

  if (sharedWithUser(r, user.uid, team, teams)) return 'collaborator'

  const email = (user.email || '').toLowerCase().trim()
  if (email && Array.isArray(r.sharedWith)) {
    const hit = r.sharedWith.some((e) => (e || '').toLowerCase().trim() === email)
    if (hit) return 'collaborator'
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
