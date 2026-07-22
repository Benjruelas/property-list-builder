import { describe, it, expect } from 'vitest'
import {
  buildLeadMapGeoJSON,
  buildLeadParcelColors,
  distinctLeadMapColors,
} from '../leadMapFeatures'
import { DEFAULT_LEAD_STATUSES } from '../leadStatuses'
import { LEAD_STATUS_TOKEN_HEX } from '../leadStatusMapColors'

describe('buildLeadMapGeoJSON', () => {
  it('builds points for leads with valid primary coords', () => {
    const dealCountByLead = new Map([['lead_1', 1]])
    const geo = buildLeadMapGeoJSON(
      [
        { id: 'lead_1', lat: 40.1, lng: -111.6, status: 'new', parcelId: 'p1' },
        { id: 'lead_2', lat: 40.2, lng: -111.7, status: 'contacted', parcelId: 'p2' },
        { id: 'lead_bad', lat: null, lng: -111.7, status: 'new' },
      ],
      { dealCountByLead, leadStatuses: DEFAULT_LEAD_STATUSES },
    )
    expect(geo.features).toHaveLength(2)
    expect(geo.features[0].geometry.coordinates).toEqual([-111.6, 40.1])
    // dealCount > 0 derives converted
    expect(geo.features[0].properties.statusId).toBe('converted')
    expect(geo.features[0].properties.color).toBe(LEAD_STATUS_TOKEN_HEX.green)
    expect(geo.features[1].properties.statusId).toBe('contacted')
    expect(geo.features[1].properties.color).toBe(LEAD_STATUS_TOKEN_HEX.blue)
  })
})

describe('buildLeadParcelColors', () => {
  it('maps parcelId to status hex and skips leads without parcelId', () => {
    const map = buildLeadParcelColors(
      [
        { id: 'a', parcelId: 'p1', status: 'qualified', lat: 1, lng: 2 },
        { id: 'b', status: 'new', lat: 1, lng: 2 },
      ],
      { leadStatuses: DEFAULT_LEAD_STATUSES },
    )
    expect(map.size).toBe(1)
    expect(map.get('p1')).toBe(LEAD_STATUS_TOKEN_HEX.amber)
  })
})

describe('distinctLeadMapColors', () => {
  it('returns unique colors', () => {
    const colors = distinctLeadMapColors({
      type: 'FeatureCollection',
      features: [
        { properties: { color: '#3b82f6' } },
        { properties: { color: '#3b82f6' } },
        { properties: { color: '#22c55e' } },
      ],
    })
    expect(colors.sort()).toEqual(['#22c55e', '#3b82f6'])
  })
})
