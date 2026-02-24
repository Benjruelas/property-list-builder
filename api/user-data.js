/**
 * Vercel Serverless Function
 * User-scoped app data (deal pipeline, leads, tasks, parcel notes, skip traced, etc.).
 * Requires Firebase Auth (Bearer token).
 * - GET: Returns user's saved data blob
 * - PATCH: Accepts partial updates (merge into existing)
 *
 * Uses Vercel KV with key user_data_${uid}.
 * Set FIREBASE_API_KEY (Firebase Web API key) for token verification.
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

function kvKey(uid) {
  return `user_data_${uid}`
}

/** Verify Firebase ID token; returns { uid, email } or null */
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

async function getUserData(uid) {
  if (!kvAvailable || !kv) return null
  try {
    const data = await kv.get(kvKey(uid))
    if (!data) return null
    if (typeof data === 'string') return JSON.parse(data)
    return data
  } catch (e) {
    console.warn('KV get user_data failed', e.message)
    return null
  }
}

async function saveUserData(uid, data) {
  if (!kvAvailable || !kv) return
  try {
    await kv.set(kvKey(uid), JSON.stringify(data))
  } catch (e) {
    console.warn('KV save user_data failed', e.message)
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const authHeader = req.headers.authorization
  const idToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  const isLocalhost = /localhost|127\.0\.0\.1/.test(req.headers.host || '') || /localhost|127\.0\.0\.1/.test(req.headers.origin || '')
  let user = isLocalhost && idToken === 'dev-bypass' ? { uid: 'dev-local', email: 'dev@localhost' } : await verifyFirebaseToken(idToken)

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Sign in and send Authorization: Bearer <token>.' })
  }

  try {
    if (req.method === 'GET') {
      const data = await getUserData(user.uid)
      return res.status(200).json({ data: data || {} })
    }

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
      const existing = await getUserData(user.uid) || {}
      const merged = { ...existing }
      const allowedKeys = [
        'dealPipelineColumns', 'dealPipelineLeads', 'dealPipelineTitle',
        'leadTasks', 'parcelNotes', 'skipTracedParcels', 'emailTemplates',
        'skipTraceJobs', 'skipTracedList'
      ]
      for (const key of allowedKeys) {
        if (key in body && body[key] !== undefined) {
          merged[key] = body[key]
        }
      }
      await saveUserData(user.uid, merged)
      return res.status(200).json({ data: merged })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('user-data API error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
