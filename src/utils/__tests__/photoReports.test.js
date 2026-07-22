import { describe, it, expect } from 'vitest'
import { getReportListDate } from '../photoReports'

describe('getReportListDate', () => {
  const base = {
    createdAt: '2026-01-01T10:00:00.000Z',
    sentAt: '2026-01-02T12:00:00.000Z',
    updatedAt: '2026-01-03T14:00:00.000Z',
    viewTracking: { lastViewedAt: '2026-01-04T16:00:00.000Z' },
  }

  it('uses createdAt for draft reports', () => {
    expect(getReportListDate({ ...base, status: 'draft' })).toBe(base.createdAt)
  })

  it('uses sentAt for sent reports', () => {
    expect(getReportListDate({ ...base, status: 'sent' })).toBe(base.sentAt)
  })

  it('uses lastViewedAt for viewed reports', () => {
    expect(getReportListDate({ ...base, status: 'viewed' })).toBe(base.viewTracking.lastViewedAt)
  })

  it('falls back when preferred field is missing', () => {
    expect(getReportListDate({ status: 'sent', createdAt: base.createdAt })).toBe(base.createdAt)
    expect(getReportListDate({
      status: 'viewed',
      sentAt: base.sentAt,
      createdAt: base.createdAt,
    })).toBe(base.sentAt)
    expect(getReportListDate({ status: 'draft', updatedAt: base.updatedAt })).toBe(base.updatedAt)
  })

  it('returns null for empty report', () => {
    expect(getReportListDate(null)).toBeNull()
    expect(getReportListDate({ status: 'draft' })).toBeNull()
  })
})
