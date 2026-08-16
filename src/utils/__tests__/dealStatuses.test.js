import { describe, expect, it } from 'vitest'
import {
  canEditDealStatuses,
  canRemoveDealStatus,
  normalizeDealStatuses,
  PROTECTED_DEAL_STATUS_IDS,
  resolveDealStatuses,
  slugifyDealStatusId,
} from '../dealStatuses'

describe('normalizeDealStatuses', () => {
  it('keeps required open and closed statuses and applies custom labels', () => {
    const result = normalizeDealStatuses([{ id: 'open', label: 'New Deal' }])

    expect(result.find((status) => status.id === 'open')?.label).toBe('New Deal')
    expect(result.some((status) => status.id === 'closed')).toBe(true)
  })

  it('rejects invalid records', () => {
    const result = normalizeDealStatuses([
      { id: 'not valid', label: 'Invalid' },
      { id: 'qualified', label: '' },
    ])

    expect(result.some((status) => status.id === 'not valid')).toBe(false)
    expect(result.some((status) => status.id === 'qualified')).toBe(false)
  })

  it('does not restore a removable status omitted from a custom registry', () => {
    const result = normalizeDealStatuses([
      { id: 'open', label: 'Open' },
      { id: 'closed', label: 'Closed' },
    ])

    expect(result.map((status) => status.id)).toEqual(['open', 'closed'])
  })

  it('preserves autoTasks on statuses', () => {
    const result = normalizeDealStatuses([
      {
        id: 'open',
        label: 'Open',
        autoTasks: [{ id: 't1', title: 'Kickoff', dueDaysOffset: 0 }],
      },
      { id: 'closed', label: 'Closed' },
    ])
    expect(result.find((s) => s.id === 'open')?.autoTasks?.[0]?.title).toBe('Kickoff')
  })
})

describe('resolveDealStatuses', () => {
  it('uses team statuses instead of personal statuses for team members', () => {
    const result = resolveDealStatuses({
      settings: { dealStatuses: [{ id: 'open', label: 'Personal' }] },
      teams: [{ id: 'team-1', dealStatuses: [{ id: 'open', label: 'Team Open' }] }],
      teamMembership: { teamId: 'team-1', role: 'member' },
    })

    expect(result.find((status) => status.id === 'open')?.label).toBe('Team Open')
  })

  it('uses personal statuses for solo users', () => {
    const result = resolveDealStatuses({
      settings: { dealStatuses: [{ id: 'open', label: 'Solo Open' }] },
    })

    expect(result.find((status) => status.id === 'open')?.label).toBe('Solo Open')
  })
})

describe('deal status editing helpers', () => {
  it('allows solo users and admins to edit, but not members', () => {
    expect(canEditDealStatuses(null)).toBe(true)
    expect(canEditDealStatuses({ role: 'admin' })).toBe(true)
    expect(canEditDealStatuses({ role: 'member' })).toBe(false)
  })

  it('protects open and closed from removal', () => {
    const statuses = normalizeDealStatuses([])
    for (const id of PROTECTED_DEAL_STATUS_IDS) {
      expect(canRemoveDealStatus(id, statuses)).toBe(false)
    }
  })

  it('creates unique stable ids', () => {
    expect(slugifyDealStatusId('Needs Review', new Set(['needs_review']))).toBe('needs_review_2')
  })
})
