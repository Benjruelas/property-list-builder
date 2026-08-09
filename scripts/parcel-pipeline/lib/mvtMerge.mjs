import { createRequire } from 'module'
import { PARCEL_SOURCE_LAYER } from '../../../api/_lib/parcelPipeline/constants.js'

const require = createRequire(import.meta.url)
const Pbf = require('pbf')
const { VectorTile } = require('@mapbox/vector-tile')
const vtpbf = require('vt-pbf')
const geojsonvt = require('geojson-vt').default || require('geojson-vt')

/**
 * Merge two MVT buffers for the same XYZ tile.
 * Incoming features win on duplicate parcel id; otherwise both are kept.
 */
export function mergeOwnedTile(
  existingBuf,
  incomingBuf,
  z,
  x,
  y,
  layerName = PARCEL_SOURCE_LAYER,
) {
  if (!existingBuf?.length) return incomingBuf
  if (!incomingBuf?.length) return existingBuf

  const existingTile = new VectorTile(new Pbf(existingBuf))
  const incomingTile = new VectorTile(new Pbf(incomingBuf))
  const byId = new Map()

  for (const tile of [existingTile, incomingTile]) {
    const layer = tile.layers[layerName]
    if (!layer) continue
    for (let i = 0; i < layer.length; i++) {
      const gj = layer.feature(i).toGeoJSON(x, y, z)
      const id = String(gj.properties?.lrid || gj.properties?.parcelid || `${byId.size}`)
      byId.set(id, gj)
    }
  }

  const fc = { type: 'FeatureCollection', features: [...byId.values()] }
  const index = geojsonvt(fc, {
    maxZoom: z,
    indexMaxZoom: z,
    tolerance: 0,
    buffer: 64,
    extent: 4096,
  })
  const tile = index.getTile(z, x, y)
  if (!tile) return incomingBuf
  return Buffer.from(vtpbf.fromGeojsonVt({ [layerName]: tile }, { version: 2 }))
}
