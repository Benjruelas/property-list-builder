/**
 * Vercel Serverless Function
 * User-scoped GPS paths. Requires Firebase Auth (Bearer token).
 * - GET: Paths owned by user
 * - POST: Create path (owner = current user)
 * - PATCH: Rename path (owner only)
 * - DELETE: Delete path (owner only)
 *
 * Uses Vercel KV. Set FIREBASE_API_KEY (Firebase Web API key) for token verification.
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

const KV_KEY = 'user_paths'
let fallbackStore = []

async function getAllPaths() {
  if (!kvAvailable || !kv) return fallbackStore
  try {
    const data = await kv.get(KV_KEY)
    const paths = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    const result = Array.isArray(paths) ? paths : []
    fallbackStore = result
    return result
  } catch (e) {
    return fallbackStore
  }
}

async function saveAllPaths(paths) {
  fallbackStore = paths
  if (!kvAvailable || !kv) return
  try {
    await kv.set(KV_KEY, paths).catch(() => kv.set(KV_KEY, JSON.stringify(paths)))
  } catch (e) {
    console.warn('KV save failed', e.message)
  }
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const authHeader = req.headers.authorization
  const idToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  const host = req.headers.host || req.headers['x-forwarded-host'] || ''
  const origin = req.headers.origin || ''
  const isLocalhost = /localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0/.test(host) || /localhost|127\.0\.0\.1|\[::1\]/.test(origin)
  const allowDevBypass = isLocalhost || process.env.ENABLE_DEV_BYPASS === 'true'
  let user = allowDevBypass && idToken === 'dev-bypass' ? { uid: 'dev-local', email: 'dev@localhost' } : await verifyFirebaseToken(idToken)

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Sign in and send Authorization: Bearer <token>.' })
  }

  const { method, body = {} } = req

  try {
    if (method === 'GET') {
      const all = await getAllPaths()
      const paths = all.filter(
        (p) => p.ownerId === user.uid || (Array.isArray(p.sharedWith) && p.sharedWith.map(e => e.toLowerCase()).includes(user.email))
      )
      return res.status(200).json({ paths })
    }

    if (method === 'POST') {
      const { name, points = [], distanceMiles = 0, city: cityRaw } = body
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Path name is required' })
      }
      if (!Array.isArray(points) || points.length < 2) {
        return res.status(400).json({ error: 'Path must contain at least 2 points' })
      }
      const city =
        typeof cityRaw === 'string' ? cityRaw.trim().slice(0, 160) : ''
      const newPath = {
        id: `path_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        name: name.trim(),
        points,
        distanceMiles: typeof distanceMiles === 'number' ? distanceMiles : 0,
        city,
        ownerId: user.uid,
        ownerEmail: user.email,
        sharedWith: [],
        createdAt: new Date().toISOString()
      }
      const all = await getAllPaths()
      all.push(newPath)
      await saveAllPaths(all)
      return res.status(201).json({ path: newPath })
    }

    if (method === 'PATCH') {
      const { pathId, name, sharedWith } = body
      if (!pathId) return res.status(400).json({ error: 'pathId is required' })

      const all = await getAllPaths()
      const idx = all.findIndex((p) => p.id === pathId)
      if (idx === -1) return res.status(404).json({ error: 'Path not found' })

      const path = all[idx]
      if (path.ownerId !== user.uid) {
        return res.status(403).json({ error: 'Only the path owner can update this path' })
      }

      if (name !== undefined && name.trim()) {
        path.name = name.trim()
      }

      if (sharedWith !== undefined) {
        const arr = Array.isArray(sharedWith) ? sharedWith : []
        const emails = arr.map(e => (e && String(e).trim()).toLowerCase()).filter(Boolean)
        const uniqueEmails = [...new Set(emails)]
        if (uniqueEmails.length > 50) return res.status(400).json({ error: 'Maximum 50 share emails allowed' })
        path.sharedWith = uniqueEmails
      }

      path.updatedAt = new Date().toISOString()
      all[idx] = path
      await saveAllPaths(all)
      return res.status(200).json({ path })
    }

    if (method === 'DELETE') {
      const { pathId } = body
      if (!pathId) return res.status(400).json({ error: 'pathId is required' })

      const all = await getAllPaths()
      const idx = all.findIndex((p) => p.id === pathId)
      if (idx === -1) return res.status(404).json({ error: 'Path not found' })
      if (all[idx].ownerId !== user.uid) {
        return res.status(403).json({ error: 'Only the path owner can delete this path' })
      }
      all.splice(idx, 1)
      await saveAllPaths(all)
      return res.status(200).json({ message: 'Path deleted' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('paths API error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
