import { describe, it, expect } from 'vitest'
import {
  parcelIdsMatch,
  pickParcelFeature,
  propertiesMatchRequestedLrid,
} from '../parcelLookup.js'

const house = {
  properties: { lrid: 'aaa-1', ownername: 'JANE DOE' },
  geometry: { type: 'Polygon', coordinates: [[[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]]] },
}
const school = {
  properties: { lrid: 'bbb-2', ownername: 'CEDAR HILL I S D' },
  geometry: { type: 'Polygon', coordinates: [[[0, 0], [0.05, 0], [0.05, 0.05], [0, 0.05], [0, 0]]] },
}

describe('pickParcelFeature', () => {
  it('refuses overlapping WMS hits that do not match the clicked tile lrid', () => {
    expect(pickParcelFeature([school, house], 'aaa-1')?.properties.ownername).toBe('JANE DOE')
    expect(pickParcelFeature([school, house], 'missing-id')).toBeNull()
  })

  it('picks the smallest parcel when no lrid is known', () => {
    expect(pickParcelFeature([school, house])?.properties.lrid).toBe('aaa-1')
  })
})

describe('propertiesMatchRequestedLrid', () => {
  it('matches case-insensitively and rejects a different record', () => {
    expect(parcelIdsMatch('AAA-1', 'aaa-1')).toBe(true)
    expect(propertiesMatchRequestedLrid({ lrid: 'aaa-1' }, 'AAA-1')).toBe(true)
    expect(propertiesMatchRequestedLrid({ lrid: 'bbb-2' }, 'aaa-1')).toBe(false)
    expect(propertiesMatchRequestedLrid(null, 'aaa-1')).toBe(false)
    expect(propertiesMatchRequestedLrid({ lrid: 'aaa-1' }, '')).toBe(true)
  })
})
