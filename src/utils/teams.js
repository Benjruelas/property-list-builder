/**
 * Teams API client v2. All methods require an async getToken() that returns
 * a Firebase ID token (or the dev-bypass token in dev mode).
 */

const getApiBase = () => {
  if (import.meta.env.DEV) return '/api'
  if (typeof window !== 'undefined') return `${window.location.origin}/api`
  return import.meta.env.VITE_API_URL || ''
}

async function apiCall(getToken, method, body = null) {
  const token = await getToken()
  if (!token) throw new Error('Sign in required')
  const opts = {
    method,
    headers: { Authorization: `Bearer ${token}` },
  }
  if (body) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(`${getApiBase()}/teams`, opts)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || data.message || `Request failed (${res.status})`)
    err.status = res.status
    err.code = data.error
    throw err
  }
  return data
}

export async function fetchTeamContext(getToken) {
  try {
    const token = await getToken()
    if (!token) return { teams: [], membership: null, pendingInvites: [] }
    const res = await fetch(`${getApiBase()}/teams`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return { teams: [], membership: null, pendingInvites: [] }
    const data = await res.json().catch(() => ({}))
    return {
      teams: data.teams || [],
      membership: data.membership || null,
      pendingInvites: data.pendingInvites || [],
    }
  } catch {
    return { teams: [], membership: null, pendingInvites: [] }
  }
}

export async function fetchTeams(getToken) {
  const ctx = await fetchTeamContext(getToken)
  return ctx.teams
}

export async function createTeam(getToken, name) {
  const data = await apiCall(getToken, 'POST', { name })
  return data.team
}

export async function renameTeam(getToken, teamId, name) {
  const data = await apiCall(getToken, 'PATCH', { teamId, action: 'rename', name })
  return data.team
}

export async function deleteTeam(getToken, teamId) {
  await apiCall(getToken, 'DELETE', { teamId })
}

export async function inviteTeamMember(getToken, teamId, email) {
  const data = await apiCall(getToken, 'PATCH', { teamId, action: 'invite-member', email })
  return data
}

export async function addTeamMember(getToken, teamId, email) {
  return inviteTeamMember(getToken, teamId, email)
}

export async function removeTeamMember(getToken, teamId, uid) {
  const data = await apiCall(getToken, 'PATCH', { teamId, action: 'remove-member', uid })
  return data.team
}

export async function acceptTeamInvite(getToken, { inviteId, teamId } = {}) {
  const data = await apiCall(getToken, 'PATCH', { action: 'accept-invite', inviteId, teamId })
  return data.team
}

export async function declineTeamInvite(getToken, { inviteId, teamId } = {}) {
  await apiCall(getToken, 'PATCH', { action: 'decline-invite', inviteId, teamId })
}

export async function promoteTeamAdmin(getToken, teamId, uid) {
  const data = await apiCall(getToken, 'PATCH', { teamId, action: 'promote-admin', uid })
  return data.team
}

export async function demoteTeamAdmin(getToken, teamId, uid) {
  const data = await apiCall(getToken, 'PATCH', { teamId, action: 'demote-admin', uid })
  return data.team
}

export async function updateTeamSettings(getToken, teamId, settings) {
  const data = await apiCall(getToken, 'PATCH', {
    teamId,
    action: 'update-settings',
    ...settings,
  })
  return data.team
}

export async function transferTeamOwnership(getToken, teamId, toUid) {
  const data = await apiCall(getToken, 'PATCH', { teamId, action: 'transfer-owner', toUid })
  return data.team
}

export function isTeamOwner(team, user) {
  return !!(team && user && team.ownerId === user.uid)
}

export function teamRoleForUser(team, user) {
  if (!team || !user) return null
  if (team.viewerRole) return team.viewerRole
  if (team.ownerId === user.uid) return 'admin'
  const m = (team.members || []).find((mem) => mem.uid === user.uid)
  if (!m) return null
  if (m.role === 'admin' || m.role === 'owner') return 'admin'
  return 'member'
}

export function isTeamAdminRole(team, user) {
  return teamRoleForUser(team, user) === 'admin'
}
