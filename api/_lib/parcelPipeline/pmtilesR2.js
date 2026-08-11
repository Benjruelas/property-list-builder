/**
 * Read owned county PMTiles from R2 via HTTP range (GetObject Range).
 * Used by /api/tiles after XYZ owned lookup misses.
 */
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { PMTiles, EtagMismatch } from 'pmtiles'
import {
  OWNED_PMTILES_PREFIX,
  OWNED_PMTILES_MANIFEST_KEY,
} from './constants.js'

const MANIFEST_TTL_MS = Number(process.env.PARCEL_PMTILES_MANIFEST_TTL_MS || 60_000)
const TILE_CACHE_CONTROL = 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600'

let _s3
let _manifest = { at: 0, data: null }
/** @type {Map<string, PMTiles>} */
const archiveCache = new Map()

function getS3() {
  if (_s3) return _s3
  _s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  })
  return _s3
}

function bucket() {
  return process.env.R2_BUCKET_NAME || 'parcel-tiles'
}

class R2RangeSource {
  constructor(key) {
    this.key = key
  }
  getKey() {
    return this.key
  }
  async getBytes(offset, length, signal, etag) {
    const end = offset + length - 1
    try {
      const res = await getS3().send(
        new GetObjectCommand({
          Bucket: bucket(),
          Key: this.key,
          Range: `bytes=${offset}-${end}`,
          ...(etag ? { IfMatch: etag } : {}),
        }),
        signal ? { abortSignal: signal } : undefined,
      )
      const chunks = []
      for await (const chunk of res.Body) chunks.push(chunk)
      const buf = Buffer.concat(chunks)
      return {
        data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
        etag: res.ETag?.startsWith('W/') ? undefined : res.ETag || undefined,
        cacheControl: res.CacheControl || TILE_CACHE_CONTROL,
        expires: res.Expires?.toISOString?.(),
      }
    } catch (e) {
      const code = e.$metadata?.httpStatusCode || e.name
      if (code === 412 || e.name === 'PreconditionFailed') {
        throw new EtagMismatch(`ETag mismatch for ${this.key}`)
      }
      throw e
    }
  }
}

function archiveKey(fips) {
  return `${OWNED_PMTILES_PREFIX}/${String(fips).padStart(5, '0')}.pmtiles`
}

function getArchive(fips) {
  const key = archiveKey(fips)
  let p = archiveCache.get(key)
  if (!p) {
    p = new PMTiles(new R2RangeSource(key))
    archiveCache.set(key, p)
    // Bound memory: drop oldest when large
    if (archiveCache.size > 64) {
      const first = archiveCache.keys().next().value
      archiveCache.delete(first)
    }
  }
  return p
}

async function loadManifest() {
  const now = Date.now()
  if (_manifest.data && now - _manifest.at < MANIFEST_TTL_MS) return _manifest.data
  try {
    const res = await getS3().send(
      new GetObjectCommand({ Bucket: bucket(), Key: OWNED_PMTILES_MANIFEST_KEY }),
    )
    const chunks = []
    for await (const c of res.Body) chunks.push(c)
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    _manifest = { at: now, data }
    return data
  } catch (e) {
    if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) {
      _manifest = { at: now, data: { version: 1, counties: {} } }
      return _manifest.data
    }
    throw e
  }
}

/** Web mercator tile → WGS84 lon/lat bbox. */
export function tileBounds(z, x, y) {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z)
  const s = Math.PI - (2 * Math.PI * (y + 1)) / Math.pow(2, z)
  const west = (x / Math.pow(2, z)) * 360 - 180
  const east = ((x + 1) / Math.pow(2, z)) * 360 - 180
  const north = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
  const south = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(s) - Math.exp(-s)))
  return { west, south, east, north }
}

function overlaps(a, b) {
  return a.west < b.east && a.east > b.west && a.south < b.north && a.north > b.south
}

/**
 * Try owned county PMTiles for this XYZ tile.
 * Returns Buffer | null (null = no owned pmtiles coverage for this tile).
 */
export async function getOwnedPmtilesTile(z, x, y, { signal } = {}) {
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID) return null
  const manifest = await loadManifest()
  const counties = manifest?.counties || {}
  const tb = tileBounds(z, x, y)
  const candidates = []
  for (const [fips, meta] of Object.entries(counties)) {
    const b = meta?.bounds
    if (!b || b.length < 4) continue
    const cb = { west: b[0], south: b[1], east: b[2], north: b[3] }
    if (overlaps(tb, cb)) candidates.push(fips)
  }
  // Prefer denser / later uploads last so edge overlaps can fill; try until hit.
  for (const fips of candidates) {
    try {
      const arch = getArchive(fips)
      const tile = await arch.getZxy(z, x, y, signal)
      if (tile?.data) {
        return Buffer.from(tile.data)
      }
    } catch (e) {
      // Missing archive or range error — try next overlapping county
      if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) continue
      console.error(`[pmtiles] ${fips} zxy ${z}/${x}/${y}:`, e.message)
    }
  }
  return null
}
