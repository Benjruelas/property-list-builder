import { describe, it, expect } from 'vitest'
import { resolveResourceAccess } from '../access.js'

const user = { uid: 'user-1', email: 'member@example.com' }
const admin = { uid: 'admin-1', email: 'admin@example.com' }

const teamA = {
  id: 'team_a',
  ownerId: 'other',
  members: [{ uid: 'user-1', role: 'member' }],
}

const teamB = {
  id: 'team_b',
  ownerId: 'admin-1',
  members: [{ uid: 'admin-1', role: 'admin' }],
}

const teams = [teamA, teamB]

describe('resolveResourceAccess', () => {
  it('team admin can edit members-visible pipeline without being in sharedMemberUids', () => {
    const pipeline = {
      ownerId: 'other',
      teamId: 'team_b',
      visibility: 'members',
      sharedMemberUids: ['someone-else'],
    }
    expect(resolveResourceAccess(pipeline, admin, teamA, teams)).toBe('admin')
  })

  it('team member can edit team-visible pipeline on another active team', () => {
    const pipeline = {
      ownerId: 'other',
      teamId: 'team_b',
      visibility: 'team',
      teamShares: ['team_b'],
    }
    expect(resolveResourceAccess(pipeline, user, teamA, teams)).toBe('collaborator')
  })

  it('uses pipeline team for admin role when user belongs to multiple teams', () => {
    const pipeline = {
      ownerId: 'other',
      teamId: 'team_b',
      visibility: 'team',
      teamShares: ['team_b'],
    }
    expect(resolveResourceAccess(pipeline, admin, teamA, teams)).toBe('admin')
  })
})
