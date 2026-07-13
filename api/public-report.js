import { updatePhotoReportAtIndex } from './lib/reportStore.js'
import { getLeadByIdIndexed } from './lib/leadLookup.js'
import { publicReportPayload, recordReportView } from './lib/publicReportPayload.js'
import { loadReportContext } from './lib/publicReportAccess.js'
import { ensureReportPdf } from './lib/ensureReportPdf.js'
import { safePdfFilename } from './lib/buildReportPdf.js'
import { enforceIpRateLimit } from './lib/rateLimit.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  if (await enforceIpRateLimit(req, res, { name: 'public-report', limit: 120, windowSec: 60 })) return

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

      const lead = await getLeadByIdIndexed(report.leadId)
      if (!lead) return res.status(404).json({ error: 'Lead not found' })

      const pdfBuf = await ensureReportPdf(report, index, all, lead, {
        message: invite.message || '',
      })
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="${safePdfFilename(report.title)}"`)
      // Cached PDFs are cheap; allow short private caching on the client.
      res.setHeader('Cache-Control', 'private, max-age=60')
      return res.status(200).send(pdfBuf)
    }

    const lead = await getLeadByIdIndexed(report.leadId)

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
