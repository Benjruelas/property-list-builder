import { describe, expect, it } from 'vitest'
import { filterDealsForLead } from '../entityPickerShared'

describe('filterDealsForLead', () => {
  const lead = { id: 'l1', parcelId: 'p1' }
  const deals = [
    { id: 'd1', leadId: 'l1', title: 'Mine' },
    { id: 'd2', leadId: 'l2', title: 'Other lead' },
    { id: 'd3', parcelId: 'p1', title: 'Parcel match' },
  ]

  it('returns deals for the lead by leadId or parcelId', () => {
    expect(filterDealsForLead(deals, lead).map((d) => d.id).sort()).toEqual(['d1', 'd3'])
  })

  it('returns all deals when lead is missing', () => {
    expect(filterDealsForLead(deals, null)).toEqual(deals)
  })
})
