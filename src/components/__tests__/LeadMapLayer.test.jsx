/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { LeadMapLayer } from '../LeadMapLayer'

const layerProps = []

vi.mock('react-map-gl/maplibre', () => ({
  Source: ({ children, id, data }) => (
    <div data-testid="leads-source" data-source-id={id} data-feature-count={data?.features?.length ?? 0}>
      {children}
    </div>
  ),
  Layer: (props) => {
    layerProps.push(props)
    return <div data-testid={`layer-${props.id}`} data-visibility={props.layout?.visibility} />
  },
}))

vi.mock('@/utils/leadMapFeatures', () => ({
  buildLeadMapGeoJSON: (leads) => ({
    type: 'FeatureCollection',
    features: (leads || [])
      .filter((l) => l.lat != null && l.lng != null)
      .map((l) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [l.lng, l.lat] },
        properties: { leadId: l.id, color: '#112233', weight: 1, statusId: 'new', parcelId: '' },
      })),
  }),
  distinctLeadMapColors: (geojson) => [
    ...new Set((geojson?.features || []).map((f) => f.properties.color).filter(Boolean)),
  ],
}))

vi.mock('@/utils/leadStatusMapColors', () => ({
  hexToRgba: (hex, a) => hex,
}))

describe('LeadMapLayer', () => {
  beforeEach(() => {
    layerProps.length = 0
  })

  const leads = [{ id: 'lead_1', lat: 32.8, lng: -96.8, status: 'new' }]

  it('stays mounted with visibility none when hidden for hail storm', () => {
    const { getByTestId, rerender } = render(
      <LeadMapLayer mapRef={{ current: null }} mapReady leads={leads} visible />,
    )
    expect(getByTestId('leads-source')).toBeTruthy()
    expect(layerProps.some((p) => p.layout?.visibility === 'visible')).toBe(true)

    layerProps.length = 0
    rerender(
      <LeadMapLayer mapRef={{ current: null }} mapReady leads={leads} visible={false} />,
    )
    expect(getByTestId('leads-source')).toBeTruthy()
    expect(layerProps.every((p) => p.layout?.visibility === 'none')).toBe(true)
    expect(layerProps.length).toBeGreaterThan(0)
  })
})
