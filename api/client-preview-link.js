import { resolveDevBypassUser, isDevBypassAllowed } from './lib/devBypassUsers.js'
import { getQuoteById } from './lib/quoteStore.js'
import { getPhotoReportById } from './lib/reportStore.js'
import { mintQuotePreviewToken, mintReportPreviewToken } from './lib/previewToken.js'
import { buildQuotePublicUrl, buildReportPublicUrl } from './lib/publicLinks.js'

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
  if (!report || report.ownerId !== user.uid) {
    return { error: 'Report not found', status: 404 }
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

  const authHeader = req.headers.authorization
  const idToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  const allowDevBypass = isDevBypassAllowed(req)
  let user = allowDevBypass ? resolveDevBypassUser(idToken) : null
  if (!user) user = await verifyFirebaseToken(idToken)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

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
