import { describe, expect, it } from 'vitest'
import {
  buildDealFromLead,
  isLegacyDealColumnId,
  resolveInitialDealStatus,
  sanitizeDealStatuses,
} from '../deals'

describe('resolveInitialDealStatus', () => {
  it('prefers deal status registry over columns', () => {
    expect(
      resolveInitialDealStatus(
        [{ id: 'col-0', name: 'Open' }],
        [{ id: 'open', label: 'Open' }],
      ),
    ).toBe('open')
  })

  it('skips legacy col-N ids and falls back to open', () => {
    expect(resolveInitialDealStatus([{ id: 'col-0', name: 'Open' }], [])).toBe('open')
    expect(resolveInitialDealStatus([], [])).toBe('open')
  })

  it('uses canonical column ids when registry is empty', () => {
    expect(
      resolveInitialDealStatus([{ id: 'pending', name: 'Pending' }], []),
    ).toBe('pending')
  })
})

describe('buildDealFromLead', () => {
  const lead = { id: 'lead_1', firstName: 'Ada', lastName: 'Lovelace', address: '1 Main St' }

  it('does not assign legacy col-0 when columns are missing', () => {
    const deal = buildDealFromLead(lead, [], null, { title: 'Roof' })
    expect(deal.status).toBe('open')
  })

  it('uses override status and dealStatuses', () => {
    const deal = buildDealFromLead(lead, [{ id: 'col-0', name: 'Open' }], 'pipe_1', {
      title: 'Roof',
      dealStatuses: [{ id: 'open', label: 'Open' }, { id: 'closed', label: 'Closed' }],
    })
    expect(deal.status).toBe('open')
    expect(deal.pipelineId).toBe('pipe_1')
  })
})

describe('sanitizeDealStatuses', () => {
  it('remaps legacy col-N deal statuses onto open', () => {
    const deals = [
      { id: 'd1', status: 'col-0', title: 'A' },
      { id: 'd2', status: 'open', title: 'B' },
    ]
    const next = sanitizeDealStatuses(
      deals,
      [{ id: 'open', name: 'Open' }],
      [{ id: 'open', label: 'Open' }, { id: 'closed', label: 'Closed' }],
    )
    expect(next[0].status).toBe('open')
    expect(next[1]).toEqual(deals[1])
  })
})

describe('isLegacyDealColumnId', () => {
  it('detects col-N ids only', () => {
    expect(isLegacyDealColumnId('col-0')).toBe(true)
    expect(isLegacyDealColumnId('col-12')).toBe(true)
    expect(isLegacyDealColumnId('open')).toBe(false)
    expect(isLegacyDealColumnId('cold')).toBe(false)
  })
})
