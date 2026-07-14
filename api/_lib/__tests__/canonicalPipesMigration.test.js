import { describe, expect, it } from 'vitest'
import { buildCanonicalPipeData } from '../canonicalPipesMigration.js'

describe('buildCanonicalPipeData', () => {
  it('merges team pipelines, deduplicates deals, and resets states', () => {
    const teams = [{
      id: 'team_1',
      name: 'Roofers',
      ownerId: 'owner',
      ownerEmail: 'owner@example.com',
      members: [{ uid: 'member', role: 'member' }],
      leadStatuses: [{ id: 'custom', label: 'Custom' }],
      dealStatuses: [{ id: 'won', label: 'Won' }],
    }]
    const pipelines = [
      {
        id: 'old-a',
        ownerId: 'owner',
        deals: [{ id: 'deal-1', status: 'col-2', title: 'First' }],
      },
      {
        id: 'old-b',
        ownerId: 'member',
        deals: [
          { id: 'deal-1', status: 'other', title: 'Duplicate' },
          { id: 'deal-2', status: 'other', title: 'Second' },
        ],
      },
    ]
    const leads = [{ id: 'lead-1', ownerId: 'member', status: 'qualified' }]

    const result = buildCanonicalPipeData({
      pipelines,
      leads,
      teams,
      now: '2026-07-14T00:00:00.000Z',
    })

    expect(result.pipelines).toHaveLength(1)
    expect(result.pipelines[0]).toMatchObject({
      id: 'pipe_team_1',
      canonicalType: 'deals',
      teamId: 'team_1',
      ownerId: 'owner',
    })
    expect(result.pipelines[0].deals.map((deal) => deal.id)).toEqual(['deal-1', 'deal-2'])
    expect(result.pipelines[0].deals.every((deal) => deal.status === 'open')).toBe(true)
    expect(result.leads[0].status).toBe('new')
    expect(result.teams[0].teamPipelineId).toBe('pipe_team_1')
    expect(result.teams[0].dealStatuses.map((status) => status.id)).toEqual(['open', 'pending', 'closed'])
  })

  it('creates one canonical pipeline per solo owner', () => {
    const result = buildCanonicalPipeData({
      pipelines: [
        { id: 'a', ownerId: 'u1', ownerEmail: 'u1@example.com', deals: [] },
        { id: 'b', ownerId: 'u2', ownerEmail: 'u2@example.com', deals: [] },
      ],
      leads: [],
      teams: [],
    })
    expect(result.pipelines.map((pipeline) => pipeline.id).sort()).toEqual([
      'pipe_user_u1',
      'pipe_user_u2',
    ])
  })
})
