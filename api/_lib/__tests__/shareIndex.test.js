import { describe, it, expect, vi, beforeEach } from 'vitest'
import { collectAffectedUidsForResource, syncSharedOwnerIndex } from '../shareIndex.js'

vi.mock('../kvOps.js', () => ({
  kvSAdd: vi.fn(),
  kvSRem: vi.fn(),
  kvAvailable: true,
}))

import { kvSAdd, kvSRem } from '../kvOps.js'

describe('shareIndex', () => {
  beforeEach(() => {
    kvSAdd.mockClear()
    kvSRem.mockClear()
  })

  it('collectAffectedUidsForResource includes owner, shared members, and team members', () => {
    const teams = [{
      id: 'team_1',
      ownerId: 'owner_a',
      members: [{ uid: 'member_b' }],
    }]
    const resource = {
      ownerId: 'owner_x',
      sharedMemberUids: ['collab_y'],
      teamShares: ['team_1'],
    }
    const uids = collectAffectedUidsForResource(resource, teams)
    expect(uids).toContain('owner_x')
    expect(uids).toContain('collab_y')
    expect(uids).toContain('owner_a')
    expect(uids).toContain('member_b')
  })

  it('syncSharedOwnerIndex adds new collaborators and removes stale ones', async () => {
    const teams = []
    const prev = {
      ownerId: 'owner_1',
      sharedMemberUids: ['user_a', 'user_b'],
    }
    const next = {
      ownerId: 'owner_1',
      sharedMemberUids: ['user_b', 'user_c'],
    }

    await syncSharedOwnerIndex({
      resource: next,
      prevResource: prev,
      allTeams: teams,
      sharedKeyPrefix: 'shared-leads:',
    })

    expect(kvSRem).toHaveBeenCalledWith('shared-leads:user_a', 'owner_1')
    expect(kvSAdd).toHaveBeenCalledWith('shared-leads:user_c', 'owner_1')
    expect(kvSAdd).not.toHaveBeenCalledWith('shared-leads:user_b', 'owner_1')
  })

  it('syncSharedOwnerIndex removes all shared links on delete', async () => {
    const prev = {
      ownerId: 'owner_1',
      sharedMemberUids: ['user_a'],
    }

    await syncSharedOwnerIndex({
      resource: null,
      prevResource: prev,
      allTeams: [],
      sharedKeyPrefix: 'shared-pipelines:',
    })

    expect(kvSRem).toHaveBeenCalledWith('shared-pipelines:user_a', 'owner_1')
    expect(kvSAdd).not.toHaveBeenCalled()
  })
})
