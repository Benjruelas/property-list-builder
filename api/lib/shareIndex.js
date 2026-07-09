/**
 * Compute uids that should receive a data-version bump when a resource changes.
 */

import { fullTeamsIndex } from './teams.js'
import { kvSAdd, kvSRem, kvAvailable } from './kvOps.js'

export function collectAffectedUidsForResource(resource, allTeams = []) {
  if (!resource) return []
  const uids = new Set()
  if (resource.ownerId) uids.add(resource.ownerId)
  for (const uid of resource.sharedMemberUids || []) {
    if (uid) uids.add(uid)
  }
  const teamsIndex = fullTeamsIndex(allTeams)
  for (const tid of resource.teamShares || []) {
    const team = teamsIndex[tid]
    if (!team) continue
    if (team.ownerId) uids.add(team.ownerId)
    for (const m of team.members || []) {
      if (m?.uid) uids.add(m.uid)
    }
  }
  return [...uids]
}

/**
 * Keep shared-{leads|pipelines}:{uid} sets in sync when resource visibility changes.
 */
export async function syncSharedOwnerIndex({
  resource,
  prevResource,
  allTeams,
  sharedKeyPrefix,
}) {
  if (!kvAvailable) return
  const ownerId = resource?.ownerId || prevResource?.ownerId
  if (!ownerId) return
  const prevUids = new Set(
    prevResource ? collectAffectedUidsForResource(prevResource, allTeams) : [],
  )
  const nextUids = new Set(
    resource ? collectAffectedUidsForResource(resource, allTeams) : [],
  )

  const removals = [...prevUids].filter((uid) => uid !== ownerId && !nextUids.has(uid))
  const additions = [...nextUids].filter((uid) => uid !== ownerId && !prevUids.has(uid))

  await Promise.all([
    ...removals.map((uid) => kvSRem(`${sharedKeyPrefix}${uid}`, ownerId)),
    ...additions.map((uid) => kvSAdd(`${sharedKeyPrefix}${uid}`, ownerId)),
  ])
}

export default collectAffectedUidsForResource
