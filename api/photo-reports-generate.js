import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { resolveDevBypassUser, isDevBypassAllowed } from './lib/devBypassUsers.js'
import { getPhotoReportById, updatePhotoReportAtIndex } from './lib/reportStore.js'
import { getLeadWithAccess } from './lib/leadAccess.js'
import { resolveSenderBranding } from './lib/senderBranding.js'
import { buildReportPdfBuffer, reportPdfStorageKey } from './lib/buildReportPdf.js'

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

async function r2GetBuffer(key) {
  const r = await s3().send(new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
  }))
  const chunks = []
  for await (const c of r.Body) chunks.push(c)
  return Buffer.concat(chunks)
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
        body: JSON.stringify({ idToken }),
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

export const config = {
  maxDuration: 120,
  memory: 1024,
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const authHeader = req.headers.authorization
  const idToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  const allowDevBypass = isDevBypassAllowed(req)
  let user = allowDevBypass ? resolveDevBypassUser(idToken) : null
  if (!user) user = await verifyFirebaseToken(idToken)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const { reportId } = body
    if (!reportId) return res.status(400).json({ error: 'reportId is required' })

    const { report, index, all } = await getPhotoReportById(reportId)
    if (!report || report.ownerId !== user.uid) {
      return res.status(404).json({ error: 'Report not found' })
    }

    const { lead } = await getLeadWithAccess(user, report.leadId)
    if (!lead) return res.status(404).json({ error: 'Lead not found' })

    const branding = await resolveSenderBranding(user)
    const pdfBuf = await buildReportPdfBuffer({
      report,
      lead,
      branding,
      getImageBuffer: r2GetBuffer,
    })

    const pdfKey = reportPdfStorageKey(user.uid, report.id)
    await s3().send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: pdfKey,
      Body: pdfBuf,
      ContentType: 'application/pdf',
    }))

    const updated = {
      ...report,
      pdfKey,
      updatedAt: new Date().toISOString(),
    }
    await updatePhotoReportAtIndex(all, index, updated)

    return res.status(200).json({
      report: updated,
      pdfKey,
      pdfUrl: `/api/photo-reports?pdfKey=${encodeURIComponent(pdfKey)}`,
    })
  } catch (err) {
    console.error('photo-reports-generate error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
