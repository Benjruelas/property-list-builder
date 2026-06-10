import { describe, it, expect } from 'vitest'
import { getLeadStatus, lastContactedAt, formatLastContacted } from '../leads'
import { buildActivityEntry } from '../leadActivity'

describe('lead CRM helpers', () => {
  it('getLeadStatus derives converted when lead has deals', () => {
    const lead = { id: 'l1', status: 'qualified' }
    expect(getLeadStatus(lead, 1)).toBe('converted')
  })

  it('getLeadStatus preserves lost even with deals', () => {
    const lead = { id: 'l1', status: 'lost' }
    expect(getLeadStatus(lead, 2)).toBe('lost')
  })

  it('lastContactedAt returns latest outreach activity', () => {
    const lead = {
      activity: [
        { type: 'note', at: '2026-01-01T00:00:00.000Z' },
        { type: 'call', at: '2026-02-01T00:00:00.000Z' },
        { type: 'email', at: '2026-01-15T00:00:00.000Z' },
      ],
    }
    expect(lastContactedAt(lead)).toBe('2026-02-01T00:00:00.000Z')
  })

  it('buildActivityEntry creates valid entry shape', () => {
    const entry = buildActivityEntry('call', 'Called from app', { phone: '555' })
    expect(entry.type).toBe('call')
    expect(entry.summary).toBe('Called from app')
    expect(entry.meta.phone).toBe('555')
    expect(entry.id).toMatch(/^act_/)
  })

  it('formatLastContacted handles recent dates', () => {
    const today = new Date().toISOString()
    expect(formatLastContacted(today)).toBe('Contacted today')
  })
})
