import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { updatePhotoReportAtIndex } from './reportStore.js'
import { resolveSenderBranding } from './senderBranding.js'
import { buildReportPdfBuffer, reportPdfStorageKey } from './buildReportPdf.js'
import { REPORT_PDF_VERSION, isReportPdfStale } from './reportPdfMeta.js'

export { REPORT_PDF_VERSION, isReportPdfStale, reportPdfContentChanged } from './reportPdfMeta.js'

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

export async function r2GetBuffer(key) {
  const r = await s3().send(new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
  }))
  const chunks = []
  for await (const c of r.Body) chunks.push(c)
  return Buffer.concat(chunks)
}

/**
 * Return a cached report PDF when present and current; otherwise build, upload, and persist pdfKey.
 */
export async function ensureReportPdf(report, index, all, lead, { message = '' } = {}) {
  if (!isReportPdfStale(report)) {
    try {
      return await r2GetBuffer(report.pdfKey)
    } catch {
      /* regenerate below */
    }
  }

  const branding = await resolveSenderBranding({
    uid: report.ownerId,
    email: report.ownerEmail || '',
  })

  const pdfBuf = await buildReportPdfBuffer({
    report,
    lead,
    branding,
    message,
    getImageBuffer: r2GetBuffer,
  })

  const pdfKey = reportPdfStorageKey(report.ownerId, report.id)
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

  return pdfBuf
}
