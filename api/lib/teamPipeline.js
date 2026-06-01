/**
 * Create team Pipe in user_pipelines KV (shared helper for teams API).
 */

const DEFAULT_COLUMNS = [
  'Make Contact',
  'Roof Inspection',
  'File Claim',
  'Service Agreement',
  "Adjuster's Meeting",
  'Scope of Loss',
  'Appraisal',
  'Ready for Install',
  'Install Scheduled',
  'Installed',
]

function normalizeColumns(cols) {
  if (!Array.isArray(cols) || cols.length === 0) {
    return DEFAULT_COLUMNS.map((name, i) => ({ id: `col-${i}`, name }))
  }
  return cols.map((c, i) => ({
    id: (c && c.id) || `col-${i}`,
    name: (c && c.name) || '',
  })).filter((c) => c.name)
}

export async function createTeamPipeline(kv, team, ownerUser) {
  if (!kv || !team?.id) return null
  try {
    const data = await kv.get('user_pipelines')
    const pipelines = typeof data === 'string' ? (data ? JSON.parse(data) : []) : (data || [])
    const arr = Array.isArray(pipelines) ? pipelines : []

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

    const existingIdx = arr.findIndex((p) => p.id === pipeline.id || (p.isTeamPipe && p.teamId === team.id))
    if (existingIdx >= 0) {
      return arr[existingIdx]
    }

    arr.push(pipeline)
    await kv.set('user_pipelines', arr).catch(() => kv.set('user_pipelines', JSON.stringify(arr)))
    return pipeline
  } catch (e) {
    console.warn('createTeamPipeline failed', e.message)
    return null
  }
}

export { DEFAULT_COLUMNS, normalizeColumns }
