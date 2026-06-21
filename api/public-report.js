import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { findReportInviteByToken } from './lib/reportInvites.js'
import { getPhotoReportById, getAllPhotoReports, updatePhotoReportAtIndex } from './lib/reportStore.js'
import { parseReportPreviewToken } from './lib/previewToken.js'
import { getAllLeads } from './lib/leadAccess.js'
import { publicReportPayload, recordReportView } from './lib/publicReportPayload.js'
import { resolveSenderBranding } from './lib/senderBranding.js'
import { buildReportPdfBuffer, reportPdfStorageKey, safePdfFilename } from './lib/buildReportPdf.js'

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

async function loadReportContext(token) {
  const normalized = String(token || '').trim()
  const { invite, error } = await findReportInviteByToken(normalized)

  if (error && error !== 'not_found') {
    if (error === 'revoked' || error === 'expired') {
      return { error: 'This report link has expired', status: 410 }
    }
  }

  if (!error && invite) {
    const { report, index, all } = await getPhotoReportById(invite.reportId)
    if (!report) return { error: 'Report not found', status: 404 }
    return { invite, report, index, all, error: null }
  }

  const signedReportId = parseReportPreviewToken(normalized)
  if (signedReportId) {
    const { report, index, all } = await getPhotoReportById(signedReportId)
    if (!report) return { error: 'Report not found', status: 404 }
    const previewInvite = {
      token: normalized,
      reportId: report.id,
      preview: true,
      recipientEmail: '',
      message: '',
      status: 'pending',
    }
    return { invite: previewInvite, report, index, all, error: null }
  }

  const all = await getAllPhotoReports()
  const index = all.findIndex((r) => r.previewToken === normalized)
  if (index === -1) return { error: 'Report link not found', status: 404 }

  const report = all[index]
  const previewInvite = {
    token: normalized,
    reportId: report.id,
    preview: true,
    recipientEmail: '',
    message: '',
    status: 'pending',
  }
  return { invite: previewInvite, report, index, all, error: null }
}

async function ensureReportPdf(report, index, all, lead) {
  if (report.pdfKey) {
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
    updatedAt: new Date().toISOString(),
  }
  await updatePhotoReportAtIndex(all, index, updated)

  return pdfBuf
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const token = String(req.query.token || '').trim()
    if (!token) return res.status(400).json({ error: 'token is required' })

    const ctx = await loadReportContext(token)
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error })

    const { invite, report, index, all } = ctx

    const download = req.query.download === '1'
    if (download) {
      if (invite.preview) {
        return res.status(403).json({ error: 'PDF download is disabled for preview links' })
      }

      const allLeads = await getAllLeads()
      const lead = allLeads.find((l) => l.id === report.leadId)
      if (!lead) return res.status(404).json({ error: 'Lead not found' })

      const pdfBuf = await ensureReportPdf(report, index, all, lead)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="${safePdfFilename(report.title)}"`)
      return res.status(200).send(pdfBuf)
    }

    const allLeads = await getAllLeads()
    const lead = allLeads.find((l) => l.id === report.leadId)

    const updatedReport = invite.preview
      ? report
      : await recordReportView(report, index, all, updatePhotoReportAtIndex)
    const payload = await publicReportPayload(updatedReport, invite, lead, token)

    return res.status(200).json(payload)
  } catch (err) {
    console.error('public-report error', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export const config = {
  maxDuration: 120,
  memory: 1024,
}
