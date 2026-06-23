import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getAllLeads } from './lib/leadAccess.js'
import { allowedReportPhotoIds } from './lib/publicReportPayload.js'
import { loadReportContext } from './lib/publicReportAccess.js'

let _s3
function s3() {
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const token = String(req.query.token || '').trim()
    const photoId = String(req.query.photoId || '').trim()
    const variant = String(req.query.variant || 'full').trim()

    if (!token) return res.status(400).json({ error: 'token is required' })
    if (!photoId) return res.status(400).json({ error: 'photoId is required' })

    const ctx = await loadReportContext(token)
    if (ctx.error) return res.status(ctx.status || 404).json({ error: ctx.error })

    const { report } = ctx

    const allowed = allowedReportPhotoIds(report)
    if (!allowed.has(photoId)) {
      return res.status(403).json({ error: 'Photo not in this report' })
    }

    const allLeads = await getAllLeads()
    const lead = allLeads.find((l) => l.id === report.leadId)
    const photo = (lead?.photos || []).find((p) => p.id === photoId)
    if (!photo) return res.status(404).json({ error: 'Photo not found' })

    const imgKey =
      variant === 'thumb'
        ? photo.thumbnailKey || photo.annotatedKey || photo.key
        : photo.annotatedKey || photo.key

    if (!imgKey) return res.status(404).json({ error: 'Photo file not found' })

    const r = await s3().send(new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: imgKey,
    }))
    const chunks = []
    for await (const c of r.Body) chunks.push(c)
    const body = Buffer.concat(chunks)

    res.setHeader('Content-Type', r.ContentType || 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    return res.status(200).send(body)
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      return res.status(404).json({ error: 'Photo file not found' })
    }
    console.error('public-report-photo error', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
