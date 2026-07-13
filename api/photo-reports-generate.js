import { enforceIpRateLimit } from './lib/rateLimit.js'
import { requireAuth } from './lib/apiAuth.js'
import { getPhotoReportById, updatePhotoReportAtIndex } from './lib/reportStore.js'
import { getLeadWithAccess } from './lib/leadAccess.js'
import { resolveSenderBranding } from './lib/senderBranding.js'
import { buildReportPdfBuffer, reportPdfStorageKey } from './lib/buildReportPdf.js'
import { r2GetBuffer } from './lib/ensureReportPdf.js'
import { presignedPhotosEnabled, createPresignedGetUrl } from './lib/photoPresign.js'
import { REPORT_PDF_VERSION } from './lib/reportPdfMeta.js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

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

  const user = await requireAuth(req, res)
  if (!user) return

  if (await enforceIpRateLimit(req, res, { name: 'photo-reports-generate', limit: 30, windowSec: 3600, user })) return

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
      pdfVersion: REPORT_PDF_VERSION,
      updatedAt: new Date().toISOString(),
    }
    await updatePhotoReportAtIndex(all, index, updated)

    let pdfDownloadUrl = null
    if (presignedPhotosEnabled()) {
      try {
        pdfDownloadUrl = await createPresignedGetUrl(pdfKey, 3600)
      } catch { /* fall back to proxy URL */ }
    }

    return res.status(200).json({
      report: updated,
      pdfKey,
      pdfUrl: `/api/photo-reports?pdfKey=${encodeURIComponent(pdfKey)}`,
      pdfDownloadUrl,
    })
  } catch (err) {
    console.error('photo-reports-generate error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
