import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { findReportInviteByToken } from './lib/reportInvites.js'
import { getPhotoReportById } from './lib/reportStore.js'
import { getAllLeads } from './lib/leadAccess.js'

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

function leadDisplayName(lead) {
  const parts = [lead?.firstName, lead?.lastName].filter(Boolean)
  if (parts.length) return parts.join(' ')
  return (lead?.address || 'Property').trim()
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

    const { invite, error } = await findReportInviteByToken(token)
    if (error === 'not_found') return res.status(404).json({ error: 'Report link not found' })
    if (error === 'revoked' || error === 'expired') {
      return res.status(410).json({ error: 'This report link has expired' })
    }

    const { report } = await getPhotoReportById(invite.reportId)
    if (!report) return res.status(404).json({ error: 'Report not found' })

    const download = req.query.download === '1'
    if (download && report.pdfKey) {
      const r = await s3().send(new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: report.pdfKey,
      }))
      const chunks = []
      for await (const c of r.Body) chunks.push(c)
      const body = Buffer.concat(chunks)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="${(report.title || 'report').replace(/"/g, '')}.pdf"`)
      return res.status(200).send(body)
    }

    const allLeads = await getAllLeads()
    const lead = allLeads.find((l) => l.id === report.leadId)

    return res.status(200).json({
      report: {
        id: report.id,
        title: report.title,
        sections: report.sections,
        status: report.status,
        sentAt: report.sentAt,
        hasPdf: !!report.pdfKey,
      },
      lead: lead
        ? { name: leadDisplayName(lead), address: lead.address || '' }
        : { name: 'Property', address: '' },
      pdfDownloadUrl: report.pdfKey
        ? `/api/public-report?token=${encodeURIComponent(token)}&download=1`
        : null,
    })
  } catch (err) {
    console.error('public-report error', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
