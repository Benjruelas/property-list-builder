import { describe, it, expect } from 'vitest'
import {
  centroidFromGeometry,
  centroidFromProperties,
  neCornerFromGeometry,
  resolveOwnerOccupiedAnchor,
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

  it('computes inward NE corner from a rectangle polygon', () => {
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
    const ne = neCornerFromGeometry(geometry, 0.1)
    // Raw NE is (-96.799, 32.781); 10% inward → -96.7991, 32.7809
    expect(ne.lng).toBeCloseTo(-96.7991, 5)
    expect(ne.lat).toBeCloseTo(32.7809, 5)
  })

  it('computes NE corner across a multipolygon bbox', () => {
    const geometry = {
      type: 'MultiPolygon',
      coordinates: [
        [[[-97, 32], [-96.9, 32], [-96.9, 32.1], [-97, 32.1], [-97, 32]]],
        [[[-96.85, 32.2], [-96.8, 32.2], [-96.8, 32.25], [-96.85, 32.25], [-96.85, 32.2]]],
      ],
    }
    const ne = neCornerFromGeometry(geometry, 0.1)
    // Overall bbox: lng [-97, -96.8], lat [32, 32.25]
    expect(ne.lng).toBeCloseTo(-96.82, 5)
    expect(ne.lat).toBeCloseTo(32.225, 5)
  })

  it('returns null for empty or invalid geometry', () => {
    expect(neCornerFromGeometry(null)).toBeNull()
    expect(neCornerFromGeometry({})).toBeNull()
    expect(neCornerFromGeometry({ type: 'Polygon', coordinates: [] })).toBeNull()
  })

  it('resolves owner-occupied anchor from geometry then centroid fallback', () => {
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
    const fromGeom = resolveOwnerOccupiedAnchor(geometry, { centroidx: -100, centroidy: 40 })
    expect(fromGeom.lng).toBeCloseTo(-96.7991, 5)
    expect(fromGeom.lat).toBeCloseTo(32.7809, 5)

    const fromCentroid = resolveOwnerOccupiedAnchor(null, { centroidx: -96.7, centroidy: 32.5 })
    expect(fromCentroid.lng).toBeGreaterThan(-96.7)
    expect(fromCentroid.lat).toBeGreaterThan(32.5)

    expect(resolveOwnerOccupiedAnchor(null, {})).toBeNull()
  })
})
