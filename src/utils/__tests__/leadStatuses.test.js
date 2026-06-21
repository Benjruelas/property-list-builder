import { describe, it, expect } from 'vitest'
import {
  normalizeLeadStatuses,
  resolveLeadStatuses,
  canEditLeadStatuses,
  getLeadStatus,
  getPostContactStatusId,
  canRemoveLeadStatus,
  PROTECTED_LEAD_STATUS_IDS,
} from '../leadStatuses'

describe('normalizeLeadStatuses', () => {
  it('keeps required new and converted statuses', () => {
    const result = normalizeLeadStatuses([])
    expect(result.some((s) => s.id === 'new')).toBe(true)
    expect(result.some((s) => s.id === 'converted')).toBe(true)
  })

  it('applies custom labels', () => {
    const result = normalizeLeadStatuses([{ id: 'new', label: 'Fresh' }])
    expect(result.find((s) => s.id === 'new')?.label).toBe('Fresh')
  })
})

describe('resolveLeadStatuses', () => {
  it('uses team statuses for team members', () => {
    const custom = [{ id: 'new', label: 'Team New', color: 'x' }]
    const result = resolveLeadStatuses({
      settings: { leadStatuses: [{ id: 'new', label: 'Personal', color: 'y' }] },
      teams: [{ id: 't1', leadStatuses: custom }],
      teamMembership: { teamId: 't1', role: 'member' },
    })
    expect(result.find((s) => s.id === 'new')?.label).toBe('Team New')
  })

  it('falls back to defaults for team members without custom team statuses', () => {
    const result = resolveLeadStatuses({
      settings: { leadStatuses: [{ id: 'new', label: 'Personal', color: 'y' }] },
      teams: [{ id: 't1' }],
      teamMembership: { teamId: 't1', role: 'member' },
    })
    expect(result.find((s) => s.id === 'new')?.label).toBe('New')
  })

  it('uses personal settings for solo users', () => {
    const result = resolveLeadStatuses({
      settings: { leadStatuses: [{ id: 'new', label: 'Solo New', color: 'y' }] },
      teams: [],
      teamMembership: null,
    })
    expect(result.find((s) => s.id === 'new')?.label).toBe('Solo New')
  })
})

describe('canEditLeadStatuses', () => {
  it('allows solo users and team admins', () => {
    expect(canEditLeadStatuses(null)).toBe(true)
    expect(canEditLeadStatuses({ role: 'admin' })).toBe(true)
    expect(canEditLeadStatuses({ role: 'member' })).toBe(false)
  })
})

describe('getLeadStatus', () => {
  const registry = normalizeLeadStatuses([
    { id: 'new', label: 'New', color: 'a' },
    { id: 'contacted', label: 'Contacted', color: 'b' },
    { id: 'converted', label: 'Converted', color: 'c' },
    { id: 'lost', label: 'Lost', color: 'd' },
  ])

  it('derives converted when lead has deals', () => {
    expect(getLeadStatus({ status: 'new' }, 1, registry)).toBe('converted')
  })

  it('preserves lost even with deals', () => {
    expect(getLeadStatus({ status: 'lost' }, 2, registry)).toBe('lost')
  })
})

describe('getPostContactStatusId', () => {
  it('prefers contacted when available', () => {
    const registry = normalizeLeadStatuses([])
    expect(getPostContactStatusId(registry)).toBe('contacted')
  })
})

describe('canRemoveLeadStatus', () => {
  it('protects new and converted', () => {
    const registry = normalizeLeadStatuses([])
    for (const id of PROTECTED_LEAD_STATUS_IDS) {
      expect(canRemoveLeadStatus(id, registry)).toBe(false)
    }
  })
})
