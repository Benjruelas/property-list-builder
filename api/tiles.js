import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'

const TTL_MS = 90 * 24 * 60 * 60 * 1000 // 90 days
const EMPTY_MARKER = Buffer.alloc(0)

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

async function getFromR2(key) {
  try {
    const res = await getS3().send(new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    }))
    const age = Date.now() - (res.LastModified?.getTime() ?? 0)
    if (age > TTL_MS) return null // stale
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

export default async function handler(req, res) {
  const { z, x, y } = req.query
  if (!z || !x || !y) {
    return res.status(400).json({ error: 'z, x, y required' })
  }

  const zi = parseInt(z, 10)
  const xi = parseInt(x, 10)
  const yi = parseInt(y, 10)
  const r2Key = `tiles/${zi}/${xi}/${yi}.pbf`

  // 1. Check R2 cache
  try {
    const cached = await getFromR2(r2Key)
    if (cached !== null) {
      if (cached.length === 0) {
        // Empty marker — no parcels for this tile
        res.setHeader('Cache-Control', 'public, max-age=86400')
        return res.status(204).end()
      }
      res.setHeader('Content-Type', 'application/x-protobuf')
      res.setHeader('Cache-Control', 'public, max-age=86400')
      return res.status(200).send(cached)
    }
  } catch (e) {
    console.error('R2 read error (falling through to origin):', e.message)
  }

  // 2. Fetch from LandRecords (TMS y-flip: tms_y = 2^z - 1 - y)
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
    // No parcels — cache empty marker so we don't re-fetch
    putToR2(r2Key, EMPTY_MARKER).catch(() => {})
    res.setHeader('Cache-Control', 'public, max-age=86400')
    return res.status(204).end()
  }

  if (!upstream.ok) {
    return res.status(upstream.status).json({ error: `upstream ${upstream.status}` })
  }

  const buf = Buffer.from(await upstream.arrayBuffer())

  if (buf.length === 0) {
    putToR2(r2Key, EMPTY_MARKER).catch(() => {})
    res.setHeader('Cache-Control', 'public, max-age=86400')
    return res.status(204).end()
  }

  // 3. Write to R2 (fire-and-forget)
  putToR2(r2Key, buf).catch(e => console.error('R2 write error:', e.message))

  // 4. Return tile
  res.setHeader('Content-Type', 'application/x-protobuf')
  res.setHeader('Cache-Control', 'public, max-age=86400')
  return res.status(200).send(buf)
}
