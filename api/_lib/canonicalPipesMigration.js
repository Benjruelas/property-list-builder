import { kv, kvAvailable } from './kvBootstrap.js'
import { getAllTeams, saveAllTeams } from './teams.js'
import { getAllPipelines, saveAllPipelines } from './pipelineStoreFull.js'
import { getAllLeads, saveAllLeads } from './leadStore.js'
import { backfillLeadShards } from './leadRepo.js'
import {
  backfillPipelineShards,
  removePipelineIndex,
  saveOwnerPipelines,
} from './pipelineRepo.js'
import { DEFAULT_LEAD_STATUSES } from './leadStatuses.js'
import { DEFAULT_DEAL_STATUSES } from './dealStatuses.js'
import { withKvLock } from './kvLock.js'

export const CANONICAL_PIPES_MIGRATION_KEY = 'migration:canonical-pipes:v1'
const CANONICAL_PIPES_LOCK_KEY = 'lock:migration:canonical-pipes:v1'

function safeId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_')
}

function uniqueById(rows) {
  const seen = new Set()
  return (rows || []).filter((row) => {
    if (!row?.id || seen.has(row.id)) return false
    seen.add(row.id)
    return true
  })
}

function teamForPipeline(pipeline, teamByMember, teamById) {
  if (pipeline?.teamId && teamById.has(pipeline.teamId)) return teamById.get(pipeline.teamId)
  for (const teamId of pipeline?.teamShares || []) {
    if (teamById.has(teamId)) return teamById.get(teamId)
  }
  return teamByMember.get(pipeline?.ownerId) || null
}

export function buildCanonicalPipeData({ pipelines = [], leads = [], teams = [], now = new Date().toISOString() }) {
  const teamById = new Map(teams.map((team) => [team.id, team]))
  const teamByMember = new Map()
  for (const team of teams) {
    teamByMember.set(team.ownerId, team)
    for (const member of team.members || []) teamByMember.set(member.uid, team)
  }

  const scopes = new Map()
  const ensureScope = (key, seed) => {
    if (!scopes.has(key)) scopes.set(key, { ...seed, pipelines: [] })
    return scopes.get(key)
  }

  for (const team of teams) {
    ensureScope(`team:${team.id}`, {
      id: `pipe_team_${safeId(team.id.replace(/^team_/, ''))}`,
      title: `${team.name || 'Team'} Deals`,
      ownerId: team.ownerId,
      ownerEmail: team.ownerEmail,
      team,
    })
  }

  for (const pipeline of pipelines) {
    const team = teamForPipeline(pipeline, teamByMember, teamById)
    const scope = team
      ? ensureScope(`team:${team.id}`, {
          id: `pipe_team_${safeId(team.id.replace(/^team_/, ''))}`,
          title: `${team.name || 'Team'} Deals`,
          ownerId: team.ownerId,
          ownerEmail: team.ownerEmail,
          team,
        })
      : ensureScope(`user:${pipeline.ownerId}`, {
          id: `pipe_user_${safeId(pipeline.ownerId)}`,
          title: 'Deals',
          ownerId: pipeline.ownerId,
          ownerEmail: pipeline.ownerEmail,
          team: null,
        })
    scope.pipelines.push(pipeline)
  }

  const columns = DEFAULT_DEAL_STATUSES.map(({ id, label }) => ({ id, name: label }))
  const canonicalPipelines = [...scopes.values()].map((scope) => {
    const source = scope.pipelines
    const deals = uniqueById(source.flatMap((pipeline) => pipeline.deals || [])).map((deal) => ({
      ...deal,
      status: DEFAULT_DEAL_STATUSES[0].id,
      statusEnteredAt: Date.now(),
      cumulativeTimeByStatus: {},
      pipelineId: scope.id,
      updatedAt: Date.now(),
    }))
    const tasks = uniqueById(source.flatMap((pipeline) => pipeline.tasks || []))
    const teamTasks = source.flatMap((pipeline) =>
      (pipeline.leads || []).filter((lead) => Array.isArray(lead?.teamTasks) && lead.teamTasks.length > 0),
    )
    return {
      id: scope.id,
      title: scope.title,
      columns,
      deals,
      tasks,
      ...(teamTasks.length ? { leads: teamTasks } : {}),
      ownerId: scope.ownerId,
      ownerEmail: scope.ownerEmail,
      teamId: scope.team?.id || null,
      isTeamPipe: Boolean(scope.team),
      visibility: scope.team ? 'team' : 'private',
      sharedWith: [],
      sharedMemberUids: [],
      teamShares: scope.team ? [scope.team.id] : [],
      canonicalType: 'deals',
      legacyPipelineIds: source.map((pipeline) => pipeline.id).filter(Boolean),
      createdAt: source.map((pipeline) => pipeline.createdAt).filter(Boolean).sort()[0] || now,
      updatedAt: now,
    }
  })

  const resetLeads = leads.map((lead) => ({
    ...lead,
    status: DEFAULT_LEAD_STATUSES[0].id,
    statusUpdatedAt: now,
  }))
  const resetTeams = teams.map((team) => ({
    ...team,
    leadStatuses: DEFAULT_LEAD_STATUSES.map((status) => ({ ...status })),
    dealStatuses: DEFAULT_DEAL_STATUSES.map((status) => ({ ...status })),
    teamPipelineId: `pipe_team_${safeId(team.id.replace(/^team_/, ''))}`,
    updatedAt: now,
  }))

  return { pipelines: canonicalPipelines, leads: resetLeads, teams: resetTeams }
}

