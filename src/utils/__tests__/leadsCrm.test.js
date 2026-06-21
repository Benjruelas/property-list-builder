import { describe, it, expect } from 'vitest'
import { getLeadStatus, lastContactedAt, formatLastContacted, findLeadById, findLeadByParcelId, isParcelALead, formatLeadAddress, formatAddressProperCase } from '../leads'
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

describe('formatLeadAddress', () => {
  it('title-cases all-caps parcel addresses', () => {
    const lead = {
      address: '123 MAIN ST, DALLAS, TX 75201, United States',
    }
    expect(formatLeadAddress(lead)).toBe('123 Main St, Dallas, TX')
  })

  it('title-cases addresses built from parcel properties', () => {
    const lead = {
      address: '123 MAIN ST, DALLAS, TX',
      properties: {
        STREET: '123 MAIN ST',
        SITUS_CITY: 'DALLAS',
        state2: 'TX',
      },
    }
    expect(formatLeadAddress(lead)).toBe('123 Main St, Dallas, TX')
  })

  it('preserves directionals and ordinals', () => {
    expect(formatAddressProperCase('4521 NW 42ND ST, OKLAHOMA CITY, OK')).toBe(
      '4521 NW 42nd St, Oklahoma City, OK',
    )
  })
})

describe('findLeadById', () => {
  const leads = [{ id: 'lead_1', email: 'a@example.com' }, { id: 2, email: 'b@example.com' }]

  it('matches string and numeric ids', () => {
    expect(findLeadById(leads, 'lead_1')?.email).toBe('a@example.com')
    expect(findLeadById(leads, 2)?.email).toBe('b@example.com')
    expect(findLeadById(leads, '2')?.email).toBe('b@example.com')
  })
})

describe('findLeadByParcelId', () => {
  const leads = [
    {
      id: 'lead_1',
      parcelId: 'LR-100',
      lat: 30.27,
      lng: -97.74,
      properties: { PROP_ID: 'LR-100', LL_UUID: 'uuid-abc' },
    },
    {
      id: 'lead_2',
      parcelId: null,
      lat: 32.78,
      lng: -96.8,
      address: '456 Oak St',
    },
  ]

  it('matches by parcel id string', () => {
    expect(findLeadByParcelId(leads, 'LR-100')?.id).toBe('lead_1')
  })

  it('matches when popup parcel id differs but shares property ids', () => {
    expect(findLeadByParcelId(leads, { id: 'uuid-abc', properties: { LL_UUID: 'uuid-abc' } })?.id).toBe('lead_1')
  })

  it('matches scratch leads by coordinates when parcel id is missing', () => {
    expect(findLeadByParcelId(leads, { lat: 32.78, lng: -96.8 })?.id).toBe('lead_2')
  })

  it('matches by leadId when navigating from lead detail', () => {
    expect(findLeadByParcelId(leads, { leadId: 'lead_2', id: null })?.id).toBe('lead_2')
  })

  it('isParcelALead reflects findLeadByParcelId', () => {
    expect(isParcelALead(leads, { lat: 32.78, lng: -96.8 })).toBe(true)
    expect(isParcelALead(leads, { lat: 0, lng: 0 })).toBe(false)
  })
})
