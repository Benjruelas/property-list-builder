import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mergeServerTasksIntoList,
  buildVisibleTaskList,
  buildVisibleTaskListFresh,
  resolvePipelinesForTasks,
} from '../taskListSync'
import { collectTasksForDealFresh } from '../dealTaskMatching'

vi.mock('../taskMigration', () => ({
  fetchAllServerTasks: vi.fn(),
}))

import { fetchAllServerTasks } from '../taskMigration'

describe('taskListSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mergeServerTasksIntoList adds server tasks not already present', () => {
    const merged = [{ id: 'a', title: 'A' }]
    const server = [{ id: 'b', title: 'B', __source: 'server' }]
    const out = mergeServerTasksIntoList(merged, server)
    expect(out).toHaveLength(2)
    expect(out[1].id).toBe('b')
    expect(out[1].__source).toBe('server')
  })

  it('mergeServerTasksIntoList skips duplicate ids', () => {
    const merged = [{ id: 'a', title: 'A' }]
    const server = [{ id: 'a', title: 'Server A' }]
    expect(mergeServerTasksIntoList(merged, server)).toHaveLength(1)
  })

  it('buildVisibleTaskList returns empty (legacy stub)', () => {
    expect(buildVisibleTaskList({ pipelines: [{ id: 'p1', tasks: [{ id: 't1' }] }] })).toEqual([])
  })

  it('buildVisibleTaskListFresh returns server tasks when signed in', async () => {
    fetchAllServerTasks.mockResolvedValue([
      { id: 'srv-1', title: 'Assigned', dealId: 'deal-1', __source: 'server' },
    ])

    const list = await buildVisibleTaskListFresh({
      getToken: async () => 'token',
    })

    expect(fetchAllServerTasks).toHaveBeenCalled()
    expect(list.some((t) => t.id === 'srv-1')).toBe(true)
  })

  it('buildVisibleTaskListFresh returns empty when not signed in', async () => {
    const list = await buildVisibleTaskListFresh({ getToken: null })
    expect(list).toEqual([])
    expect(fetchAllServerTasks).not.toHaveBeenCalled()
  })

  it('collectTasksForDealFresh filters deal-scoped tasks from server list', async () => {
    fetchAllServerTasks.mockResolvedValue([
      { id: 't1', title: 'Mine', dealId: 'deal-1' },
      { id: 't2', title: 'Other', dealId: 'deal-2' },
    ])

    const deal = { id: 'deal-1' }
    const tasks = await collectTasksForDealFresh(deal, [], {
      getToken: async () => 'token',
    })

    expect(tasks).toHaveLength(1)
    expect(tasks[0].id).toBe('t1')
  })

  it('resolvePipelinesForTasks returns pipelines unchanged', async () => {
    const stale = [{ id: 'pipe-1', tasks: [] }]
    const out = await resolvePipelinesForTasks(async () => 'token', stale)
    expect(out).toBe(stale)
  })
})
