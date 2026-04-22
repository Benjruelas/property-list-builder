import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { resolveDevBypassUser } from './lib/devBypassUsers.js'

/**
 * Vercel Serverless Function - form PDF upload/download via R2.
 *
 * - POST (auth'd): { templateId, pdfBase64 } → writes to forms/{uid}/{templateId}/original.pdf.
 *   Vercel JSON body cap is ~4.5MB so PDF source should be under ~3MB after base64 overhead.
 *   Returns { key, url } where url is the GET endpoint on this same function.
 * - GET  (auth'd): ?key=forms/{uid}/... → streams the PDF back (owner-scoped by key prefix).
 */

const MAX_PDF_BYTES = 6 * 1024 * 1024 // hard cap before Vercel rejects

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

async function verifyFirebaseToken(idToken) {
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY
  if (!apiKey || !idToken) return null
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      }
    )
    if (!r.ok) return null
    const data = await r.json()
    const user = data.users && data.users[0]
    if (!user) return null
    return { uid: user.localId, email: (user.email || '').toLowerCase() }
  } catch (e) {
    console.error('Token verify error', e.message)
    return null
  }
}

function resolveUser(req) {
  const authHeader = req.headers.authorization
  const idToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  const host = req.headers.host || req.headers['x-forwarded-host'] || ''
  const origin = req.headers.origin || ''
  const isLocalhost = /localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0/.test(host) || /localhost|127\.0\.0\.1|\[::1\]/.test(origin)
  const allowDevBypass = isLocalhost || process.env.ENABLE_DEV_BYPASS === 'true'
  return { idToken, allowDevBypass }
}

function sanitizeId(v) {
  return String(v || '').replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 80)
}

export const config = {
  api: { bodyParser: { sizeLimit: '6mb' } }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { idToken, allowDevBypass } = resolveUser(req)
  let user = allowDevBypass ? resolveDevBypassUser(idToken) : null
  if (!user) user = await verifyFirebaseToken(idToken)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  try {
    if (req.method === 'POST') {
      const { templateId, pdfBase64 } = req.body || {}
      const tid = sanitizeId(templateId)
      if (!tid) return res.status(400).json({ error: 'templateId is required' })
      if (!pdfBase64 || typeof pdfBase64 !== 'string') {
        return res.status(400).json({ error: 'pdfBase64 is required' })
      }
      const cleaned = pdfBase64.replace(/^data:application\/pdf;base64,/, '')
      let buf
      try {
        buf = Buffer.from(cleaned, 'base64')
      } catch (e) {
        return res.status(400).json({ error: 'Invalid base64 PDF' })
      }
      if (!buf.length || buf.length > MAX_PDF_BYTES) {
        return res.status(413).json({ error: `PDF must be between 1 byte and ${MAX_PDF_BYTES} bytes` })
      }
      if (buf.slice(0, 4).toString('utf-8') !== '%PDF') {
        return res.status(400).json({ error: 'File is not a valid PDF' })
      }

      const key = `forms/${user.uid}/${tid}/original.pdf`
      await s3().send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: buf,
        ContentType: 'application/pdf',
      }))

      const url = `/api/forms-upload?key=${encodeURIComponent(key)}`
      return res.status(200).json({ key, url, size: buf.length })
    }

    if (req.method === 'GET') {
      const key = String(req.query.key || '')
      if (!key) return res.status(400).json({ error: 'key is required' })
      if (!key.startsWith(`forms/${user.uid}/`)) {
        return res.status(403).json({ error: 'Forbidden' })
      }
      try {
        const r = await s3().send(new GetObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: key,
        }))
        const chunks = []
        for await (const c of r.Body) chunks.push(c)
        const body = Buffer.concat(chunks)
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Cache-Control', 'private, max-age=300')
        return res.status(200).send(body)
      } catch (e) {
        if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) {
          return res.status(404).json({ error: 'PDF not found' })
        }
        throw e
      }
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('forms-upload error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
