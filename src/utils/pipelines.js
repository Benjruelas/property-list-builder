/**
 * User-scoped pipelines API. All methods require an async getToken() that returns Firebase ID token.
 */

import { canEdit, resolveResourceAccess, userActiveTeam } from './access'

const LOCAL_PIPELINE_MIGRATION_PREFIX = 'knockscout_local_pipeline_migrated:'

export function localPipelineMigrationKey(uid) {
  return `${LOCAL_PIPELINE_MIGRATION_PREFIX}${uid || 'anon'}`
}

/** Keep team-task carriers (`leads[].teamTasks`) when hydrating client state. */
export function normalizePipelineForClient(pipeline) {
  if (!pipeline || typeof pipeline !== 'object') return pipeline
  return {
    ...pipeline,
    deals: Array.isArray(pipeline.deals) ? pipeline.deals : [],
    leads: Array.isArray(pipeline.leads) ? pipeline.leads : [],
  }
}

export function dedupePipelinesById(pipelines) {
  if (!Array.isArray(pipelines)) return []
  const byId = new Map()
  for (const p of pipelines) {
    if (!p?.id) continue
    const existing = byId.get(p.id)
    const ts = p.updatedAt || p.createdAt || ''
    const existingTs = existing?.updatedAt || existing?.createdAt || ''
    if (!existing || ts > existingTs) byId.set(p.id, p)
  }
  return [...byId.values()]
}

const getApiBase = () => {
  if (import.meta.env.DEV) return '/api'
  if (typeof window !== 'undefined') return `${window.location.origin}/api`
  return import.meta.env.VITE_API_URL || ''
}

/**
 * Owner or collaborator may add/move deals on a pipeline (matches server canEdit).
 */
export function canAddDealsToPipeline(user, pipeline, teams = []) {
  if (!user?.uid || !pipeline) return false
  const team = userActiveTeam(teams, user.uid)
  const access = resolveResourceAccess(pipeline, user, team, teams)
  return canEdit(access)
}

/** Pipes the user can work in (owner/collaborator) — excludes team-admin view-only copies. */
export function pipelinesUserCanWorkIn(user, pipelines, teams = []) {
  if (!user?.uid || !Array.isArray(pipelines)) return []
  return dedupePipelinesById(pipelines).filter((p) => canAddDealsToPipeline(user, p, teams))
}

/** @deprecated use canAddDealsToPipeline */
export function canAddLeadsToPipeline(user, pipeline, teams = []) {
  return canAddDealsToPipeline(user, pipeline, teams)
}

export function canCollaborateOnPipeline(user, pipeline, teams = []) {
  return canAddDealsToPipeline(user, pipeline, teams)
}

let pipelinesListEtag = null

export function resetPipelinesListEtag() {
  pipelinesListEtag = null
}

export async function fetchPipelines(getToken) {
  const token = await getToken()
  if (!token) return []
  const headers = { Authorization: `Bearer ${token}` }
  if (pipelinesListEtag) headers['If-None-Match'] = pipelinesListEtag
  const res = await fetch(`${getApiBase()}/pipelines`, {
    method: 'GET',
    headers,
  })
  if (res.status === 304) return { notModified: true }
  if (!res.ok) throw new Error('Failed to fetch pipelines')
  const etag = res.headers.get('ETag')
  if (etag) pipelinesListEtag = etag.replace(/^W\//, '').replace(/"/g, '')
  const data = await res.json()
  return dedupePipelinesById(data.pipelines || []).map(normalizePipelineForClient)
}

export async function createPipeline(getToken, input = {}) {
  const token = await getToken()
  if (!token) throw new Error('Sign in to create pipelines')
  const opts = typeof input === 'string' ? { title: input } : input
  const {
    title = 'Pipes',
    columns,
    deals = [],
    visibility,
    sharedMemberUids,
    teamShares,
    teamId,
    sharedWith,
  } = opts
  const body = { title: String(title || '').trim() || 'Pipes', columns, deals }
  if (visibility !== undefined) body.visibility = visibility
  if (sharedMemberUids !== undefined) body.sharedMemberUids = sharedMemberUids
  if (teamShares !== undefined) body.teamShares = teamShares
  if (teamId !== undefined) body.teamId = teamId
  if (sharedWith !== undefined) body.sharedWith = sharedWith
  const res = await fetch(`${getApiBase()}/pipelines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to create pipeline')
  }
  const data = await res.json()
  return data.pipeline
}

export async function updatePipeline(getToken, pipelineId, updates = {}) {
  const {
    title,
    columns,
    deals,
    leads,
    sharedWith,
    teamShares,
    teamId,
    visibility,
    sharedMemberUids,
  } = updates
  const token = await getToken()
  if (!token) throw new Error('Sign in to update pipelines')
  const body = { pipelineId }
  if (title !== undefined) body.title = title
  if (columns !== undefined) body.columns = columns
  if (deals !== undefined) body.deals = deals
  if (leads !== undefined) body.deals = leads
  if (sharedWith !== undefined) body.sharedWith = sharedWith
  if (teamShares !== undefined) body.teamShares = teamShares
  if (teamId !== undefined) body.teamId = teamId
  if (visibility !== undefined) body.visibility = visibility
  if (sharedMemberUids !== undefined) body.sharedMemberUids = sharedMemberUids
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
