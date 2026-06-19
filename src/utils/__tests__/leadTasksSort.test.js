import { describe, expect, it } from 'vitest'
import { compareTasksByDueDate, groupOpenTasksByPipeline } from '../leadTasks'

describe('compareTasksByDueDate', () => {
  it('sorts soonest due dates first using scheduledAt or dueAt', () => {
    const soon = { id: 'a', createdAt: 3, scheduledAt: 1000 }
    const later = { id: 'b', createdAt: 2, dueAt: 5000 }
    const noDue = { id: 'c', createdAt: 1 }
    expect(compareTasksByDueDate(soon, later)).toBeLessThan(0)
    expect(compareTasksByDueDate(later, soon)).toBeGreaterThan(0)
    expect(compareTasksByDueDate(soon, noDue)).toBeLessThan(0)
    expect(compareTasksByDueDate(noDue, soon)).toBeGreaterThan(0)
  })
})

describe('groupOpenTasksByPipeline', () => {
  it('orders tasks within a pipeline group by due date', () => {
    const tasks = [
      { id: '1', title: 'Later', pipelineId: 'p1', dueAt: 5000, completed: false },
      { id: '2', title: 'Soon', pipelineId: 'p1', scheduledAt: 1000, completed: false },
      { id: '3', title: 'No due', pipelineId: 'p1', completed: false, createdAt: 99 },
    ]
    const pipelines = [{ id: 'p1', title: 'Pipe', tasks: [] }]
    const { groups } = groupOpenTasksByPipeline(tasks, pipelines)
    expect(groups[0].tasks.map((t) => t.id)).toEqual(['2', '1', '3'])
  })
})
