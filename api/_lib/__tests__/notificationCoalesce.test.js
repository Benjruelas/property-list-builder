import { describe, expect, it } from 'vitest'
import { coalesceInboxNotification } from '../notificationStore.js'

function notification(overrides = {}) {
  return {
    id: overrides.id || 'ntf_1',
    type: 'listShared',
    title: 'List shared',
    body: 'A list was shared with you',
    data: { type: 'listShared', listId: 'list_1' },
    read: false,
    createdAt: '2026-07-16T12:00:00.000Z',
    ...overrides,
  }
}

describe('coalesceInboxNotification', () => {
  it('updates the newest unread matching notification instead of inserting a duplicate', () => {
    const existing = notification({ id: 'ntf_old' })
    const incoming = notification({
      id: 'ntf_new',
      title: 'List shared again',
      body: 'Updated body',
      createdAt: '2026-07-16T12:05:00.000Z',
    })

    const { inbox, record, coalesced } = coalesceInboxNotification([existing], incoming)

    expect(coalesced).toBe(true)
    expect(inbox).toHaveLength(1)
    expect(record.id).toBe('ntf_old')
    expect(record.title).toBe('List shared again')
    expect(record.body).toBe('Updated body')
  })

  it('bumps counts for pipeline deal notifications', () => {
    const existing = notification({
      id: 'ntf_old',
      type: 'pipelineDealStage',
      coalesceKey: 'pipelineDealStage:pipe_1',
      title: 'Deal moved',
      body: 'One deal moved',
      data: { type: 'pipelineDealStage', pipelineId: 'pipe_1', pipelineTitle: 'Roofing' },
      count: 1,
    })
    const incoming = notification({
      id: 'ntf_new',
      type: 'pipelineDealStage',
      coalesceKey: 'pipelineDealStage:pipe_1',
      title: 'Deals moved',
      body: 'Another deal moved',
      data: { type: 'pipelineDealStage', pipelineId: 'pipe_1', pipelineTitle: 'Roofing' },
      delta: 2,
    })

    const { record, coalesced } = coalesceInboxNotification([existing], incoming)

    expect(coalesced).toBe(true)
    expect(record.count).toBe(3)
    expect(record.body).toBe('3 deals moved in Roofing')
  })

  it('creates a fresh unread row after the prior match was read', () => {
    const read = notification({ id: 'ntf_read', read: true })
    const incoming = notification({ id: 'ntf_new', title: 'Fresh share' })

    const { inbox, record, coalesced } = coalesceInboxNotification([read], incoming)

    expect(coalesced).toBe(false)
    expect(inbox).toHaveLength(2)
    expect(record.id).toBe('ntf_new')
  })
})
