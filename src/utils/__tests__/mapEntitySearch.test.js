import { describe, expect, it } from 'vitest'
import {
  isAddressLikeQuery,
  findLeadMatchField,
  searchMapEntities,
  buildMapSearchRows,
  linkedEntityMatchesQuery,
  MAP_ENTITY_SEARCH_LEAD_LIMIT,
} from '../mapEntitySearch'

describe('isAddressLikeQuery', () => {
  it('detects street-number patterns', () => {
    expect(isAddressLikeQuery('123 Main St')).toBe(true)
    expect(isAddressLikeQuery('  45 oak')).toBe(true)
  })

  it('detects coordinate shortcuts', () => {
    expect(isAddressLikeQuery('30.27, -97.74')).toBe(true)
  })

  it('rejects name-like and incomplete queries', () => {
    expect(isAddressLikeQuery('John')).toBe(false)
    expect(isAddressLikeQuery('123')).toBe(false)
    expect(isAddressLikeQuery('Main Street')).toBe(false)
    expect(isAddressLikeQuery('')).toBe(false)
  })
})

describe('findLeadMatchField', () => {
  const lead = {
    id: 'l1',
    firstName: 'John',
    lastName: 'Smith',
    phone: '(555) 123-4567',
    email: 'john@example.com',
    address: '123 Main St, Austin, TX',
    addressDetails: [{ value: '456 Oak Ave', primary: false }],
    notes: 'Interested in roof repair next spring',
  }

  it('matches name', () => {
    expect(findLeadMatchField(lead, 'john')).toEqual({ label: 'Name', value: 'John Smith' })
  })

  it('matches phone', () => {
    const m = findLeadMatchField(lead, '555123')
    expect(m?.label).toBe('Phone')
    expect(m?.value).toMatch(/555/)
  })

  it('matches email', () => {
    expect(findLeadMatchField(lead, 'john@example')).toEqual({
      label: 'Email',
      value: 'john@example.com',
    })
  })

  it('matches primary address', () => {
    expect(findLeadMatchField(lead, '123 main')).toEqual({
      label: 'Address',
      value: '123 Main St, Austin, TX',
    })
  })

  it('matches addressDetails', () => {
    expect(findLeadMatchField(lead, '456 oak')).toEqual({
      label: 'Address',
      value: '456 Oak Ave',
    })
  })

  it('matches notes with snippet', () => {
    const m = findLeadMatchField(lead, 'roof')
    expect(m?.label).toBe('Notes')
    expect(m?.value.toLowerCase()).toContain('roof')
  })

  it('returns null when nothing matches', () => {
    expect(findLeadMatchField(lead, 'zzzzzz')).toBeNull()
  })
})

