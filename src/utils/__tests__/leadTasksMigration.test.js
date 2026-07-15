import { beforeEach, describe, expect, it, vi } from 'vitest'
import { migrateLeadTasksToPipelines } from '../leadTasks'

describe('migrateLeadTasksToPipelines', () => {
  beforeEach(() => {
    const values = new Map()
    globalThis.localStorage = {
      getItem: vi.fn((key) => values.get(key) ?? null),
      setItem: vi.fn((key, value) => values.set(key, String(value))),
      removeItem: vi.fn((key) => values.delete(key)),
      clear: vi.fn(() => values.clear()),
    }
  })

  it('remaps tasks from legacy pipeline ids to the canonical pipe', async () => {
    localStorage.setItem('lead_tasks', JSON.stringify({
      v: 2,
      tasks: [{ id: 'task-1', title: 'Call owner', pipelineId: 'old-pipe' }],
    }))
    const addTask = vi.fn().mockResolvedValue({})

    const result = await migrateLeadTasksToPipelines([
      { id: 'canonical-pipe', legacyPipelineIds: ['old-pipe'] },
    ], addTask)

    expect(result).toEqual({ migrated: 1, skipped: 0, failed: 0 })
    expect(addTask).toHaveBeenCalledWith('canonical-pipe', expect.objectContaining({ id: 'task-1' }))
  })
})
