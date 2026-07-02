import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mintReportPreviewToken } from '../previewToken.js'

vi.mock('../reportInvites.js', () => ({
  findReportInviteByToken: vi.fn(),
}))

vi.mock('../reportStore.js', () => ({
  getPhotoReportById: vi.fn(),
  getAllPhotoReports: vi.fn(),
}))

import { findReportInviteByToken } from '../reportInvites.js'
import { getPhotoReportById, getAllPhotoReports } from '../reportStore.js'
import { loadReportContext } from '../publicReportAccess.js'

describe('loadReportContext', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('resolves signed client preview tokens without a stored invite', async () => {
    const report = { id: 'preport_abc', title: 'Roof report', sections: [] }
    const token = mintReportPreviewToken(report.id)

    findReportInviteByToken.mockResolvedValue({ invite: null, index: -1, error: 'not_found' })
    getPhotoReportById.mockResolvedValue({ report, index: 0, all: [report] })

    const ctx = await loadReportContext(token)

    expect(ctx.error).toBeNull()
    expect(ctx.report).toBe(report)
    expect(ctx.invite.preview).toBe(true)
    expect(ctx.invite.reportId).toBe('preport_abc')
    expect(getPhotoReportById).toHaveBeenCalledWith('preport_abc')
  })

  it('returns not found when token matches neither invite nor preview', async () => {
    findReportInviteByToken.mockResolvedValue({ invite: null, index: -1, error: 'not_found' })
    getAllPhotoReports.mockResolvedValue([])

    const ctx = await loadReportContext('totally-unknown-token')

    expect(ctx.error).toBe('Report link not found')
    expect(ctx.status).toBe(404)
  })

  it('falls back to report.publicToken for legacy sent links', async () => {
    const report = { id: 'preport_legacy', title: 'Legacy report', publicToken: 'H3nQw8zK2p' }

    findReportInviteByToken.mockResolvedValue({ invite: null, index: -1, error: 'not_found' })
    getAllPhotoReports.mockResolvedValue([report])

    const ctx = await loadReportContext('H3nQw8zK2p')

    expect(ctx.error).toBeNull()
    expect(ctx.report).toBe(report)
    expect(ctx.invite.preview).toBe(true)
    expect(ctx.invite.reportId).toBe('preport_legacy')
  })
})
