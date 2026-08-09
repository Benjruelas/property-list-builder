import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { enforceIpRateLimit } from './_lib/rateLimit.js'
import {
  OWNED_TILE_PREFIX,
  LEGACY_TILE_PREFIX,
  PARCEL_MIN_ZOOM,
} from './_lib/parcelPipeline/constants.js'

const TTL_MS = 90 * 24 * 60 * 60 * 1000 // 90 days (LandRecords cache only)
const EMPTY_MARKER = Buffer.alloc(0)
const TILE_CACHE_CONTROL = 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600'

/**
 * LandRecords coverage is a sparse pyramid. MapLibre treats HTTP 204 as a successful
 * empty tile and will NOT keep parent tiles — parcels vanish when zooming into a
 * missing level. Status 410 (Gone) marks the tile as errored so MapLibre keeps
 * lower-z parents (maplibre-gl-js#5692).
 *
 * At the source minzoom there is no parent to keep, so return 204 (silent blank)
 * instead of 410 (which would only spam the console).
 */
function sendEmptyTile(res, zi) {
  res.setHeader('Cache-Control', TILE_CACHE_CONTROL)
  if (Number.isFinite(zi) && zi > PARCEL_MIN_ZOOM) {
    return res.status(410).end()
  }
  return res.status(204).end()
}

function ownedOnly() {
  const v = String(process.env.PARCEL_TILES_OWNED_ONLY || '').toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

let _s3
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

async function getFromR2(key, { ignoreTtl = false } = {}) {
  try {
    const res = await getS3().send(new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    }))
    if (!ignoreTtl) {
      const age = Date.now() - (res.LastModified?.getTime() ?? 0)
      if (age > TTL_MS) return null // stale LandRecords cache
    }
    const chunks = []
    for await (const chunk of res.Body) chunks.push(chunk)
    return Buffer.concat(chunks)
  } catch (e) {
    if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) return null
    throw e
  }
}

function putToR2(key, body) {
  return getS3().send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: 'application/x-protobuf',
  }))
}

function sendPbf(res, buf) {
  res.setHeader('Content-Type', 'application/x-protobuf')
  res.setHeader('Cache-Control', TILE_CACHE_CONTROL)
  return res.status(200).send(buf)
}

export default async function handler(req, res) {
  // Map tiles can't carry a bearer token, so throttle abuse per-IP instead.
  if (await enforceIpRateLimit(req, res, { name: 'tiles', limit: 4000, windowSec: 60 })) return

  const { z, x, y } = req.query
  if (!z || !x || !y) {
    return res.status(400).json({ error: 'z, x, y required' })
  }

  const zi = parseInt(z, 10)
  const xi = parseInt(x, 10)
  const yi = parseInt(y, 10)
  const ownedKey = `${OWNED_TILE_PREFIX}/${zi}/${xi}/${yi}.pbf`
  const cacheKey = `${LEGACY_TILE_PREFIX}/${zi}/${xi}/${yi}.pbf`

  // 1. Prefer permanently owned county tiles (no TTL)
  try {
    const owned = await getFromR2(ownedKey, { ignoreTtl: true })
    if (owned !== null) {
      if (owned.length === 0) return sendEmptyTile(res, zi)
      res.setHeader('X-Parcel-Tile-Source', 'owned')
      return sendPbf(res, owned)
    }
  } catch (e) {
    console.error('R2 owned read error:', e.message)
  }

  if (ownedOnly()) {
    return sendEmptyTile(res, zi)
  }

  // 2. LandRecords R2 cache (90d TTL)
  try {
    const cached = await getFromR2(cacheKey)
    if (cached !== null) {
      if (cached.length === 0) {
        return sendEmptyTile(res, zi)
      }
      res.setHeader('X-Parcel-Tile-Source', 'cache')
      return sendPbf(res, cached)
    }
  } catch (e) {
    console.error('R2 read error (falling through to origin):', e.message)
  }

  // 3. Fetch from LandRecords (TMS y-flip: tms_y = 2^z - 1 - y)
  const tmsY = (1 << zi) - 1 - yi
  const url = `${process.env.LANDRECORDS_TILE_URL}/${zi}/${xi}/${tmsY}.pbf`

  let upstream
  try {
    upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.LANDRECORDS_API_KEY}` },
    })
  } catch (e) {
    console.error('LandRecords fetch error:', e.message)
    return res.status(502).json({ error: 'upstream fetch failed' })
  }

  if (upstream.status === 404 || upstream.status === 204) {
    // No parcels at this zoom — cache empty marker so we don't re-fetch
    putToR2(cacheKey, EMPTY_MARKER).catch(() => {})
    return sendEmptyTile(res, zi)
  }

  if (!upstream.ok) {
    return res.status(upstream.status).json({ error: `upstream ${upstream.status}` })
  }

  const buf = Buffer.from(await upstream.arrayBuffer())

  if (buf.length === 0) {
    putToR2(cacheKey, EMPTY_MARKER).catch(() => {})
    return sendEmptyTile(res, zi)
  }

  // 4. Write to R2 cache (fire-and-forget) — never overwrite owned/
  putToR2(cacheKey, buf).catch(e => console.error('R2 write error:', e.message))

  res.setHeader('X-Parcel-Tile-Source', 'landrecords')
  return sendPbf(res, buf)
}
