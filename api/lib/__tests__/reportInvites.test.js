import { describe, it, expect, beforeEach } from 'vitest'
import {
  findReportInviteByToken,
  saveAllReportInvites,
  generateReportToken,
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
