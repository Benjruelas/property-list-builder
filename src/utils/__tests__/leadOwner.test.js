import { describe, it, expect } from 'vitest'
import { displayLeadOwnerLabel, isLeadOwnedByCurrentUser } from '../leadOwner'
import { DEV_USER_A, DEV_USER_B } from '../devPersona'

describe('displayLeadOwnerLabel', () => {
  it('resolves dev persona display names', () => {
    expect(displayLeadOwnerLabel({ ownerId: DEV_USER_A.uid })).toBe(DEV_USER_A.displayName)
    expect(displayLeadOwnerLabel({ ownerId: DEV_USER_B.uid })).toBe(DEV_USER_B.displayName)
  })

  it('resolves team member email to a short label', () => {
    const teams = [{
      id: 't1',
      ownerId: 'other',
      members: [{ uid: 'member-1', email: 'dev@localhost' }],
    }]
    expect(displayLeadOwnerLabel({ ownerId: 'member-1' }, { teams })).toBe('Dev')
  })

  it('falls back to ownerEmail when ownerId is not in teams', () => {
    expect(displayLeadOwnerLabel({ ownerEmail: 'alex@example.com' })).toBe('Alex')
  })
})

describe('isLeadOwnedByCurrentUser', () => {
  it('matches owner id with string coercion', () => {
    expect(isLeadOwnedByCurrentUser({ ownerId: 'abc' }, { uid: 'abc' })).toBe(true)
    expect(isLeadOwnedByCurrentUser({ ownerId: 'abc' }, { uid: 'other' })).toBe(false)
  })
})
