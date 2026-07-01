/**
 * Client-side mirror of api/lib/access.js for UI gating.
 */

export const VISIBILITY = {
  PRIVATE: 'private',
  TEAM: 'team',
  MEMBERS: 'members',
}

export function uidsMatch(a, b) {
  if (a == null || b == null || a === '' || b === '') return false
  return String(a) === String(b)
}

export function normalizedOwnerId(lead) {
  const id = lead?.ownerId
  if (id == null || id === '') return null
  return String(id)
}

export function isLeadOwner(user, lead) {
  if (!user?.uid || !lead) return false
  const ownerId = normalizedOwnerId(lead)
  if (ownerId && uidsMatch(ownerId, user.uid)) return true
  const ownerEmail = (lead.ownerEmail || '').toLowerCase().trim()
  const userEmail = (user.email || '').toLowerCase().trim()
  return !!(ownerEmail && userEmail && ownerEmail === userEmail)
}

export function userCapturedPhoto(user, photo) {
  return !!(photo?.capturedByUid && uidsMatch(photo.capturedByUid, user.uid))
}

export function userCapturedAllPhotos(user, lead) {
  const photos = Array.isArray(lead?.photos) ? lead.photos : []
  if (photos.length === 0) return false
  return photos.every((p) => userCapturedPhoto(user, p))
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

  const ownerId = normalizedOwnerId(r)
  if (ownerId && uidsMatch(ownerId, user.uid)) return 'owner'

  const ownerEmail = (r.ownerEmail || '').toLowerCase().trim()
  const userEmail = (user.email || '').toLowerCase().trim()
  if (!ownerId && ownerEmail && userEmail && ownerEmail === userEmail) return 'owner'

  const contextTeam = teamById(teams, r.teamId) || team
  const role = contextTeam ? getTeamMemberRole(contextTeam, user.uid) : null
  const isAdmin = role === 'admin'

  if (contextTeam && r.teamId === contextTeam.id && isAdmin) {
    if (r.visibility === VISIBILITY.PRIVATE) return 'admin_view'
    return 'admin'
  }

  if (sharedWithUser(r, user.uid, contextTeam, teams)) return 'collaborator'

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

/** Mirror of api/lib/leadAccess.js canMutateLeadPhotos for UI gating. */
export function canMutateLeadPhotos(user, lead, access, photo = null) {
  if (!user?.uid || !lead) return false
  if (isLeadOwner(user, lead)) return true
  if (canEdit(access)) return true
  if (photo && userCapturedPhoto(user, photo)) return true
  if (userCapturedAllPhotos(user, lead)) return true
  return false
}

/** Mirror of api/lib/pipelineAccess.js canMutateDealPhotos for UI gating. */
export function canMutateDealPhotos(user, pipeline, access, photo = null) {
  if (!user?.uid || !pipeline) return false
  if (pipeline.ownerId && pipeline.ownerId === user.uid) return true
  if (canEdit(access)) return true
  if (photo && userCapturedPhoto(user, photo)) return true
  return false
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
