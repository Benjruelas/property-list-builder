import { describe, it, expect, beforeEach } from 'vitest'
import { extractHouseNumber, buildLabelGeoJSON, labelLridsMissingOccupancy } from '../parcelLabels'
import { rememberOccupancyMap, occupancyCacheSnapshot, clearOccupancyCache } from '../fetchParcelOccupancy'

describe('extractHouseNumber', () => {
  it('returns the leading house number and skips zeros', () => {
    expect(extractHouseNumber('100 W ABRAM ST')).toBe('100')
    expect(extractHouseNumber('0 MAIN ST')).toBe('')
    expect(extractHouseNumber('')).toBe('')
  })
})

describe('buildLabelGeoJSON', () => {
  const feature = {
    properties: {
      lrid: 'abc-1',
      parceladdr: '123 MAIN ST',
      centroidx: -97.1,
      centroidy: 32.73,
    },
  }

  beforeEach(() => {
    clearOccupancyCache()
  })

  it('emits a house number without an OO icon when mailing is missing', () => {
    const geo = buildLabelGeoJSON([feature])
    expect(geo.features[0].properties).toMatchObject({ _label: '123', _oo: -1, _lrid: 'abc-1' })
  })

  it('sets a green OO icon when WFS mailing matches situs', () => {
    const occ = new Map([['abc-1', { owneraddr: '123 MAIN ST', homestead_exemption: '' }]])
    const geo = buildLabelGeoJSON([feature], occ)
    expect(geo.features[0].properties._oo).toBe(1)
  })

  it('sets a yellow absentee icon when mailing does not match', () => {
    const occ = new Map([['abc-1', { owneraddr: 'PO BOX 99', homestead_exemption: '' }]])
    const geo = buildLabelGeoJSON([feature], occ)
    expect(geo.features[0].properties._oo).toBe(0)
  })

  it('lists lrids that still need a WFS occupancy fetch', () => {
    const geo = buildLabelGeoJSON([feature])
    expect(labelLridsMissingOccupancy(geo, new Map())).toEqual(['abc-1'])
    rememberOccupancyMap({ 'abc-1': { owneraddr: '123 MAIN ST' } })
    expect(labelLridsMissingOccupancy(geo, occupancyCacheSnapshot())).toEqual([])
  })
})
