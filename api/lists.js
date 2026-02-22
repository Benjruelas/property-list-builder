/**
 * Vercel Serverless Function
 * User-scoped property lists. Requires Firebase Auth (Bearer token).
 * - GET: Lists owned by user or shared with user's email
 * - POST: Create list (owner = current user)
 * - PATCH: Update list (parcels, removeParcels, or sharedWith). Owner only. sharedWith max 2 emails.
 * - DELETE: Delete list (owner only)
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

const KV_KEY = 'user_lists'
let fallbackStore = []

async function getAllLists() {
  if (!kvAvailable || !kv) return fallbackStore
  try {
    const data = await kv.get(KV_KEY)
    const lists = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    const result = Array.isArray(lists) ? lists : []
    fallbackStore = result
    return result
  } catch (e) {
    return fallbackStore
  }
}

async function saveAllLists(lists) {
  fallbackStore = lists
  if (!kvAvailable || !kv) return
  try {
    await kv.set(KV_KEY, lists).catch(() => kv.set(KV_KEY, JSON.stringify(lists)))
  } catch (e) {
    console.warn('KV save failed', e.message)
  }
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

function normalizeParcel(p) {
  if (typeof p === 'string') return { id: p, addedAt: new Date().toISOString() }
  if (p && p.id) {
    return {
      id: p.id,
      properties: p.properties || {},
      address: p.address || null,
      lat: p.lat || null,
      lng: p.lng || null,
      addedAt: p.addedAt || new Date().toISOString()
    }
  }
  return null
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const authHeader = req.headers.authorization
  const idToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  const user = await verifyFirebaseToken(idToken)

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Sign in and send Authorization: Bearer <token>.' })
  }

  const { method, body = {} } = req

  try {
    if (method === 'GET') {
      const all = await getAllLists()
      const lists = all.filter(
        (l) => l.ownerId === user.uid || (Array.isArray(l.sharedWith) && l.sharedWith.map((e) => e.toLowerCase()).includes(user.email))
      )
      return res.status(200).json({ lists })
    }

    if (method === 'POST') {
      const { name, parcels = [] } = body
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'List name is required' })
      }
      const newList = {
        id: `list_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        name: name.trim(),
        parcels: parcels.map(normalizeParcel).filter(Boolean),
        ownerId: user.uid,
        ownerEmail: user.email,
        sharedWith: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      const all = await getAllLists()
      all.push(newList)
      await saveAllLists(all)
      return res.status(201).json({ list: newList })
    }

    if (method === 'PATCH') {
      const { listId, parcels: newParcels, removeParcels, sharedWith } = body
      if (!listId) return res.status(400).json({ error: 'listId is required' })

      const all = await getAllLists()
      const idx = all.findIndex((l) => l.id === listId)
      if (idx === -1) return res.status(404).json({ error: 'List not found' })

      const list = all[idx]
      if (list.ownerId !== user.uid) {
        return res.status(403).json({ error: 'Only the list owner can update this list' })
      }

      if (sharedWith !== undefined) {
        const arr = Array.isArray(sharedWith) ? sharedWith : []
        if (arr.length > 2) {
          return res.status(400).json({ error: 'You can share with at most 2 users' })
        }
        const emails = arr.map((e) => (e && String(e).trim()).toLowerCase()).filter(Boolean)
        if (emails.length > 2) return res.status(400).json({ error: 'Maximum 2 share emails allowed' })
        list.sharedWith = emails
      }

      if (removeParcels && Array.isArray(removeParcels)) {
        const ids = new Set(removeParcels)
        list.parcels = list.parcels.filter((p) => !ids.has(p.id || p))
      }
      if (newParcels && Array.isArray(newParcels)) {
        const existingIds = new Set((list.parcels || []).map((p) => p.id || p))
        const toAdd = newParcels.map(normalizeParcel).filter((p) => p && !existingIds.has(p.id))
        list.parcels = [...(list.parcels || []), ...toAdd]
      }

      list.updatedAt = new Date().toISOString()
      all[idx] = list
      await saveAllLists(all)
      return res.status(200).json({ list })
    }

    if (method === 'DELETE') {
      const { listId } = body
      if (!listId) return res.status(400).json({ error: 'listId is required' })

      const all = await getAllLists()
      const idx = all.findIndex((l) => l.id === listId)
      if (idx === -1) return res.status(404).json({ error: 'List not found' })
      if (all[idx].ownerId !== user.uid) {
        return res.status(403).json({ error: 'Only the list owner can delete this list' })
      }
      all.splice(idx, 1)
      await saveAllLists(all)
      return res.status(200).json({ message: 'List deleted' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('lists API error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
