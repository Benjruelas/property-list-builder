import { describe, it, expect } from 'vitest'
import {
  taskVisibleToUser,
  canManageTask,
  canDeleteTask,
  sharedViewerMayPatch,
} from '../taskAccess.js'

describe('taskAccess', () => {
  const team = { id: 'team-1' }
  const owner = { uid: 'owner-1' }
  const assignee = { uid: 'assignee-1' }
  const sharedMember = { uid: 'shared-1' }
  const teammate = { uid: 'teammate-1' }
  const outsider = { uid: 'outsider-1' }

  const baseTask = {
    id: 'task-1',
    ownerId: 'owner-1',
    teamId: 'team-1',
    assignedUids: ['assignee-1'],
    visibility: 'members',
    sharedMemberUids: ['shared-1'],
  }

  it('allows owner, assignees, and shared viewers to manage tasks', () => {
    expect(canManageTask(baseTask, owner)).toBe(true)
    expect(canManageTask(baseTask, assignee)).toBe(true)
    expect(canManageTask(baseTask, sharedMember, team)).toBe(true)
    expect(canManageTask(baseTask, teammate, team)).toBe(false)
    expect(canManageTask(baseTask, outsider, null)).toBe(false)
  })

  it('allows all teammates to manage team-visible tasks', () => {
    const task = { ...baseTask, visibility: 'team', sharedMemberUids: [], assignedUids: [] }
    expect(canManageTask(task, teammate, team)).toBe(true)
    expect(canManageTask(task, owner, team)).toBe(true)
  })

  it('shows team-visible tasks to all teammates', () => {
    const task = { ...baseTask, visibility: 'team', sharedMemberUids: [], assignedUids: [] }
    expect(taskVisibleToUser(task, teammate, team)).toBe(true)
    expect(taskVisibleToUser(task, outsider, null)).toBe(false)
  })

  it('shows member-shared tasks only to listed teammates', () => {
    expect(taskVisibleToUser(baseTask, sharedMember, team)).toBe(true)
    expect(taskVisibleToUser(baseTask, teammate, team)).toBe(false)
  })

  it('allows shared viewers to patch completion only', () => {
    expect(sharedViewerMayPatch({ taskId: 'task-1', completed: true })).toBe(true)
    expect(sharedViewerMayPatch({ taskId: 'task-1', completed: false })).toBe(true)
    expect(sharedViewerMayPatch({ taskId: 'task-1' })).toBe(false)
    expect(sharedViewerMayPatch({ taskId: 'task-1', completed: true, title: 'nope' })).toBe(false)
    expect(sharedViewerMayPatch({ taskId: 'task-1', notes: 'nope' })).toBe(false)
  })

  it('allows assignees and shared viewers to delete tasks', () => {
    expect(canDeleteTask(baseTask, owner, team)).toBe(true)
    expect(canDeleteTask(baseTask, assignee, team)).toBe(true)
    expect(canDeleteTask(baseTask, sharedMember, team)).toBe(true)
    expect(canDeleteTask(baseTask, teammate, team)).toBe(false)
  })
})
