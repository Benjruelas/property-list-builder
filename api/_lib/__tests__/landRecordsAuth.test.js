import { describe, it, expect } from 'vitest'
import {
  LANDRECORDS_USER_AGENT,
  LANDRECORDS_ADVERTISED_VECTOR_BASE,
  landRecordsAuthHeaders,
  isTmsTileBase,
  originParcelTileUrls,
} from '../landRecordsAuth.js'

describe('landRecordsAuthHeaders', () => {
  it('does not send User-Agent node (Cloudflare Bot Fight 403s that)', () => {
    const headers = landRecordsAuthHeaders('test-key')
    expect(headers.Authorization).toBe('Bearer test-key')
    expect(headers['User-Agent']).toBe(LANDRECORDS_USER_AGENT)
    expect(headers['User-Agent'].toLowerCase()).not.toBe('node')
    expect(headers['User-Agent'].toLowerCase()).not.toContain('undici')
  })
})

describe('originParcelTileUrls', () => {
  const tmsBase = 'https://api.landrecords.us/pro/gwc/service/tms/1.0.0/pro:parcel_us@EPSG:3857x2@pbf'
  // Arlington z15 XYZ
  const z = 15
  const x = 7545
  const y = 13227
  const tmsY = (1 << z) - 1 - y // 19540

  it('detects GeoWebCache TMS bases', () => {
    expect(isTmsTileBase(tmsBase)).toBe(true)
    expect(isTmsTileBase(LANDRECORDS_ADVERTISED_VECTOR_BASE)).toBe(false)
  })

  it('flips Y for TMS and falls back to the advertised XYZ path', () => {
    expect(originParcelTileUrls(z, x, y, tmsBase)).toEqual([
      `${tmsBase}/${z}/${x}/${tmsY}.pbf`,
      `${LANDRECORDS_ADVERTISED_VECTOR_BASE}/${z}/${x}/${y}.pbf`,
    ])
  })

  it('does not flip Y for the advertised XYZ gateway', () => {
    expect(originParcelTileUrls(z, x, y, LANDRECORDS_ADVERTISED_VECTOR_BASE)).toEqual([
      `${LANDRECORDS_ADVERTISED_VECTOR_BASE}/${z}/${x}/${y}.pbf`,
    ])
  })
})
