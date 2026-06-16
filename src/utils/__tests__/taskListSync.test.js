import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mergeServerTasksIntoList,
  buildVisibleTaskList,
  buildVisibleTaskListFresh,
  resolvePipelinesForTasks,
} from '../taskListSync'
import { collectTasksForDealFresh } from '../dealTaskMatching'

vi.mock('../pipelines', () => ({
  fetchPipelines: vi.fn(),
}))

vi.mock('../tasks', () => ({
  fetchTeamTasks: vi.fn(),
}))

vi.mock('../leadTasks', () => ({
  getPersonalTasks: vi.fn(() => [{ id: 'p1', title: 'Personal', dealId: null }]),
  getAllTasks: vi.fn(() => []),
}))

import { fetchPipelines } from '../pipelines'
import { fetchTeamTasks } from '../tasks'

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

  it('buildVisibleTaskList includes pipeline tasks with dealId', () => {
    const pipelines = [{
      id: 'pipe-1',
      tasks: [{ id: 't1', title: 'Deal task', dealId: 'deal-1' }],
    }]
    const list = buildVisibleTaskList({ pipelines })
    expect(list.some((t) => t.id === 't1' && t.dealId === 'deal-1')).toBe(true)
  })

  it('buildVisibleTaskListFresh prefers freshly fetched pipelines', async () => {
    const stale = [{ id: 'pipe-1', tasks: [] }]
    const fresh = [{
      id: 'pipe-1',
      tasks: [{ id: 't-new', title: 'New deal task', dealId: 'deal-1' }],
    }]
    fetchPipelines.mockResolvedValue(fresh)

    const list = await buildVisibleTaskListFresh({
      pipelines: stale,
      getToken: async () => 'token',
      teams: [{ id: 'team-1' }],
    })

    expect(fetchPipelines).toHaveBeenCalled()
    expect(list.some((t) => t.id === 't-new')).toBe(true)
  })

  it('buildVisibleTaskListFresh merges server-assigned tasks', async () => {
    fetchPipelines.mockResolvedValue([{ id: 'pipe-1', tasks: [] }])
    fetchTeamTasks.mockResolvedValue({
      tasks: [{ id: 'srv-1', title: 'Assigned', dealId: 'deal-1' }],
    })

    const list = await buildVisibleTaskListFresh({
      pipelines: [{ id: 'pipe-1', tasks: [] }],
      getToken: async () => 'token',
      teams: [{ id: 'team-1' }],
    })

    expect(list.some((t) => t.id === 'srv-1' && t.__source === 'server')).toBe(true)
  })

  it('collectTasksForDealFresh returns deal-scoped tasks from fresh data', async () => {
    fetchPipelines.mockResolvedValue([{
      id: 'pipe-1',
      tasks: [
        { id: 't1', title: 'Mine', dealId: 'deal-1' },
        { id: 't2', title: 'Other', dealId: 'deal-2' },
      ],
    }])
    fetchTeamTasks.mockResolvedValue({ tasks: [] })

    const deal = { id: 'deal-1' }
    const tasks = await collectTasksForDealFresh(deal, [], {
      getToken: async () => 'token',
      teams: [{ id: 'team-1' }],
    })

    expect(tasks).toHaveLength(1)
    expect(tasks[0].id).toBe('t1')
  })

  it('resolvePipelinesForTasks falls back to prop pipelines on fetch failure', async () => {
    fetchPipelines.mockRejectedValue(new Error('network'))
    const stale = [{ id: 'pipe-1', tasks: [{ id: 't1', title: 'Local', dealId: 'd1' }] }]
    const out = await resolvePipelinesForTasks(async () => 'token', stale)
    expect(out).toBe(stale)
  })
})
