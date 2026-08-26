import { describe, expect, it } from 'vitest'
import {
  activityResourceRef,
  filterActivitiesForViewer,
} from '../activityAccess.js'

function activity(overrides = {}) {
  return {
    id: 'act_1',
    teamId: 'team_1',
    audience: 'resource_viewers',
    type: 'deal.moved',
    entity: { kind: 'deal', dealId: 'd1', pipelineId: 'pipe_members' },
    nav: { type: 'deal', dealId: 'd1', pipelineId: 'pipe_members' },
    ...overrides,
  }
}

describe('activityResourceRef', () => {
  it('maps deal activities to their pipeline', () => {
    expect(activityResourceRef(activity())).toEqual({
      kind: 'pipeline',
      id: 'pipe_members',
    })
  })

  it('maps pipelineDealStage nav to pipeline', () => {
    expect(
      activityResourceRef(
        activity({
          entity: {},
          nav: { type: 'pipelineDealStage', pipelineId: 'pipe_1', dealId: 'd9' },
        })
      )
    ).toEqual({ kind: 'pipeline', id: 'pipe_1' })
  })

  it('maps lead, list, path, and task kinds', () => {
    expect(
      activityResourceRef(activity({ entity: { kind: 'lead', leadId: 'lead_1' }, nav: {} }))
    ).toEqual({ kind: 'lead', id: 'lead_1' })
    expect(
      activityResourceRef(activity({ entity: { kind: 'list', listId: 'list_1' }, nav: {} }))
    ).toEqual({ kind: 'list', id: 'list_1' })
    expect(
      activityResourceRef(activity({ entity: { kind: 'path', pathId: 'path_1' }, nav: {} }))
    ).toEqual({ kind: 'path', id: 'path_1' })
    expect(
      activityResourceRef(activity({ entity: { kind: 'task', taskId: 'task_1' }, nav: {} }))
    ).toEqual({ kind: 'task', id: 'task_1' })
  })
})

describe('filterActivitiesForViewer', () => {
  const visibleIds = {
    pipeline: new Set(['pipe_shared']),
    lead: new Set(),
    list: new Set(),
    path: new Set(),
    task: new Set(),
  }

  it('lets team admins see all activity including admin_only', () => {
    const items = [
      activity({ id: 'a1', audience: 'admin_only' }),
      activity({
        id: 'a2',
        entity: { kind: 'deal', dealId: 'd2', pipelineId: 'pipe_secret' },
        nav: { type: 'deal', dealId: 'd2', pipelineId: 'pipe_secret' },
      }),
    ]
    const filtered = filterActivitiesForViewer(items, {
      adminTeamIds: new Set(['team_1']),
      visibleIds,
    })
    expect(filtered.map((a) => a.id)).toEqual(['a1', 'a2'])
  })

  it('hides admin_only from non-admins', () => {
    const items = [activity({ id: 'a1', audience: 'admin_only' })]
    const filtered = filterActivitiesForViewer(items, {
      adminTeamIds: new Set(),
      visibleIds,
    })
    expect(filtered).toHaveLength(0)
  })

  it('hides deal activity for pipes the viewer cannot access', () => {
    const items = [
      activity({
        id: 'secret',
        entity: { kind: 'deal', dealId: 'd1', pipelineId: 'pipe_members' },
        nav: { type: 'deal', dealId: 'd1', pipelineId: 'pipe_members' },
      }),
      activity({
        id: 'shared',
        entity: { kind: 'deal', dealId: 'd2', pipelineId: 'pipe_shared' },
        nav: { type: 'deal', dealId: 'd2', pipelineId: 'pipe_shared' },
      }),
      activity({
        id: 'pipe_event',
        type: 'pipeline.shared',
        entity: { kind: 'pipeline', pipelineId: 'pipe_shared' },
        nav: { type: 'pipeline', pipelineId: 'pipe_shared' },
      }),
    ]
    const filtered = filterActivitiesForViewer(items, {
      adminTeamIds: new Set(),
      visibleIds,
    })
    expect(filtered.map((a) => a.id)).toEqual(['shared', 'pipe_event'])
  })

  it('keeps activities without a resolvable resource ref', () => {
    const items = [
      activity({
        id: 'general',
        type: 'team.note',
        entity: {},
        nav: {},
      }),
    ]
    const filtered = filterActivitiesForViewer(items, {
      adminTeamIds: new Set(),
      visibleIds,
    })
    expect(filtered.map((a) => a.id)).toEqual(['general'])
  })
})
