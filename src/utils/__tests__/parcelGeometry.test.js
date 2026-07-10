import { describe, it, expect } from 'vitest'
import {
  centroidFromGeometry,
  centroidFromProperties,
  resolveParcelCenter,
} from '../parcelGeometry.js'

describe('parcelGeometry', () => {
  it('computes centroid from polygon geometry', () => {
    const geometry = {
      type: 'Polygon',
      coordinates: [[
        [-96.8, 32.78],
        [-96.799, 32.78],
        [-96.799, 32.781],
        [-96.8, 32.781],
        [-96.8, 32.78],
      ]],
    }
    const c = centroidFromGeometry(geometry)
    expect(c.lat).toBeCloseTo(32.7805, 4)
    expect(c.lng).toBeCloseTo(-96.7995, 4)
  })

  it('reads centroid from tile properties', () => {
    expect(centroidFromProperties({ centroidy: 32.5, centroidx: -96.7 })).toEqual({
      lat: 32.5,
      lng: -96.7,
    })
    expect(centroidFromProperties({ LATITUDE: 33, LONGITUDE: -97 })).toEqual({
      lat: 33,
      lng: -97,
    })
  })

  it('prefers geometry over properties and fallback', () => {
    const center = resolveParcelCenter({
      geometry: {
        type: 'Polygon',
        coordinates: [[[-96.8, 32.78], [-96.799, 32.78], [-96.799, 32.781], [-96.8, 32.781], [-96.8, 32.78]]],
      },
      properties: { centroidy: 40, centroidx: -100 },
      latlng: { lat: 30, lng: -90 },
    })
    expect(center.lat).toBeCloseTo(32.7805, 4)
  })

  it('falls back to latlng when no geometry or properties', () => {
    expect(resolveParcelCenter({ latlng: { lat: 32.1, lng: -96.2 } })).toEqual({
      lat: 32.1,
      lng: -96.2,
    })
  })

  it('returns null for missing or invalid parcel input', () => {
    expect(resolveParcelCenter(null)).toBeNull()
    expect(resolveParcelCenter(undefined)).toBeNull()
    expect(resolveParcelCenter('bad')).toBeNull()
  })
})
