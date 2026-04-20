/**
 * User-scoped pipelines API. All methods require an async getToken() that returns Firebase ID token.
 */

const getApiBase = () => {
  if (import.meta.env.DEV) return '/api'
  if (typeof window !== 'undefined') return `${window.location.origin}/api`
  return import.meta.env.VITE_API_URL || ''
}

/**
 * Owner or collaborator (email in sharedWith). Same rule for adding/moving leads and
 * for collaborative work in the UI; server PATCH allows collaborators to send `leads` only.
 * @param {{ uid?: string, email?: string } | null} user
 * @param {{ ownerId?: string, sharedWith?: string[] } | null} pipeline
 */
export function canAddLeadsToPipeline(user, pipeline, teams = []) {
  if (!user?.uid || !pipeline) return false
  if (pipeline.ownerId === user.uid) return true
  const email = (user.email || '').toLowerCase().trim()
  const shared = Array.isArray(pipeline.sharedWith) ? pipeline.sharedWith : []
  if (email && shared.some((e) => (e || '').toLowerCase().trim() === email)) return true
  const teamShares = Array.isArray(pipeline.teamShares) ? pipeline.teamShares : []
  if (teamShares.length && Array.isArray(teams) && teams.length) {
    const ids = new Set(teamShares)
    return teams.some(
      (t) =>
        ids.has(t.id) &&
        (t.ownerId === user.uid ||
          (Array.isArray(t.members) && t.members.some((m) => m.uid === user.uid)))
    )
  }
  return false
}

/** Alias: anyone with access may update leads (and use tasks) on that pipeline; only the owner may change structure/sharing. */
export function canCollaborateOnPipeline(user, pipeline) {
  return canAddLeadsToPipeline(user, pipeline)
}

export async function fetchPipelines(getToken) {
  const token = await getToken()
  if (!token) return []
  const res = await fetch(`${getApiBase()}/pipelines`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) throw new Error('Failed to fetch pipelines')
  const data = await res.json()
  return data.pipelines || []
}

export async function createPipeline(getToken, { title = 'Pipes', columns, leads = [] } = {}) {
  const token = await getToken()
  if (!token) throw new Error('Sign in to create pipelines')
  const res = await fetch(`${getApiBase()}/pipelines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title: title.trim() || 'Pipes', columns, leads })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to create pipeline')
  }
  const data = await res.json()
  return data.pipeline
}

export async function updatePipeline(getToken, pipelineId, { title, columns, leads, sharedWith, teamShares }) {
  const token = await getToken()
  if (!token) throw new Error('Sign in to update pipelines')
  const body = { pipelineId }
  if (title !== undefined) body.title = title
  if (columns !== undefined) body.columns = columns
  if (leads !== undefined) body.leads = leads
  if (sharedWith !== undefined) body.sharedWith = sharedWith
  if (teamShares !== undefined) body.teamShares = teamShares
  const res = await fetch(`${getApiBase()}/pipelines`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to update pipeline')
  }
  const data = await res.json()
  return data.pipeline
}

export async function deletePipeline(getToken, pipelineId) {
  const token = await getToken()
  if (!token) throw new Error('Sign in to delete pipelines')
  const res = await fetch(`${getApiBase()}/pipelines`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ pipelineId })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to delete pipeline')
  }
}

export async function validateShareEmail(getToken, email) {
  const trimmed = (email || '').trim().toLowerCase()
  if (!trimmed) return { valid: false }
  const token = await getToken()
  if (!token) return { valid: false }
  const base = getApiBase()
  const url = `${base}/validate-share-email?email=${encodeURIComponent(trimmed)}`
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) return { valid: false }
  const data = await res.json().catch(() => ({}))
  return { valid: !!data.valid }
}
