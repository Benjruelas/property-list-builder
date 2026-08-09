import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
import { mergeOwnedTile } from '../../../../scripts/parcel-pipeline/lib/mvtMerge.mjs'

const require = createRequire(import.meta.url)
const vtpbf = require('vt-pbf')
const geojsonvt = require('geojson-vt').default || require('geojson-vt')

function makeTileBuf(features, z, x, y, layer = 'parcel_us') {
  const fc = { type: 'FeatureCollection', features }
  const index = geojsonvt(fc, { maxZoom: z, indexMaxZoom: z, tolerance: 0, extent: 4096 })
  const tile = index.getTile(z, x, y)
  expect(tile).toBeTruthy()
  return Buffer.from(vtpbf.fromGeojsonVt({ [layer]: tile }, { version: 2 }))
}

describe('mergeOwnedTile', () => {
  it('keeps features from both counties and prefers incoming on id clash', () => {
    const z = 15
    const x = 0
    const y = 0
    // Use a polygon covering the whole world so z0 tile 0/0/0 always hits;
    // for z15 we need coords in that tile. Simpler: use z=0 x=0 y=0.
    const zz = 0
    const xx = 0
    const yy = 0
    const poly = {
      type: 'Polygon',
      coordinates: [
        [
          [-10, -10],
          [10, -10],
          [10, 10],
          [-10, 10],
          [-10, -10],
        ],
      ],
    }
    const a = makeTileBuf(
      [{ type: 'Feature', geometry: poly, properties: { parcelid: 'A', lrid: 'A', ownername: 'Old' } }],
      zz,
      xx,
      yy,
    )
    const b = makeTileBuf(
      [
        { type: 'Feature', geometry: poly, properties: { parcelid: 'A', lrid: 'A', ownername: 'New' } },
        { type: 'Feature', geometry: poly, properties: { parcelid: 'B', lrid: 'B', ownername: 'Other' } },
      ],
      zz,
      xx,
      yy,
    )
    const merged = mergeOwnedTile(a, b, zz, xx, yy)
    expect(merged.length).toBeGreaterThan(0)

    const Pbf = require('pbf')
    const { VectorTile } = require('@mapbox/vector-tile')
    const tile = new VectorTile(new Pbf(merged))
    const layer = tile.layers.parcel_us
    expect(layer.length).toBe(2)
    const owners = new Set()
    for (let i = 0; i < layer.length; i++) {
      owners.add(layer.feature(i).properties.ownername)
    }
    expect(owners.has('New')).toBe(true)
    expect(owners.has('Other')).toBe(true)
    expect(owners.has('Old')).toBe(false)
  })
})
