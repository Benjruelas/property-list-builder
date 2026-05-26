import { resolveDevBypassUser } from './lib/devBypassUsers.js'

/**
 * Register / unregister Web Push subscriptions (KV). Supports multiple devices per user.
 * POST { subscription: PushSubscription JSON }
 * DELETE — remove all subscriptions for current user
 */

let kv = null
let kvAvailable = false

if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  try {
    const kvModule = await import('@vercel/kv')
    kv = kvModule.kv
    kvAvailable = true
  } catch {
    kvAvailable = false
  }
} else if (process.env.REDIS_URL) {
  try {
    const { createClient } = await import('redis')
    kv = createClient({ url: process.env.REDIS_URL })
    await kv.connect()
    kvAvailable = true
  } catch {
    kvAvailable = false
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

function endpointId(subscription) {
  const ep = subscription?.endpoint || ''
  return ep ? ep.slice(-48) : `sub_${Date.now()}`
}

async function loadSubscriptions(uid) {
  try {
    const raw = await kv.get(`push_subs:${uid}`)
    const parsed = typeof raw === 'string' ? (raw ? JSON.parse(raw) : []) : raw
    if (Array.isArray(parsed) && parsed.length) return parsed

    const legacy = await kv.get(`push_sub:${uid}`)
    if (legacy) {
      const sub = typeof legacy === 'string' ? JSON.parse(legacy) : legacy
      if (sub?.endpoint) {
        return [{ id: endpointId(sub), subscription: sub, updatedAt: new Date().toISOString() }]
      }
    }
  } catch {
    /* ignore */
  }
  return []
}

async function saveSubscriptions(uid, entries) {
  await kv.set(`push_subs:${uid}`, entries)
  if (entries.length === 1) {
    await kv.set(`push_sub:${uid}`, JSON.stringify(entries[0].subscription))
  } else if (entries.length === 0) {
    await kv.del(`push_sub:${uid}`)
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const authHeader = req.headers.authorization
  const idToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  const host = req.headers.host || req.headers['x-forwarded-host'] || ''
  const origin = req.headers.origin || ''
  const isLocalhost = /localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0/.test(host) || /localhost|127\.0\.0\.1|\[::1\]/.test(origin)
  const allowDevBypass = isLocalhost || process.env.ENABLE_DEV_BYPASS === 'true'
  let user = allowDevBypass ? resolveDevBypassUser(idToken) : null
  if (!user) user = await verifyFirebaseToken(idToken)

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!kvAvailable || !kv) {
    return res.status(503).json({ error: 'Push storage unavailable' })
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})

  try {
    if (req.method === 'POST') {
      const { subscription } = body
      if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ error: 'subscription required' })
      }
      const email = (user.email || '').toLowerCase().trim()
      if (!email) {
        return res.status(400).json({ error: 'Account email required for push' })
      }

      const prevEmail = await kv.get(`push_uid:${user.uid}`)
      if (prevEmail && prevEmail !== email) {
        try {
          await kv.del(`push_by_email:${prevEmail}`)
        } catch {
          /* ignore */
        }
      }

      const now = new Date().toISOString()
      const id = endpointId(subscription)
      const entries = await loadSubscriptions(user.uid)
      const idx = entries.findIndex((e) => e.id === id || e.subscription?.endpoint === subscription.endpoint)
      const entry = { id, subscription, updatedAt: now }
      if (idx >= 0) entries[idx] = entry
      else entries.push(entry)

      const maxDevices = 5
      entries.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      while (entries.length > maxDevices) entries.pop()

      await saveSubscriptions(user.uid, entries)
      await kv.set(`push_by_email:${email}`, user.uid)
      await kv.set(`push_uid:${user.uid}`, email)

      return res.status(200).json({ ok: true, deviceCount: entries.length })
    }

    if (req.method === 'DELETE') {
      const email = await kv.get(`push_uid:${user.uid}`)
      await kv.del(`push_subs:${user.uid}`)
      await kv.del(`push_sub:${user.uid}`)
      await kv.del(`push_uid:${user.uid}`)
      if (email) {
        await kv.del(`push_by_email:${email}`)
      }
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('push-subscribe error', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
