import { describe, it, expect } from 'vitest'
import { findActivePreviewQuoteInvite, isInviteExpired } from '../quoteInvites.js'
import { findActivePreviewReportInvite, isReportInviteExpired } from '../reportInvites.js'

describe('findActivePreviewQuoteInvite', () => {
  const future = new Date(Date.now() + 86400000).toISOString()
  const past = new Date(Date.now() - 86400000).toISOString()

  it('returns active preview invite for quote and owner', () => {
    const invite = {
      token: 'abc',
      quoteId: 'q1',
      ownerId: 'u1',
      preview: true,
      status: 'pending',
      expiresAt: future,
    }
    const found = findActivePreviewQuoteInvite([invite], { quoteId: 'q1', ownerId: 'u1' })
    expect(found).toBe(invite)
  })

  it('ignores non-preview and expired invites', () => {
    const invites = [
      { token: 'a', quoteId: 'q1', ownerId: 'u1', preview: false, status: 'pending', expiresAt: future },
      { token: 'b', quoteId: 'q1', ownerId: 'u1', preview: true, status: 'pending', expiresAt: past },
      { token: 'c', quoteId: 'q1', ownerId: 'u2', preview: true, status: 'pending', expiresAt: future },
    ]
    expect(findActivePreviewQuoteInvite(invites, { quoteId: 'q1', ownerId: 'u1' })).toBeNull()
  })
})

describe('findActivePreviewReportInvite', () => {
  const future = new Date(Date.now() + 86400000).toISOString()

  it('returns active preview invite for report and owner', () => {
    const invite = {
      token: 'xyz',
      reportId: 'r1',
      ownerId: 'u1',
      preview: true,
      status: 'pending',
      expiresAt: future,
    }
    const found = findActivePreviewReportInvite([invite], { reportId: 'r1', ownerId: 'u1' })
    expect(found).toBe(invite)
  })
})

describe('preview invite expiry helpers', () => {
  it('isInviteExpired respects expiresAt', () => {
    expect(isInviteExpired({ expiresAt: new Date(Date.now() - 1000).toISOString() })).toBe(true)
    expect(isInviteExpired({ expiresAt: new Date(Date.now() + 86400000).toISOString() })).toBe(false)
  })

  it('isReportInviteExpired respects expiresAt', () => {
    expect(isReportInviteExpired({ expiresAt: new Date(Date.now() - 1000).toISOString() })).toBe(true)
    expect(isReportInviteExpired({ expiresAt: new Date(Date.now() + 86400000).toISOString() })).toBe(false)
  })
})