async function performCanonicalPipesMigration({ force = false } = {}) {
  if (kvAvailable && kv && !force) {
    const marker = await kv.get(CANONICAL_PIPES_MIGRATION_KEY)
    if (marker) return { alreadyApplied: true, marker }
  }

  const [pipelines, leads, teams] = await Promise.all([
    getAllPipelines(),
    getAllLeads(),
    getAllTeams(),
  ])
  const next = buildCanonicalPipeData({ pipelines, leads, teams })
  const oldPipelineIds = pipelines.map((pipeline) => pipeline.id).filter(Boolean)
  const oldOwnerIds = new Set(pipelines.map((pipeline) => pipeline.ownerId).filter(Boolean))

  await saveAllTeams(next.teams)
  await saveAllLeads(next.leads, {
    changedResources: next.leads.map((resource, index) => ({ resource, prevResource: leads[index] })),
  })
  await saveAllPipelines(next.pipelines, {
    changedResources: next.pipelines.map((resource) => ({ resource })),
  })

  const canonicalIds = new Set(next.pipelines.map((pipeline) => pipeline.id))
  await Promise.all(oldPipelineIds.filter((id) => !canonicalIds.has(id)).map(removePipelineIndex))
  const canonicalOwners = new Set(next.pipelines.map((pipeline) => pipeline.ownerId).filter(Boolean))
  await Promise.all([...oldOwnerIds].filter((uid) => !canonicalOwners.has(uid)).map((uid) => saveOwnerPipelines(uid, [])))
  await Promise.all([backfillLeadShards(), backfillPipelineShards()])

  const result = {
    alreadyApplied: false,
    migratedAt: new Date().toISOString(),
    leads: next.leads.length,
    previousPipelines: pipelines.length,
    canonicalPipelines: next.pipelines.length,
    deals: next.pipelines.reduce((sum, pipeline) => sum + pipeline.deals.length, 0),
    teams: next.teams.length,
  }
  if (kvAvailable && kv) await kv.set(CANONICAL_PIPES_MIGRATION_KEY, result)
  return result
}

export async function runCanonicalPipesMigration(options = {}) {
  if (!kvAvailable || !kv) return performCanonicalPipesMigration(options)
  const result = await withKvLock(
    CANONICAL_PIPES_LOCK_KEY,
    () => performCanonicalPipesMigration(options),
    { ttlMs: 120000, maxWaitMs: 1000 },
  )
  if (result === null) throw new Error('Canonical pipes migration is already running')
  return result
}
