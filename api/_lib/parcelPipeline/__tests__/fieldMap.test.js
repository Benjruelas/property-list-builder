import { describe, it, expect } from 'vitest'
import {
  normalizeParcelProperties,
  normalizeFeatureCollection,
  candidatesFor,
} from '../fieldMap.js'

describe('parcelPipeline fieldMap', () => {
  it('maps common county fields onto LandRecords-like keys', () => {
    const out = normalizeParcelProperties(
      {
        APN: '123-456',
        SITUS_ADDRESS: '100 Main St',
        OWNER_NAME: 'Jane Doe',
        TOT_VAL: '250000',
        ACRES: '0.25',
      },
      { countyname: 'Tarrant', geoid: '48439', state: 'TX' },
    )
    expect(out.parcelid).toBe('123-456')
    expect(out.lrid).toBe('123-456')
    expect(out.parceladdr).toBe('100 Main St')
    expect(out.ownername).toBe('Jane Doe')
    expect(out.totalvalue).toBe(250000)
    expect(out.taxacres).toBe(0.25)
    expect(out.countyname).toBe('Tarrant')
    expect(out.geoid).toBe('48439')
    expect(out.parcelstate).toBe('TX')
  })

  it('respects explicit fieldMap overrides', () => {
    const out = normalizeParcelProperties(
      { FOLIO: 'A1', TRUE_OWNER1: 'Owner', OTHER: 'x' },
      {
        fieldMap: {
          parcelid: ['FOLIO'],
          lrid: ['FOLIO'],
          ownername: ['TRUE_OWNER1'],
        },
        geoid: '12086',
      },
    )
    expect(out.parcelid).toBe('A1')
    expect(out.ownername).toBe('Owner')
  })

  it('drops features without parcel ids from FeatureCollection', () => {
    const fc = normalizeFeatureCollection({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
          properties: { PIN: '1' },
        },
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
          properties: { note: 'no id' },
        },
      ],
    })
    expect(fc.features).toHaveLength(1)
    expect(fc.features[0].properties.parcelid).toBe('1')
  })

  it('candidatesFor merges map + defaults', () => {
    const c = candidatesFor({ parcelid: ['CUSTOM'] }, 'parcelid')
    expect(c[0]).toBe('CUSTOM')
    expect(c).toContain('APN')
  })
})
