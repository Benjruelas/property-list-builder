/**
 * Team Workspace v2 — unified resource access resolution.
 * See Design Consistency Contract: owner | admin_view | admin | collaborator | null
 */

import { resolveAccess as legacyResolveAccess } from './teams.js'

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

export const VISIBILITY = {
  PRIVATE: 'private',
  TEAM: 'team',
  MEMBERS: 'members',
}

/** Normalize v1 teamShares / sharedWith into v2 visibility fields on read. */
export function normalizeResourceVisibility(resource, defaultTeamId = null) {
  if (!resource || typeof resource !== 'object') return resource
  const r = { ...resource }

  if (r.visibility && ['private', 'team', 'members'].includes(r.visibility)) {
    if (!r.sharedMemberUids) r.sharedMemberUids = []
    return r
  }

  const teamShares = Array.isArray(r.teamShares) ? r.teamShares.filter(Boolean) : []
  if (teamShares.length > 0) {
    r.teamId = r.teamId || teamShares[0] || defaultTeamId
    r.visibility = VISIBILITY.TEAM
    r.sharedMemberUids = []
  } else {
    r.visibility = r.visibility || VISIBILITY.PRIVATE
    r.sharedMemberUids = Array.isArray(r.sharedMemberUids) ? r.sharedMemberUids : []
  }

  if (r.teamId == null && defaultTeamId) r.teamId = defaultTeamId
  return r
}

export function getTeamMemberRole(team, uid) {
  if (!team || !uid) return null
  if (team.ownerId === uid) {
    const ownerMember = (team.members || []).find((m) => m.uid === uid)
    if (ownerMember?.role === 'admin' || ownerMember?.role === 'owner') return 'admin'
    return 'admin'
  }
  const m = (team.members || []).find((mem) => mem.uid === uid)
  if (!m) return null
  if (m.role === 'admin' || m.role === 'owner') return 'admin'
  return 'member'
}

export function isTeamAdmin(team, uid) {
  return getTeamMemberRole(team, uid) === 'admin'
}

function userInSharedMembers(resource, uid) {
  const ids = Array.isArray(resource.sharedMemberUids) ? resource.sharedMemberUids : []
  return ids.includes(uid)
}

function isMemberOfTeam(team, uid) {
  if (!team || !uid) return false
  return (
    team.ownerId === uid ||
    (Array.isArray(team.members) && team.members.some((m) => m.uid === uid))
  )
}

function resourceSharedWithUser(resource, user, team, teamsIndex = {}) {
  const r = normalizeResourceVisibility(resource, team?.id)
  if (r.ownerId === user.uid) return true
  if (r.visibility === VISIBILITY.PRIVATE) return false

  if (r.visibility === VISIBILITY.MEMBERS && userInSharedMembers(r, user.uid)) {
    return true
  }

  const resourceTeam = r.teamId ? teamsIndex[r.teamId] : null
  if (r.visibility === VISIBILITY.TEAM && resourceTeam && isMemberOfTeam(resourceTeam, user.uid)) {
    return true
  }

  if (team && r.teamId === team.id) {
    if (r.visibility === VISIBILITY.TEAM) return true
    if (r.visibility === VISIBILITY.MEMBERS) return userInSharedMembers(r, user.uid)
  }

  if (r.visibility === VISIBILITY.TEAM && Array.isArray(r.teamShares) && r.teamShares.length > 0) {
    return legacyResolveAccess(r, user, teamsIndex) === 'collaborator'
  }

  return false
}

/**
 * @returns {'owner'|'admin'|'admin_view'|'collaborator'|null}
 */
export function resolveResourceAccess(resource, user, { team = null, teamsIndex = {} } = {}) {
  if (!resource || !user?.uid) return null
  const r = normalizeResourceVisibility(resource, team?.id)

  const ownerId = normalizedOwnerId(r)
  if (ownerId && uidsMatch(ownerId, user.uid)) return 'owner'

  const ownerEmail = (r.ownerEmail || '').toLowerCase().trim()
  const userEmail = (user.email || '').toLowerCase().trim()
  if (!ownerId && ownerEmail && userEmail && ownerEmail === userEmail) return 'owner'

  const memberRole = team ? getTeamMemberRole(team, user.uid) : null
  const isAdmin = memberRole === 'admin'
  const onSameTeam = team && r.teamId === team.id && memberRole

  if (onSameTeam && isAdmin) {
    if (r.visibility === VISIBILITY.PRIVATE) return 'admin_view'
    return 'admin'
  }

  if (resourceSharedWithUser(r, user, team, teamsIndex)) return 'collaborator'

  const legacy = legacyResolveAccess(r, user, teamsIndex)
  if (legacy === 'collaborator') return 'collaborator'

  return null
}

export function canView(access) {
  return access === 'owner' || access === 'admin' || access === 'admin_view' || access === 'collaborator'
}

export function canEdit(access) {
  return access === 'owner' || access === 'admin' || access === 'admin_view' || access === 'collaborator'
}

export function canDelete(access) {
  return access === 'owner'
}

export function canChangeVisibility(access) {
  return access === 'owner'
}

export function canManageTeamPipe(access, { isTeamPipe = false, memberRole = null } = {}) {
  if (!isTeamPipe) return canEdit(access)
  return memberRole === 'admin' || access === 'owner'
}

/** Apply visibility patch from client body. */
export function applyVisibilityPatch(existing, body, teamId) {
  const base = normalizeResourceVisibility(existing, teamId)
  const next = { ...base }

  if (body.visibility !== undefined) {
    const v = body.visibility
    if (!['private', 'team', 'members'].includes(v)) {
      throw new Error('Invalid visibility')
    }
    next.visibility = v
    if (v === VISIBILITY.PRIVATE) {
      next.sharedMemberUids = []
      next.teamShares = []
    }
    if (v === VISIBILITY.TEAM) {
      next.sharedMemberUids = []
      if (teamId) {
        next.teamId = teamId
        next.teamShares = [teamId]
      }
    }
  }

  if (body.sharedMemberUids !== undefined) {
    next.sharedMemberUids = Array.isArray(body.sharedMemberUids)
      ? [...new Set(body.sharedMemberUids.filter(Boolean))]
      : []
    if (next.sharedMemberUids.length > 0) {
      next.visibility = VISIBILITY.MEMBERS
      if (teamId) next.teamId = teamId
    }
  }

  if (body.teamShares !== undefined) {
    const arr = Array.isArray(body.teamShares) ? body.teamShares.filter(Boolean) : []
    if (arr.length > 0) {
      next.visibility = VISIBILITY.TEAM
      next.teamId = arr[0]
      next.teamShares = arr
    }
  }

  return next
}

export function userHasTeamMembership(allTeams, uid) {
  if (!uid || !Array.isArray(allTeams)) return null
  for (const t of allTeams) {
    if (t.ownerId === uid) return t
    if ((t.members || []).some((m) => m.uid === uid)) return t
  }
  return null
}
