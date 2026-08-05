import { describe, it, expect, beforeEach } from 'vitest'
import {
  findResourceShareInviteByToken,
  saveAllResourceShareInvites,
  generateResourceShareToken,
  findActiveResourceShareInvite,
  findClaimForUid,
  upsertClaimOnInvite,
  isResourceShareInviteExpired,
} from '../resourceShareInvites.js'

describe('resourceShareInvites', () => {
  beforeEach(async () => {
    await saveAllResourceShareInvites([])
  })

  it('generates 22-char tokens and resolves them from KV', async () => {
    const token = generateResourceShareToken()
    expect(token).toHaveLength(22)

    const invite = {
      token,
      resourceType: 'lead',
      resourceId: 'lead_1',
      ownerId: 'owner_1',
      status: 'pending',
      claims: [],
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    }
    await saveAllResourceShareInvites([invite])

    const result = await findResourceShareInviteByToken(token)
    expect(result.error).toBeNull()
    expect(result.invite).toEqual(invite)
  })

  it('returns not_found for short tokens', async () => {
    const result = await findResourceShareInviteByToken('short')
    expect(result.error).toBe('not_found')
  })

  it('finds active invites for a resource owner', () => {
    const future = new Date(Date.now() + 86400000).toISOString()
    const invites = [
      {
        token: 'tok_active_share_abcdefghi',
        resourceType: 'deal',
        resourceId: 'deal_1',
        ownerId: 'owner_1',
        status: 'pending',
        expiresAt: future,
      },
    ]
    expect(
      findActiveResourceShareInvite(invites, {
        resourceType: 'deal',
        resourceId: 'deal_1',
        ownerId: 'owner_1',
      })?.token,
    ).toBe('tok_active_share_abcdefghi')
  })

  it('tracks per-uid claims for deal clone idempotency', () => {
    const invite = {
      token: 'tok',
      claims: [],
    }
    const next = upsertClaimOnInvite(invite, {
      uid: 'user_a',
      dealId: 'deal_clone_1',
      pipelineId: 'pipe_1',
      leadId: 'lead_clone_1',
    })
    expect(findClaimForUid(next, 'user_a')?.dealId).toBe('deal_clone_1')
    expect(findClaimForUid(next, 'user_b')).toBeNull()

    const updated = upsertClaimOnInvite(next, {
      uid: 'user_a',
      dealId: 'deal_clone_1',
      pipelineId: 'pipe_1',
    })
    expect(updated.claims).toHaveLength(1)
  })

  it('detects expired invites', () => {
    expect(isResourceShareInviteExpired({
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    })).toBe(true)
    expect(isResourceShareInviteExpired({
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    })).toBe(false)
  })
})
