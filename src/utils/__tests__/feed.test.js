import { describe, expect, it } from 'vitest'
import {
  feedItemBadgeKind,
  feedItemCategoryLabel,
  feedItemBadgeClassName,
  FEED_BADGE_STYLES,
  expandFeedItemsForMarkSeen,
} from '../feed'

describe('feed badge styling', () => {
  it('maps core entity types to distinct badge kinds', () => {
    expect(feedItemBadgeKind({ type: 'lead.created', source: 'activity' })).toBe('lead')
    expect(feedItemBadgeKind({ type: 'deal.moved', source: 'activity' })).toBe('deal')
    expect(feedItemBadgeKind({ type: 'task.completed', source: 'activity' })).toBe('task')
  })

  it('distinguishes pipeline-only events from deal events', () => {
    expect(feedItemBadgeKind({ type: 'pipeline.shared', source: 'activity' })).toBe('pipeline')
    expect(feedItemBadgeKind({ type: 'pipelineDealStage', source: 'notification', nav: { type: 'pipelineDealStage' } })).toBe('deal')
  })

  it('labels and styles other feed types', () => {
    const listItem = { type: 'list.shared', source: 'activity' }
    expect(feedItemCategoryLabel(listItem)).toBe('List')
    expect(feedItemBadgeClassName(listItem)).toBe(FEED_BADGE_STYLES.list)

    const sharedNote = { type: 'listShared', source: 'notification' }
    expect(feedItemCategoryLabel(sharedNote)).toBe('Shared')
    expect(feedItemBadgeClassName(sharedNote)).toBe(FEED_BADGE_STYLES.shared)
  })

  it('expands collapsed activity ids for mark-seen payloads', () => {
    const expanded = expandFeedItemsForMarkSeen([
      { source: 'activity', id: 'act_3', collapsedIds: ['act_2', 'act_1'] },
      { source: 'notification', id: 'ntf_1' },
    ])
    expect(expanded.map((item) => item.id)).toEqual(['act_3', 'act_2', 'act_1', 'ntf_1'])
  })
})
