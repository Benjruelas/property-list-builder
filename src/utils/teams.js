/**
 * Teams API client. All methods require an async getToken() that returns
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
    headers: { Authorization: `Bearer ${token}` }
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

export async function fetchTeams(getToken) {
  try {
    const token = await getToken()
    if (!token) return []
    const res = await fetch(`${getApiBase()}/teams`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return []
    const data = await res.json().catch(() => ({}))
    return data.teams || []
  } catch {
    return []
  }
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

export async function addTeamMember(getToken, teamId, email) {
  const data = await apiCall(getToken, 'PATCH', { teamId, action: 'add-member', email })
  return data.team
}

export async function removeTeamMember(getToken, teamId, uid) {
  const data = await apiCall(getToken, 'PATCH', { teamId, action: 'remove-member', uid })
  return data.team
}

export async function transferTeamOwnership(getToken, teamId, toUid) {
  const data = await apiCall(getToken, 'PATCH', { teamId, action: 'transfer-owner', toUid })
  return data.team
}

/**
 * Shorthand: is the given user the owner of a team?
 */
export function isTeamOwner(team, user) {
  return !!(team && user && team.ownerId === user.uid)
}

/**
 * Human-friendly role badge.
 */
export function teamRoleForUser(team, user) {
  if (!team || !user) return null
  if (team.ownerId === user.uid) return 'owner'
  const m = (team.members || []).find((m) => m.uid === user.uid)
  return m ? m.role : null
}
