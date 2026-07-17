import { describe, expect, it } from 'vitest'
import {
  activityCoalesceKey,
  collapseFeedActivityItems,
  collectActivityIdsFromFeedItems,
  expandActivityIdsForMarkSeen,
  generalizeActivitySummary,
} from '../activityLog.js'

function activity(overrides = {}) {
  return {
    id: overrides.id || 'act_1',
    source: 'activity',
    unseen: true,
    createdAt: overrides.createdAt || '2026-07-16T12:00:00.000Z',
    type: 'list.parcel_added',
    actorUid: 'user_a',
    actorEmail: 'a@test.com',
    summary: 'Ben added 1 parcel to "Prospects"',
    entity: { kind: 'list', listId: 'list_1' },
    nav: { type: 'list', listId: 'list_1' },
    ...overrides,
  }
}

describe('activityCoalesceKey', () => {
  it('returns null for non-collapsible types', () => {
    expect(activityCoalesceKey(activity({ type: 'lead.created' }))).toBeNull()
  })

  it('keys list parcel events by actor and list', () => {
    expect(activityCoalesceKey(activity())).toBe('list.parcel_added|user_a|list|list_1')
  })

  it('keys deal events by pipeline', () => {
    expect(activityCoalesceKey(activity({
      type: 'deal.moved',
      entity: { kind: 'deal', dealId: 'd1', pipelineId: 'pipe_1' },
      summary: 'Ben moved "Deal" from New to Won',
    }))).toBe('deal.moved|user_a|pipeline|pipe_1')
  })
})

describe('generalizeActivitySummary', () => {
  it('generalizes list parcel summaries and adds update count', () => {
    expect(generalizeActivitySummary(activity(), 3)).toBe('Ben added parcels to "Prospects" (3 updates)')
  })

  it('generalizes lead updates', () => {
    expect(generalizeActivitySummary(activity({
      type: 'lead.updated',
      summary: 'Ben updated lead John Smith',
      entity: { kind: 'lead', leadId: 'lead_1' },
    }), 2)).toBe('Ben updated lead John Smith (2 updates)')
  })
})

describe('collapseFeedActivityItems', () => {
  it('merges consecutive unseen activities with the same key', () => {
    const items = [
      activity({ id: 'act_3', createdAt: '2026-07-16T12:03:00.000Z' }),
      activity({ id: 'act_2', createdAt: '2026-07-16T12:02:00.000Z' }),
      activity({ id: 'act_1', createdAt: '2026-07-16T12:01:00.000Z' }),
    ]
    const collapsed = collapseFeedActivityItems(items)
    expect(collapsed).toHaveLength(1)
    expect(collapsed[0].id).toBe('act_3')
    expect(collapsed[0].collapseCount).toBe(3)
    expect(collapsed[0].collapsedIds).toEqual(['act_2', 'act_1'])
    expect(collapsed[0].summary).toBe('Ben added parcels to "Prospects" (3 updates)')
  })

  it('does not merge across seen boundaries', () => {
    const items = [
      activity({ id: 'act_2', unseen: true }),
      activity({ id: 'act_1', unseen: false }),
    ]
    const collapsed = collapseFeedActivityItems(items)
    expect(collapsed).toHaveLength(2)
    expect(collapsed[0].collapseCount).toBeUndefined()
  })

  it('does not merge across notifications', () => {
    const items = [
      activity({ id: 'act_2' }),
      { id: 'ntf_1', source: 'notification', unseen: true, createdAt: '2026-07-16T12:01:30.000Z', type: 'listShared', title: 'Shared', summary: 'Shared' },
      activity({ id: 'act_1', createdAt: '2026-07-16T12:01:00.000Z' }),
    ]
    const collapsed = collapseFeedActivityItems(items)
    expect(collapsed).toHaveLength(3)
  })

  it('keeps distinct coalesce keys separate', () => {
    const items = [
      activity({ id: 'act_2', entity: { kind: 'list', listId: 'list_2' } }),
      activity({ id: 'act_1', entity: { kind: 'list', listId: 'list_1' } }),
    ]
    expect(collapseFeedActivityItems(items)).toHaveLength(2)
  })
})

describe('mark seen expansion', () => {
  it('expands collapsed ids from PATCH payloads', () => {
    expect(expandActivityIdsForMarkSeen([
      { source: 'activity', id: 'act_3', collapsedIds: ['act_2', 'act_1'] },
      { source: 'notification', id: 'ntf_1' },
    ])).toEqual(['act_3', 'act_2', 'act_1'])
  })

  it('collects ids from collapsed feed rows', () => {
    const collapsed = collapseFeedActivityItems([
      activity({ id: 'act_2' }),
      activity({ id: 'act_1' }),
    ])
    expect(collectActivityIdsFromFeedItems(collapsed)).toEqual(['act_2', 'act_1'])
  })
})
