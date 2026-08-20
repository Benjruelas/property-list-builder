/**
 * Ops API: upload owned MVT tile(s) into R2 (uses deployment R2 env).
 *
 * POST JSON:
 *   { z, x, y, pbfBase64 }
 *   or { tiles: [{ z, x, y, pbfBase64 }, ...] }  // max 100
 *
 * Auth: PARCEL_PIPELINE_SECRET, CRON_SECRET, or temporary bootstrap token.
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { applyCors } from '../_lib/cors.js'
import { isPipelineAuthorized } from '../_lib/parcelPipeline/opsAuth.js'
import { OWNED_TILE_PREFIX } from '../_lib/parcelPipeline/constants.js'

export const config = {
  api: { bodyParser: { sizeLimit: '4.5mb' } },
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

function bucket() {
  return process.env.R2_BUCKET_NAME || 'parcel-tiles'
}

function normalizeTiles(body) {
  if (Array.isArray(body?.tiles)) return body.tiles
  if (body && body.pbfBase64 != null) return [body]
  return []
}

export default async function handler(req, res) {
  applyCors(req, res, { methods: 'POST, OPTIONS' })
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Parcel-Pipeline-Secret, X-Cron-Secret',
  )
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!isPipelineAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' })

  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    return res.status(503).json({ error: 'R2 not configured on this deployment' })
  }

  try {
    const tiles = normalizeTiles(req.body || {})
    if (!tiles.length) return res.status(400).json({ error: 'z/x/y/pbfBase64 or tiles[] required' })
    if (tiles.length > 100) return res.status(400).json({ error: 'max 100 tiles per request' })

    const results = []
    for (const t of tiles) {
      const zi = parseInt(t.z, 10)
      const xi = parseInt(t.x, 10)
      const yi = parseInt(t.y, 10)
      if (![zi, xi, yi].every(Number.isFinite) || t.pbfBase64 == null) {
        return res.status(400).json({ error: 'each tile needs z, x, y, pbfBase64' })
      }
      const body = Buffer.from(String(t.pbfBase64), 'base64')
      if (!body.length) return res.status(400).json({ error: `empty tile ${zi}/${xi}/${yi}` })
      const key = `${OWNED_TILE_PREFIX}/${zi}/${xi}/${yi}.pbf`
      await getS3().send(
        new PutObjectCommand({
          Bucket: bucket(),
          Key: key,
          Body: body,
          ContentType: 'application/x-protobuf',
        }),
      )
      results.push({ key, bytes: body.length })
    }

    return res.status(200).json({ ok: true, count: results.length, results })
  } catch (err) {
    console.error('parcel-pipeline/upload-tile', err)
    return res.status(500).json({ error: err.message || 'Upload failed' })
  }
}
