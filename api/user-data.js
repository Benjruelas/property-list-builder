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

import { authenticate } from './_lib/auth.js'
import { kv, kvAvailable } from './_lib/kvBootstrap.js'
import { withKvLock } from './_lib/kvLock.js'

function kvKey(uid) {
  return `user_data_${uid}`
}

function lockKey(uid) {
  return `lock:user_data_${uid}`
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

  const { user } = await authenticate(req)

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Sign in and send Authorization: Bearer <token>.' })
  }

  try {
    if (req.method === 'GET') {
      const data = await getUserData(user.uid)
      const version = Number(data?.__version) || 0
      return res.status(200).json({ data: data || {}, version })
    }

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
      const allowedKeys = [
        'dealPipelineColumns', 'dealPipelineLeads', 'dealPipelineTitle',
        'leadTasks', 'parcelNotes', 'skipTracedParcels', 'emailTemplates', 'textTemplates',
        'dealTemplates', 'skipTraceJobs', 'skipTracedList', 'appSettings', 'closedLeads'
      ]

      // Serialize the read-modify-write under a short lock so concurrent PATCHes
      // (multiple tabs/devices) can't lose each other's *other* field updates.
      // Clients may still send __baseVersion for compatibility; we ignore it for
      // conflict rejection because delta merges under the lock are safe, and a
      // 409 only produced noisy retries without improving same-key last-write-wins.
      const applyMerge = async () => {
        const existing = await getUserData(user.uid) || {}
        const currentVersion = Number(existing.__version) || 0
        const merged = { ...existing }
        for (const key of allowedKeys) {
          if (key in body && body[key] !== undefined) {
            merged[key] = body[key]
          }
        }
        merged.__version = currentVersion + 1
        await saveUserData(user.uid, merged)
        return { currentVersion: merged.__version, data: merged }
      }

      const locked = await withKvLock(lockKey(user.uid), applyMerge, { ttlMs: 5000, maxWaitMs: 3000 })
      const result = locked !== null ? locked : await applyMerge()

      return res.status(200).json({ data: result.data, version: result.currentVersion })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('user-data API error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
