/**
 * Per-user data version counters for conditional polling (304 / If-None-Match).
 */

import { kvHGet, kvHIncrBy } from './kvOps.js'
import { getAllTeams } from './teams.js'
import { buildAccessContext } from './resourceContext.js'
import { collectAffectedUidsForResource } from './shareIndex.js'

export const DATAVER_LEADS = 'dataver:leads'
export const DATAVER_PIPELINES = 'dataver:pipelines'

export async function getUserDataVersion(hash, uid) {
  if (!uid) return '0'
  const v = await kvHGet(hash, uid)
  return v != null ? String(v) : '0'
}

export async function bumpUserDataVersions(hash, uids) {
  const unique = [...new Set((uids || []).filter(Boolean))]
  await Promise.all(unique.map((uid) => kvHIncrBy(hash, uid, 1)))
}

export async function bumpLeadsVersionsForResource(resource, { prevResource = null } = {}) {
  const allTeams = await getAllTeams()
  const uids = new Set()
  for (const r of [resource, prevResource]) {
    if (!r) continue
    for (const uid of collectAffectedUidsForResource(r, allTeams)) uids.add(uid)
  }
  await bumpUserDataVersions(DATAVER_LEADS, [...uids])
}

export async function bumpPipelinesVersionsForResource(resource, { prevResource = null } = {}) {
  const allTeams = await getAllTeams()
  const uids = new Set()
  for (const r of [resource, prevResource]) {
    if (!r) continue
    for (const uid of collectAffectedUidsForResource(r, allTeams)) uids.add(uid)
  }
  await bumpUserDataVersions(DATAVER_PIPELINES, [...uids])
}

export function parseIfNoneMatch(req) {
  const raw = req.headers['if-none-match'] || req.query?.since || ''
  return String(raw).replace(/^W\//, '').replace(/"/g, '').trim() || null
}

export default {
  getUserDataVersion,
  bumpUserDataVersions,
  bumpLeadsVersionsForResource,
  bumpPipelinesVersionsForResource,
  parseIfNoneMatch,
}
