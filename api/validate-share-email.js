/**
 * Validates that an email belongs to a known user (owner or shared-with in our lists).
 * Without Firebase Admin SDK we can only check against users present in our lists data.
 * GET /api/validate-share-email?email=user@example.com
 * Returns { valid: true } or { valid: false }
 */

let kv = null
let kvAvailable = false

if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  try {
    const kvModule = await import('@vercel/kv')
    kv = kvModule.kv
    kvAvailable = true
  } catch (e) {
    kvAvailable = false
  }
} else if (process.env.REDIS_URL) {
  try {
    const { createClient } = await import('redis')
    kv = createClient({ url: process.env.REDIS_URL })
    await kv.connect()
    kvAvailable = true
  } catch (e) {
    kvAvailable = false
  }
}

const KV_KEY_LISTS = 'user_lists'
const KV_KEY_PIPELINES = 'user_pipelines'

async function getAllLists() {
  if (!kvAvailable || !kv) return []
  try {
    const data = await kv.get(KV_KEY_LISTS)
    const lists = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    return Array.isArray(lists) ? lists : []
  } catch (e) {
    return []
  }
}

async function getAllPipelines() {
  if (!kvAvailable || !kv) return []
  try {
    const data = await kv.get(KV_KEY_PIPELINES)
    const pipelines = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    return Array.isArray(pipelines) ? pipelines : []
  } catch (e) {
    return []
  }
}

function buildKnownEmails(lists, pipelines = []) {
  const emails = new Set()
  for (const list of lists) {
    const owner = (list.ownerEmail || '').toLowerCase().trim()
    if (owner) emails.add(owner)
    const shared = list.sharedWith || []
    for (const e of shared) {
      const s = (e || '').toLowerCase().trim()
      if (s) emails.add(s)
    }
  }
  for (const pipe of pipelines) {
    const owner = (pipe.ownerEmail || '').toLowerCase().trim()
    if (owner) emails.add(owner)
    const shared = pipe.sharedWith || []
    for (const e of shared) {
      const s = (e || '').toLowerCase().trim()
      if (s) emails.add(s)
    }
  }
  return emails
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const authHeader = req.headers.authorization
  const idToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  const host = req.headers.host || req.headers['x-forwarded-host'] || ''
  const origin = req.headers.origin || ''
  const isLocalhost = /localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0/.test(host) || /localhost|127\.0\.0\.1|\[::1\]/.test(origin)
  const allowDevBypass = isLocalhost || process.env.ENABLE_DEV_BYPASS === 'true'
  const user = allowDevBypass && idToken === 'dev-bypass'
    ? { uid: 'dev-local', email: 'dev@localhost' }
    : await verifyFirebaseToken(idToken)

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const email = (req.query?.email || '').toLowerCase().trim()
  if (!email) {
    return res.status(400).json({ valid: false, error: 'Email is required' })
  }

  try {
    const [lists, pipelines] = await Promise.all([getAllLists(), getAllPipelines()])
    const knownEmails = buildKnownEmails(lists, pipelines)
    if (user?.email) knownEmails.add(user.email) // current user is always valid
    const valid = knownEmails.has(email)

    return res.status(200).json({ valid })
  } catch (err) {
    console.error('validate-share-email error', err)
    return res.status(500).json({ valid: false, error: err.message })
  }
}
