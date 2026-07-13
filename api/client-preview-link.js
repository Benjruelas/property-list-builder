import { requireAuth } from './_lib/apiAuth.js'
import { getQuoteById } from './_lib/quoteStore.js'
import { getPhotoReportById } from './_lib/reportStore.js'
import { getLeadWithAccess } from './_lib/leadAccess.js'
import { mintQuotePreviewToken, mintReportPreviewToken } from './_lib/previewToken.js'
import { buildQuotePublicUrl, buildReportPublicUrl } from './_lib/publicLinks.js'

function resolveOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host || ''
  if (host) return `${proto}://${host}`
  return req.headers.origin || 'https://localhost'
}

async function getOrCreateQuotePreviewUrl(user, quoteId, origin) {
  const { quote } = await getQuoteById(quoteId)
  if (!quote || quote.ownerId !== user.uid) {
    return { error: 'Quote not found', status: 404 }
  }

  const token = mintQuotePreviewToken(quote.id)
  return {
    publicUrl: buildQuotePublicUrl(origin, token),
  }
}

async function getOrCreateReportPreviewUrl(user, reportId, origin) {
  const { report } = await getPhotoReportById(reportId)
  if (!report) {
    return { error: 'Report not found', status: 404 }
  }
  if (report.ownerId !== user.uid) {
    const { lead } = await getLeadWithAccess(user, report.leadId)
    if (!lead) return { error: 'Report not found', status: 404 }
  }

  const token = mintReportPreviewToken(report.id)
  return {
    publicUrl: buildReportPublicUrl(origin, token),
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const user = await requireAuth(req, res)
  if (!user) return

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const type = String(body.type || '').trim()
    const id = String(body.id || '').trim()
    if (!type || !id) return res.status(400).json({ error: 'type and id are required' })

    const origin = resolveOrigin(req)
    let result
    if (type === 'quote') {
      result = await getOrCreateQuotePreviewUrl(user, id, origin)
    } else if (type === 'report') {
      result = await getOrCreateReportPreviewUrl(user, id, origin)
    } else {
      return res.status(400).json({ error: 'type must be quote or report' })
    }

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error })
    }

    return res.status(200).json({ publicUrl: result.publicUrl })
  } catch (err) {
    console.error('client-preview-link error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
