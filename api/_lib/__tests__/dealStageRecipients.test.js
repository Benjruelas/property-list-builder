import { describe, expect, it } from 'vitest'
import { dealStageRecipientEmails } from '../pushUtils.js'

describe('dealStageRecipientEmails', () => {
  const team = {
    id: 'team_1',
    ownerId: 'owner_1',
    ownerEmail: 'owner@test.com',
    members: [
      { uid: 'owner_1', email: 'owner@test.com', role: 'admin' },
      { uid: 'shared_1', email: 'shared@test.com', role: 'member' },
      { uid: 'other_1', email: 'other@test.com', role: 'member' },
    ],
  }
  const teamsIndex = { team_1: team }

  it('notifies only shared members for members-only pipes', () => {
    const emails = dealStageRecipientEmails({
      ownerEmail: 'owner@test.com',
      sharedWith: [],
      sharedMemberUids: ['shared_1'],
      visibility: 'members',
      teamId: 'team_1',
      teamsIndex,
      actorEmail: 'owner@test.com',
      actorUid: 'owner_1',
    })
    expect(emails.sort()).toEqual(['shared@test.com'])
  })

  it('does not notify teammates who are not shared on members-only pipes', () => {
    const emails = dealStageRecipientEmails({
      ownerEmail: 'owner@test.com',
      sharedMemberUids: ['shared_1'],
      visibility: 'members',
      teamId: 'team_1',
      teamsIndex,
      actorEmail: 'shared@test.com',
      actorUid: 'shared_1',
    })
    expect(emails).toContain('owner@test.com')
    expect(emails).not.toContain('other@test.com')
    expect(emails).not.toContain('shared@test.com')
  })

  it('notifies the whole team for team-visible pipes', () => {
    const emails = dealStageRecipientEmails({
      ownerEmail: 'owner@test.com',
      visibility: 'team',
      teamId: 'team_1',
      teamsIndex,
      actorEmail: 'owner@test.com',
      actorUid: 'owner_1',
    })
    expect(emails.sort()).toEqual(['other@test.com', 'shared@test.com'])
  })

  it('still includes legacy sharedWith emails', () => {
    const emails = dealStageRecipientEmails({
      ownerEmail: 'owner@test.com',
      sharedWith: ['legacy@test.com'],
      visibility: 'private',
      actorEmail: 'owner@test.com',
      actorUid: 'owner_1',
    })
    expect(emails).toEqual(['legacy@test.com'])
  })
})
