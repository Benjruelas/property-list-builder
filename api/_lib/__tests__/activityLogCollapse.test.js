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
    entity: { kind: 'list', listId: 'list_1', listName: 'Prospects' },
    nav: { type: 'list', listId: 'list_1' },
    ...overrides,
  }
}

describe('activityCoalesceKey', () => {
  it('returns null for non-collapsible types', () => {
    expect(activityCoalesceKey(activity({ type: 'lead.shared' }))).toBeNull()
  })

  it('keys list parcel events by actor and list', () => {
    expect(activityCoalesceKey(activity())).toBe('list.parcel_added:user_a:list:list_1')
  })

  it('keys lead.created as a batch key', () => {
    expect(activityCoalesceKey(activity({
      type: 'lead.created',
      entity: { kind: 'lead', leadId: 'lead_1' },
    }))).toBe('lead.created:user_a:lead:_batch')
  })
})

describe('generalizeActivitySummary', () => {
  it('generalizes list parcel summaries with counts', () => {
    expect(generalizeActivitySummary(activity(), 3)).toBe('Ben added 3 parcels to "Prospects"')
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
    expect(collapsed[0].count).toBe(3)
    expect(collapsed[0].collapsedIds).toEqual(['act_2', 'act_1'])
  })

  it('does not merge across seen boundaries', () => {
    const items = [
      activity({ id: 'act_2', unseen: true }),
      activity({ id: 'act_1', unseen: false }),
    ]
    expect(collapseFeedActivityItems(items)).toHaveLength(2)
  })
})

describe('mark seen expansion', () => {
  it('expands collapsed ids from PATCH payloads', () => {
    expect(expandActivityIdsForMarkSeen([
      { source: 'activity', id: 'act_3', collapsedIds: ['act_2', 'act_1'] },
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
