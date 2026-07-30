import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../invitePrune.js', () => ({
  pruneDeadInvites: (invites) => invites || [],
}))

describe('recordInviteView', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('marks first view and increments count on later views', async () => {
    const mod = await import('../formInvites.js')
    const token = 'a'.repeat(32)
    const invite = {
      id: 'inv1',
      token,
      templateId: 'tpl1',
      status: 'pending',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      recipientEmail: 'client@test.com',
      ownerEmail: 'owner@test.com',
    }
    await mod.saveAllInvites([invite])

    const first = await mod.recordInviteView(token)
    expect(first.ok).toBe(true)
    expect(first.isFirst).toBe(true)
    expect(first.invite.viewTracking?.firstViewedAt).toBeTruthy()
    expect(first.invite.viewTracking?.viewCount).toBe(1)

    const second = await mod.recordInviteView(token)
    expect(second.ok).toBe(true)
    expect(second.isFirst).toBe(false)
    expect(second.invite.viewTracking?.viewCount).toBe(2)
    expect(second.invite.viewTracking?.firstViewedAt).toBe(first.invite.viewTracking.firstViewedAt)
  })

  it('rejects submitted invites', async () => {
    const mod = await import('../formInvites.js')
    const token = 'b'.repeat(32)
    await mod.saveAllInvites([{
      id: 'inv2',
      token,
      templateId: 'tpl1',
      status: 'submitted',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    }])
    const result = await mod.recordInviteView(token)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('submitted')
    expect(result.isFirst).toBe(false)
  })
})
