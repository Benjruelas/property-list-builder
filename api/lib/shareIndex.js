/**
 * Compute uids that should receive a data-version bump when a resource changes.
 */

import { fullTeamsIndex } from './teams.js'

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

export default collectAffectedUidsForResource
