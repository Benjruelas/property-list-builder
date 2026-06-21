import { describe, it, expect } from 'vitest'
import {
  resolveResourceAccess,
  canMutateLeadPhotos,
  isLeadOwner,
  userCapturedPhoto,
  userCapturedAllPhotos,
} from '../access.js'

const user = { uid: 'user-1', email: 'member@example.com' }
const admin = { uid: 'admin-1', email: 'admin@example.com' }
const owner = { uid: 'user-1', email: 'owner@example.com' }

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

const team = {
  id: 'team_a',
  ownerId: 'admin-1',
  members: [
    { uid: 'admin-1', role: 'admin' },
    { uid: 'user-1', role: 'member' },
  ],
}

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

  it('team member with shared access gets collaborator', () => {
    const pipeline = {
      ownerId: 'other',
      teamId: 'team_a',
      visibility: 'members',
      sharedMemberUids: ['user-1'],
    }
    expect(resolveResourceAccess(pipeline, user, teamA, teams)).toBe('collaborator')
  })

  it('team admin gets admin_view for private team resources', () => {
    const pipeline = {
      ownerId: 'other',
      teamId: 'team_b',
      visibility: 'private',
    }
    expect(resolveResourceAccess(pipeline, admin, teamA, teams)).toBe('admin_view')
  })
})

describe('resolveResourceAccess owner email fallback', () => {
  it('treats legacy leads without ownerId as owner when ownerEmail matches', () => {
    const lead = {
      visibility: 'private',
      teamId: 'team_a',
      ownerEmail: 'owner@example.com',
    }
    expect(resolveResourceAccess(lead, owner, team, [team])).toBe('owner')
  })
})

describe('canMutateLeadPhotos', () => {
  const privateLead = {
    ownerId: 'user-1',
    ownerEmail: 'owner@example.com',
    visibility: 'private',
    teamId: 'team_a',
  }

  it('allows the lead owner to delete photos', () => {
    expect(canMutateLeadPhotos(owner, privateLead, 'owner')).toBe(true)
  })

  it('blocks team admins from deleting photos on another member private lead', () => {
    const memberLead = { ...privateLead, ownerId: 'other-member' }
    expect(canMutateLeadPhotos(admin, memberLead, 'admin_view')).toBe(false)
  })

  it('allows the user who captured a photo to delete it', () => {
    const photo = { capturedByUid: 'admin-1' }
    expect(canMutateLeadPhotos(admin, privateLead, 'admin_view', photo)).toBe(true)
  })

  it('allows delete when user captured every photo on a mis-attributed private lead', () => {
    const misowned = {
      ownerId: 'other-member',
      visibility: 'private',
      teamId: 'team_a',
      photos: [
        { id: 'p1', capturedByUid: 'user-1' },
        { id: 'p2', capturedByUid: 'user-1' },
      ],
    }
    expect(canMutateLeadPhotos(owner, misowned, 'admin_view')).toBe(true)
  })

  it('blocks team admin from deleting another member photos on a private lead', () => {
    const memberLead = {
      ownerId: 'other-member',
      visibility: 'private',
      teamId: 'team_a',
      photos: [{ id: 'p1', capturedByUid: 'other-member' }],
    }
    expect(canMutateLeadPhotos(admin, memberLead, 'admin_view')).toBe(false)
    expect(canMutateLeadPhotos(admin, memberLead, 'admin_view', memberLead.photos[0])).toBe(false)
  })
})