describe('searchMapEntities', () => {
  const leads = [
    {
      id: 'l1',
      firstName: 'John',
      lastName: 'Smith',
      address: '123 Main St',
      updatedAt: '2024-02-01',
    },
    {
      id: 'l2',
      firstName: 'Jane',
      lastName: 'Doe',
      address: '123 Main Street',
      updatedAt: '2024-03-01',
    },
    {
      id: 'l3',
      firstName: 'Bob',
      lastName: 'Jones',
      address: '999 Other Rd',
      updatedAt: '2024-01-01',
    },
  ]

  const pipelines = [
    {
      id: 'pipe1',
      title: 'Sales',
      deals: [
        { id: 'd1', leadId: 'l1', title: 'John deal' },
        { id: 'd2', leadId: 'l2', title: 'Jane deal' },
      ],
    },
  ]

  const tasks = [
    { id: 't1', leadId: 'l1', title: 'Follow up' },
    { id: 't2', dealId: 'd1', title: 'Inspect roof' },
  ]

  const quotes = [{ id: 'q1', leadId: 'l1', title: 'Quote A' }]
  const reports = [{ id: 'r1', leadId: 'l1', title: 'Photo report' }]

  it('nests only linked entities whose text contains the query', () => {
    const matches = searchMapEntities({
      query: 'john',
      leads,
      pipelines,
      tasks,
      quotes,
      reports,
    })
    expect(matches).toHaveLength(1)
    expect(matches[0].id).toBe('l1')
    expect(matches[0].matchedFieldLabel).toBe('Name')
    // Deal title is "John deal" → included; unrelated task/quote/report titles → excluded
    expect(matches[0].linked.map((x) => x.type)).toEqual(['deal'])
    expect(matches[0].linked[0].id).toBe('d1')
  })

  it('includes matching tasks/quotes/reports under a matched lead', () => {
    const matches = searchMapEntities({
      query: 'john',
      leads,
      pipelines,
      tasks: [{ id: 't1', leadId: 'l1', title: 'Call John back' }],
      quotes: [{ id: 'q1', leadId: 'l1', title: 'John roof quote' }],
      reports: [{ id: 'r1', leadId: 'l1', title: 'John inspection report' }],
    })
    expect(matches[0].linked.map((x) => `${x.type}:${x.id}`).sort()).toEqual([
      'deal:d1',
      'quote:q1',
      'report:r1',
      'task:t1',
    ])
  })

  it('omits nested items that do not contain the query', () => {
    const matches = searchMapEntities({
      query: 'smith',
      leads,
      pipelines,
      tasks,
      quotes,
      reports,
    })
    expect(matches).toHaveLength(1)
    expect(matches[0].linked).toEqual([])
  })

  it('matches by address and sorts by recency', () => {
    const matches = searchMapEntities({ query: '123 main', leads, pipelines })
    expect(matches.map((m) => m.id)).toEqual(['l2', 'l1'])
  })

  it('linkedEntityMatchesQuery checks entity fields', () => {
    expect(linkedEntityMatchesQuery('deal', { title: 'Roof deal' }, 'roof')).toBe(true)
    expect(linkedEntityMatchesQuery('deal', { title: 'Roof deal' }, 'plumbing')).toBe(false)
    expect(linkedEntityMatchesQuery('task', { title: 'Follow up' }, 'follow')).toBe(true)
  })

  it('caps lead matches at the limit', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: `l${i}`,
      firstName: 'John',
      lastName: `N${i}`,
      updatedAt: `2024-0${(i % 9) + 1}-01`,
    }))
    const matches = searchMapEntities({ query: 'john', leads: many })
    expect(matches).toHaveLength(MAP_ENTITY_SEARCH_LEAD_LIMIT)
  })

  it('returns empty for short queries', () => {
    expect(searchMapEntities({ query: 'j', leads })).toEqual([])
  })
})

describe('buildMapSearchRows', () => {
  it('orders address first, then lead, then nested linked items', () => {
    const rows = buildMapSearchRows({
      addressResults: [{ id: 'mb1', place_name: '123 Main St, Austin, TX' }],
      leadMatches: [
        {
          type: 'lead',
          id: 'l1',
          label: 'John Smith',
          matchedFieldLabel: 'Address',
          matchedFieldValue: '123 Main St',
          linked: [
            { type: 'deal', id: 'd1', label: 'John deal', entity: { id: 'd1' } },
            { type: 'task', id: 't1', label: 'Follow up', entity: { id: 't1' } },
          ],
        },
      ],
    })

    expect(rows.map((r) => r.kind)).toEqual(['address', 'lead', 'deal', 'task'])
    expect(rows[0].label).toContain('123 Main')
    expect(rows[1].secondary).toBe('Address: 123 Main St')
    expect(rows[2].nested).toBe(true)
    expect(rows[3].nested).toBe(true)
  })

  it('omits address section when none provided', () => {
    const rows = buildMapSearchRows({
      addressResults: [],
      leadMatches: [
        {
          id: 'l1',
          label: 'John',
          matchedFieldLabel: 'Name',
          matchedFieldValue: 'John',
          linked: [],
        },
      ],
    })
    expect(rows.map((r) => r.kind)).toEqual(['lead'])
  })

  it('omits redundant Name secondary under lead rows', () => {
    const rows = buildMapSearchRows({
      leadMatches: [
        {
          id: 'l1',
          label: 'John Smith',
          matchedFieldLabel: 'Name',
          matchedFieldValue: 'John Smith',
          linked: [],
        },
      ],
    })
    expect(rows[0].secondary).toBeNull()
  })
})
