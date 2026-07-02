import { describe, it, expect } from 'vitest'
import { shouldEnableSharedAssetSync } from '../sharedAssetSync'

describe('shouldEnableSharedAssetSync', () => {
  it('enables sync when the user belongs to a team', () => {
    expect(shouldEnableSharedAssetSync({
      currentUserId: 'user_1',
      teams: [{ id: 'team_1' }],
      leads: [],
      pipelines: [],
    })).toBe(true)
  })

  it('enables sync for shared leads without a team workspace', () => {
    expect(shouldEnableSharedAssetSync({
      currentUserId: 'user_2',
      teams: [],
      leads: [{ id: 'lead_1', ownerId: 'user_1', visibility: 'members' }],
      pipelines: [],
    })).toBe(true)
  })

  it('disables sync for private solo resources', () => {
    expect(shouldEnableSharedAssetSync({
      currentUserId: 'user_1',
      teams: [],
      leads: [{ id: 'lead_1', ownerId: 'user_1', visibility: 'private' }],
      pipelines: [{ id: 'pipe_1', ownerId: 'user_1', visibility: 'private' }],
    })).toBe(false)
  })
})
