/**
 * Notify collaborators when a list, pipeline, or path is shared (email, team, or members).
 */

export async function runResourceShareNotifications({
  resource,
  resourceType,
  nameField = 'name',
  prevSharedMemberUids = [],
  newlyAddedEmails = [],
  newlyAddedTeamShares = [],
  team = null,
  teamsIndex = {},
  actor,
}) {
  try {
    const push = await import('../push-utils.js')
    const name = resource?.[nameField] || resourceType
    const id = resource?.id
    if (!id) return

    if (newlyAddedEmails?.length) {
      if (resourceType === 'list') {
        await push.notifyNewListShares(newlyAddedEmails, { listName: name, listId: id, actorEmail: actor.email })
      } else if (resourceType === 'pipeline') {
        await push.notifyNewPipelineShares(newlyAddedEmails, { pipelineTitle: name, pipelineId: id, actorEmail: actor.email })
      } else if (resourceType === 'path') {
        await push.notifyNewPathShares(newlyAddedEmails, { pathName: name, pathId: id, actorEmail: actor.email })
      }
    }

    const teamIds = [...new Set((newlyAddedTeamShares || []).filter(Boolean))]
    if (teamIds.length) {
      await push.notifyTeamResourceShare(teamIds, teamsIndex, {
        resourceType,
        resourceName: name,
        resourceId: id,
        actorEmail: actor.email,
      })
    }

    const prevSet = new Set(prevSharedMemberUids || [])
    const newMemberUids = (resource.sharedMemberUids || []).filter((uid) => uid && !prevSet.has(uid))
    if (newMemberUids.length && team) {
      await push.notifyNewMemberShares(newMemberUids, team, {
        resourceType,
        resourceName: name,
        resourceId: id,
        actorEmail: actor.email,
        actorUid: actor.uid,
      })
    }
  } catch (e) {
    console.warn(`${resourceType} share notify`, e.message)
  }
}

/** When visibility switches to team, treat the team as newly shared if it wasn't before. */
export function teamShareAddedOnVisibility(prevTeamShares, teamId) {
  if (!teamId) return []
  const prev = prevTeamShares instanceof Set ? prevTeamShares : new Set(prevTeamShares || [])
  return prev.has(teamId) ? [] : [teamId]
}
