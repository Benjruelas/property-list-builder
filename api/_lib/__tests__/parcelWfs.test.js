import { describe, it, expect } from 'vitest'
import { escapeWfsLiteral, wfsGetFeatureByLridXml, parseGeoJsonFeatureProperties } from '../parcelWfs.js'

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
