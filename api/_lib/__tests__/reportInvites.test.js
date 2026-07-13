import { describe, it, expect, beforeEach } from 'vitest'
import {
  findReportInviteByToken,
  saveAllReportInvites,
  generateReportToken,
  supersedePendingReportInvites,
  hasPriorReportInvite,
  findActiveReportInviteByToken,
  findActiveLinkOnlyReportInvite,
} from '../reportInvites.js'

describe('findReportInviteByToken', () => {
  beforeEach(async () => {
    await saveAllReportInvites([])
  })

  it('resolves generated invite tokens stored in KV', async () => {
    const token = generateReportToken()
    expect(token).toHaveLength(22)

    const invite = {
      token,
      reportId: 'preport_abc',
      recipientEmail: 'client@example.com',
      status: 'pending',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    }
    await saveAllReportInvites([invite])

    const result = await findReportInviteByToken(token)

    expect(result.error).toBeNull()
    expect(result.invite).toEqual(invite)
    expect(result.index).toBe(0)
  })

  it('returns not_found for tokens shorter than 8 characters', async () => {
    const result = await findReportInviteByToken('abc1234')
    expect(result.error).toBe('not_found')
    expect(result.invite).toBeNull()
  })
})

describe('link-only report invites', () => {
  const future = new Date(Date.now() + 86400000).toISOString()

  it('supersedes prior link-only invites for the same report', () => {
    const oldToken = 'tok_old_link_only_abc'
    const newToken = 'tok_new_link_only_xyz'
    const invites = [
      {
        token: oldToken,
        reportId: 'preport_1',
        recipientEmail: '',
        status: 'pending',
        expiresAt: future,
      },
    ]

    const { invites: next, supersededCount } = supersedePendingReportInvites(invites, {
      reportId: 'preport_1',
      recipientEmail: '',
      keepToken: newToken,
    })

    expect(supersededCount).toBe(1)
    expect(next[0].status).toBe('revoked')
  })

  it('tracks prior link-only invites separately from addressed invites', () => {
    const invites = [
      { reportId: 'preport_1', recipientEmail: '', status: 'pending' },
      { reportId: 'preport_1', recipientEmail: 'client@example.com', status: 'pending' },
    ]

    expect(hasPriorReportInvite(invites, { reportId: 'preport_1', recipientEmail: '' })).toBe(true)
    expect(hasPriorReportInvite(invites, { reportId: 'preport_1', recipientEmail: 'client@example.com' })).toBe(true)
    expect(hasPriorReportInvite(invites, { reportId: 'preport_1', recipientEmail: 'other@example.com' })).toBe(false)
  })
})

describe('active report invite lookup', () => {
  const future = new Date(Date.now() + 86400000).toISOString()
  const past = new Date(Date.now() - 86400000).toISOString()

  it('finds active link-only invites for a report owner', () => {
    const invites = [
      {
        token: 'tok_link_only_active',
        reportId: 'preport_1',
        ownerId: 'owner_1',
        recipientEmail: '',
        status: 'pending',
        expiresAt: future,
      },
    ]

    expect(findActiveLinkOnlyReportInvite(invites, { reportId: 'preport_1', ownerId: 'owner_1' })?.token)
      .toBe('tok_link_only_active')
  })

  it('reuses the same token by report publicToken lookup', () => {
    const invites = [
      {
        token: 'tok_public_active',
        reportId: 'preport_1',
        ownerId: 'owner_1',
        recipientEmail: '',
        status: 'pending',
        expiresAt: future,
      },
    ]

    const found = findActiveReportInviteByToken(invites, {
      token: 'tok_public_active',
      reportId: 'preport_1',
      ownerId: 'owner_1',
    })

    expect(found?.token).toBe('tok_public_active')
    expect(findActiveReportInviteByToken(invites, {
      token: 'tok_public_active',
      reportId: 'preport_1',
      ownerId: 'owner_2',
    })).toBeNull()
  })

  it('ignores expired invites', () => {
    const invites = [
      {
        token: 'tok_expired',
        reportId: 'preport_1',
        ownerId: 'owner_1',
        recipientEmail: '',
        status: 'pending',
        expiresAt: past,
      },
    ]

    expect(findActiveReportInviteByToken(invites, {
      token: 'tok_expired',
      reportId: 'preport_1',
      ownerId: 'owner_1',
    })).toBeNull()
  })
})
