import { describe, it, expect } from 'vitest'
import { splitOpenAndCompletedTasks, countCompletedTasks } from '../taskListDisplay'

describe('taskListDisplay', () => {
  it('splitOpenAndCompletedTasks separates open and completed tasks', () => {
    const tasks = [
      { id: '1', title: 'Open', completed: false },
      { id: '2', title: 'Done', completed: true },
      { id: '3', title: '', completed: false },
    ]
    const { open, completed } = splitOpenAndCompletedTasks(tasks)
    expect(open).toHaveLength(1)
    expect(open[0].id).toBe('1')
    expect(completed).toHaveLength(1)
    expect(completed[0].id).toBe('2')
  })

  it('countCompletedTasks returns completed count only', () => {
    expect(countCompletedTasks([
      { id: '1', title: 'A', completed: true },
      { id: '2', title: 'B', completed: false },
    ])).toBe(1)
  })
})
