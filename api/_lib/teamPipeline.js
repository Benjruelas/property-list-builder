/**
 * Create team Pipe in user_pipelines KV (shared helper for teams API).
 */

import { mutatePipelines } from './pipelineStoreFull.js'

const DEFAULT_COLUMNS = ['Open', 'Pending', 'Closed']

function normalizeColumns(cols) {
  if (!Array.isArray(cols) || cols.length === 0) {
    return DEFAULT_COLUMNS.map((name, i) => ({ id: `col-${i}`, name }))
  }
  return cols.map((c, i) => ({
    id: (c && c.id) || `col-${i}`,
    name: (c && c.name) || '',
  })).filter((c) => c.name)
}

export async function createTeamPipeline(_kv, team, ownerUser) {
  if (!team?.id) return null
  try {
    const now = new Date().toISOString()
    const pipeline = {
      id: `pipe_team_${team.id.replace(/^team_/, '')}`,
      title: `${team.name} Pipe`,
      columns: normalizeColumns(),
      deals: [],
      tasks: [],
      ownerId: ownerUser.uid,
      ownerEmail: ownerUser.email,
      teamId: team.id,
      isTeamPipe: true,
      visibility: 'team',
      sharedWith: [],
      teamShares: [team.id],
      createdAt: now,
      updatedAt: now,
    }

    let result = null
    await mutatePipelines((arr) => {
      const existingIdx = arr.findIndex((p) => p.id === pipeline.id || (p.isTeamPipe && p.teamId === team.id))
      if (existingIdx >= 0) {
        result = arr[existingIdx]
        return undefined
      }
      result = pipeline
      return [...arr, pipeline]
    }, { changedResources: [{ resource: pipeline }] })
    return result
  } catch (e) {
    console.warn('createTeamPipeline failed', e.message)
    return null
  }
}

export { DEFAULT_COLUMNS, normalizeColumns }
