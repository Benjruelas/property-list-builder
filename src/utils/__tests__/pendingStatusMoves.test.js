import { describe, expect, it } from 'vitest'
import {
  applyPendingStatuses,
  createSerialAsyncQueue,
  pruneResolvedPendingStatuses,
  setPendingStatus,
} from '../pendingStatusMoves'

describe('applyPendingStatuses', () => {
  it('overlays pending status without mutating other items', () => {
    const items = [
      { id: 'a', status: 'new', title: 'A' },
      { id: 'b', status: 'open', title: 'B' },
    ]
    const pending = new Map([['a', 'contacted']])
    expect(applyPendingStatuses(items, pending)).toEqual([
      { id: 'a', status: 'contacted', title: 'A' },
      { id: 'b', status: 'open', title: 'B' },
    ])
    expect(items[0].status).toBe('new')
  })
})

describe('pruneResolvedPendingStatuses', () => {
  it('drops pending entries once the source list matches', () => {
    const pending = new Map([['a', 'contacted'], ['b', 'lost']])
    const next = pruneResolvedPendingStatuses(
      [{ id: 'a', status: 'contacted' }, { id: 'b', status: 'new' }],
      pending,
    )
    expect([...next.entries()]).toEqual([['b', 'lost']])
  })
})

describe('setPendingStatus', () => {
  it('sets and clears without mutating the previous map', () => {
    const prev = new Map([['a', 'new']])
    const added = setPendingStatus(prev, 'b', 'open')
    expect(added.get('b')).toBe('open')
    expect(prev.has('b')).toBe(false)
    const cleared = setPendingStatus(added, 'a', null)
    expect(cleared.has('a')).toBe(false)
  })
})

describe('createSerialAsyncQueue', () => {
  it('runs tasks in order and always uses the latest scheduled work', async () => {
    const enqueue = createSerialAsyncQueue()
    const seen = []
    let latest = 0
    const first = enqueue(async () => {
      await Promise.resolve()
      seen.push(latest)
    })
    latest = 2
    const second = enqueue(async () => {
      seen.push(latest)
    })
    await Promise.all([first, second])
    expect(seen).toEqual([2, 2])
  })
})
