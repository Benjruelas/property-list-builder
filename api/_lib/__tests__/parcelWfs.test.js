import { describe, it, expect } from 'vitest'
import {
  escapeWfsLiteral,
  wfsGetFeatureByLridXml,
  wfsGetFeatureByBboxXml,
  parseGeoJsonFeatureProperties,
  occupancyFromWfsProperties,
  occupancyMapFromWfsFeatures,
} from '../parcelWfs.js'

describe('wfsGetFeatureByLridXml', () => {
  it('puts lrid in the Filter body, not a CQL query string', () => {
    const xml = wfsGetFeatureByLridXml("a5e1883d-3bd6-61a2-f955-7dbb9b40c209")
    expect(xml).toContain('<fes:ValueReference>lrid</fes:ValueReference>')
    expect(xml).toContain('<fes:Literal>a5e1883d-3bd6-61a2-f955-7dbb9b40c209</fes:Literal>')
    expect(xml).not.toContain('cql_filter')
  })

  it('escapes XML metacharacters in the id', () => {
    expect(escapeWfsLiteral(`a<b&c>'"`)).toBe('a&lt;b&amp;c&gt;&apos;&quot;')
  })
})

describe('parseGeoJsonFeatureProperties', () => {
  it('reads the first feature properties', () => {
    expect(parseGeoJsonFeatureProperties({
      features: [{ properties: { ownername: 'JANE DOE', lrid: 'abc' } }],
    })).toEqual({ ownername: 'JANE DOE', lrid: 'abc' })
  })

  it('ignores gateway error payloads', () => {
    expect(parseGeoJsonFeatureProperties({ error: 'Missing authorization' })).toBeNull()
    expect(parseGeoJsonFeatureProperties({ features: [] })).toBeNull()
  })
})

describe('viewport occupancy WFS', () => {
  it('POSTs a BBOX filter with lat-lon GML corners', () => {
    const xml = wfsGetFeatureByBboxXml({ south: 32.73, west: -97.11, north: 32.74, east: -97.10, count: 200 })
    expect(xml).toContain('<fes:BBOX>')
    expect(xml).toContain('32.73 -97.11')
    expect(xml).toContain('32.74 -97.1')
    expect(xml).not.toContain('cql_filter')
  })

  it('compacts WFS properties to mailing/homestead keyed by lrid', () => {
    expect(occupancyFromWfsProperties({
      lrid: 'abc',
      owneraddr: '100 W ABRAM ST',
      homestead_exemption: 'Y',
      ownername: 'CITY',
    })).toEqual({
      lrid: 'abc',
      owneraddr: '100 W ABRAM ST',
      homestead_exemption: 'Y',
    })
    expect(occupancyMapFromWfsFeatures([
      { properties: { lrid: 'abc', owneraddr: '1 MAIN' } },
    ])).toEqual({ abc: { owneraddr: '1 MAIN', homestead_exemption: '' } })
  })
})
