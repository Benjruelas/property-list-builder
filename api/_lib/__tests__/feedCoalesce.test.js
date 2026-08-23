import { describe, expect, it } from 'vitest'
import {
  buildActivityCoalesceKey,
  buildActivitySummary,
  buildNotificationCoalesceKey,
  buildNotificationContent,
  collapseFeedItems,
  isWithinActivityCoalesceWindow,
} from '../feedCoalesce.js'
import { batchPipelineDealActivities } from '../activityLog.js'

describe('feedCoalesce helpers', () => {
  it('builds activity keys for list and pipeline deal events, not lead.created', () => {
    expect(buildActivityCoalesceKey({
      type: 'list.parcel_added',
      actorUid: 'u1',
      entity: { listId: 'list_1' },
    })).toBe('list.parcel_added:u1:list:list_1')

    expect(buildActivityCoalesceKey({
      type: 'lead.created',
      actorUid: 'u1',
      entity: { kind: 'lead', leadId: 'lead_1' },
    })).toBeNull()

    expect(buildActivityCoalesceKey({
      type: 'deal.moved',
      actorUid: 'u1',
      entity: { pipelineId: 'pipe_1' },
    })).toBe('deal.moved:u1:pipeline:pipe_1')
  })

  it('keeps lead.created summary tied to the lead name', () => {
    expect(buildActivitySummary('lead.created', {
      label: 'Ben',
      leadName: 'Acme Roofing',
      count: 5,
    })).toBe('Ben created lead Acme Roofing')
  })

  it('summarizes a bulk lead import', () => {
    expect(buildActivitySummary('lead.imported', {
      label: 'Ben',
      count: 12,
    })).toBe('Ben imported 12 leads')
    expect(buildActivitySummary('lead.imported', {
      label: 'Ben',
      count: 1,
    })).toBe('Ben imported 1 lead')
  })

  it('builds pipeline-level notification keys', () => {
    expect(buildNotificationCoalesceKey({
      type: 'pipelineDealStage',
      data: { pipelineId: 'pipe_1' },
    })).toBe('pipelineDealStage:pipe_1')
  })

  it('builds count-aware summaries', () => {
    expect(buildActivitySummary('list.parcel_added', {
      label: 'Ben',
      listName: 'Prospects',
      count: 5,
    })).toBe('Ben added 5 parcels to "Prospects"')

    expect(buildNotificationContent('pipelineDealStage', {
      count: 3,
      pipelineTitle: 'Roofing',
    })).toEqual({
      title: 'Deals moved',
      body: '3 deals moved in Roofing',
    })
  })

  it('respects activity coalesce windows', () => {
    const now = Date.parse('2026-07-16T14:00:00.000Z')
    expect(isWithinActivityCoalesceWindow('2026-07-16T13:30:00.000Z', now)).toBe(true)
    expect(isWithinActivityCoalesceWindow('2026-07-16T10:00:00.000Z', now)).toBe(false)
  })
})

describe('collapseFeedItems', () => {
  it('merges non-consecutive unseen rows that share a key', () => {
    const items = collapseFeedItems([
      {
        id: 'act_3',
        source: 'activity',
        unseen: true,
        createdAt: '2026-07-16T12:03:00.000Z',
        type: 'list.parcel_added',
        actorUid: 'u1',
        summary: 'Ben added 1 parcel to "Prospects"',
        entity: { kind: 'list', listId: 'list_1', listName: 'Prospects' },
      },
      {
        id: 'ntf_1',
        source: 'notification',
        unseen: true,
        createdAt: '2026-07-16T12:02:30.000Z',
        type: 'listShared',
        title: 'Shared',
        body: 'Shared',
        nav: { listId: 'list_9' },
      },
      {
        id: 'act_1',
        source: 'activity',
        unseen: true,
        createdAt: '2026-07-16T12:01:00.000Z',
        type: 'list.parcel_added',
        actorUid: 'u1',
        summary: 'Ben added 2 parcels to "Prospects"',
        entity: { kind: 'list', listId: 'list_1', listName: 'Prospects' },
      },
    ])

    expect(items).toHaveLength(2)
    expect(items[0].id).toBe('act_3')
    expect(items[0].count).toBe(2)
    expect(items[0].collapsedIds).toEqual(['act_1'])
  })
})

describe('batchPipelineDealActivities', () => {
  it('groups deal diffs into one payload per change type', () => {
    const batches = batchPipelineDealActivities([
      { type: 'deal.moved', deal: { id: 'd1' } },
      { type: 'deal.moved', deal: { id: 'd2' } },
      { type: 'deal.created', deal: { id: 'd3' } },
    ], { label: 'Ben', pipeTitle: 'Roofing', pipelineId: 'pipe_1' })

    expect(batches).toHaveLength(2)
    expect(batches.find((b) => b.type === 'deal.moved')).toMatchObject({
      delta: 2,
      entity: { kind: 'pipeline', pipelineId: 'pipe_1', count: 2 },
      nav: { type: 'pipeline', pipelineId: 'pipe_1' },
    })
    expect(batches.find((b) => b.type === 'deal.created')).toMatchObject({
      delta: 1,
      entity: { kind: 'deal', dealId: 'd3', pipelineId: 'pipe_1' },
      nav: { type: 'deal', dealId: 'd3', pipelineId: 'pipe_1' },
    })
  })

  it('uses deal nav for a single deal change', () => {
    const batches = batchPipelineDealActivities(
      [{ type: 'deal.moved', deal: { id: 'd9' } }],
      { label: 'Ben', pipeTitle: 'Roofing', pipelineId: 'pipe_1' },
    )
    expect(batches).toEqual([
      expect.objectContaining({
        type: 'deal.moved',
        delta: 1,
        entity: { kind: 'deal', dealId: 'd9', pipelineId: 'pipe_1' },
        nav: { type: 'deal', dealId: 'd9', pipelineId: 'pipe_1' },
      }),
    ])
  })
})
