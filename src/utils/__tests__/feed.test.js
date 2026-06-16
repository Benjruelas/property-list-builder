import { describe, expect, it } from 'vitest'
import {
  feedItemBadgeKind,
  feedItemCategoryLabel,
  feedItemBadgeClassName,
  FEED_BADGE_STYLES,
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
})
