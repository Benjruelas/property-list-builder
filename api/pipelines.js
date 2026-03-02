/**
 * Vercel Serverless Function
 * User-scoped deal pipelines. Requires Firebase Auth (Bearer token).
 * - GET: Pipelines owned by user or shared with user's email
 * - POST: Create pipeline (owner = current user)
 * - PATCH: Update pipeline (title, columns, leads, sharedWith). Owner only. sharedWith max 50 emails.
 * - DELETE: Delete pipeline (owner only)
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

const KV_KEY = 'user_pipelines'
let fallbackStore = []

async function getAllPipelines() {
  if (!kvAvailable || !kv) return fallbackStore
  try {
    const data = await kv.get(KV_KEY)
    const pipelines = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    const result = Array.isArray(pipelines) ? pipelines : []
    fallbackStore = result
    return result
  } catch (e) {
    return fallbackStore
  }
}

async function saveAllPipelines(pipelines) {
  fallbackStore = pipelines
  if (!kvAvailable || !kv) return
  try {
    await kv.set(KV_KEY, pipelines).catch(() => kv.set(KV_KEY, JSON.stringify(pipelines)))
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

const DEFAULT_COLUMNS = [
  'Make Contact',
  'Roof Inspection',
  'File Claim',
  'Service Agreement',
  "Adjuster's Meeting",
  'Scope of Loss',
  'Appraisal',
  'Ready for Install',
  'Install Scheduled',
  'Installed',
]

function normalizeColumns(cols) {
  if (!Array.isArray(cols) || cols.length === 0) {
    return DEFAULT_COLUMNS.map((name, i) => ({ id: `col-${i}`, name }))
  }
  return cols.map((c, i) => ({
    id: (c && c.id) || `col-${i}`,
    name: (c && c.name) || ''
  })).filter(c => c.name)
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
      const all = await getAllPipelines()
      const pipelines = all.filter(
        (p) => p.ownerId === user.uid || (Array.isArray(p.sharedWith) && p.sharedWith.map((e) => e.toLowerCase()).includes(user.email))
      )
      return res.status(200).json({ pipelines })
    }

    if (method === 'POST') {
      const { title = 'Deal Pipeline', columns, leads } = body
      const cols = normalizeColumns(columns)
      const leadsArr = Array.isArray(leads) ? leads : []
      const newPipeline = {
        id: `pipe_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        title: (title || 'Deal Pipeline').trim() || 'Deal Pipeline',
        columns: cols,
        leads: leadsArr,
        ownerId: user.uid,
        ownerEmail: user.email,
        sharedWith: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      const all = await getAllPipelines()
      all.push(newPipeline)
      await saveAllPipelines(all)
      return res.status(201).json({ pipeline: newPipeline })
    }

    if (method === 'PATCH') {
      const { pipelineId, title, columns, leads, sharedWith } = body
      if (!pipelineId) return res.status(400).json({ error: 'pipelineId is required' })

      const all = await getAllPipelines()
      const idx = all.findIndex((p) => p.id === pipelineId)
      if (idx === -1) return res.status(404).json({ error: 'Pipeline not found' })

      const pipeline = all[idx]
      if (pipeline.ownerId !== user.uid) {
        return res.status(403).json({ error: 'Only the pipeline owner can update this pipeline' })
      }

      if (title !== undefined) {
        pipeline.title = (title || 'Deal Pipeline').trim() || 'Deal Pipeline'
      }
      if (columns !== undefined) {
        pipeline.columns = normalizeColumns(columns)
      }
      if (leads !== undefined && Array.isArray(leads)) {
        pipeline.leads = leads
      }

      if (sharedWith !== undefined) {
        const arr = Array.isArray(sharedWith) ? sharedWith : []
        const emails = arr.map((e) => (e && String(e).trim()).toLowerCase()).filter(Boolean)
        const uniqueEmails = [...new Set(emails)]
        if (uniqueEmails.length > 50) return res.status(400).json({ error: 'Maximum 50 share emails allowed' })
        if (uniqueEmails.length > 0) {
          const knownEmails = new Set()
          all.forEach((p) => {
            const o = (p.ownerEmail || '').toLowerCase().trim()
            if (o) knownEmails.add(o)
            ;(p.sharedWith || []).forEach((s) => {
              const t = (s || '').toLowerCase().trim()
              if (t) knownEmails.add(t)
            })
          })
          // Also include list owners/shared for validation
          try {
            const listsData = kv.get ? await kv.get('user_lists') : null
            const lists = typeof listsData === 'string' ? (listsData ? JSON.parse(listsData) : []) : (listsData || [])
            ;(Array.isArray(lists) ? lists : []).forEach((l) => {
              const o = (l.ownerEmail || '').toLowerCase().trim()
              if (o) knownEmails.add(o)
              ;(l.sharedWith || []).forEach((s) => { const t = (s || '').toLowerCase().trim(); if (t) knownEmails.add(t) })
            })
          } catch {}
          if (!allowDevBypass || idToken !== 'dev-bypass') {
            const unknown = uniqueEmails.filter((e) => !knownEmails.has(e))
            if (unknown.length > 0) {
              return res.status(400).json({ error: `No user found with email: ${unknown[0]}` })
            }
          }
        }
        pipeline.sharedWith = uniqueEmails
      }

      pipeline.updatedAt = new Date().toISOString()
      all[idx] = pipeline
      await saveAllPipelines(all)
      return res.status(200).json({ pipeline })
    }

    if (method === 'DELETE') {
      const { pipelineId } = body
      if (!pipelineId) return res.status(400).json({ error: 'pipelineId is required' })

      const all = await getAllPipelines()
      const idx = all.findIndex((p) => p.id === pipelineId)
      if (idx === -1) return res.status(404).json({ error: 'Pipeline not found' })
      if (all[idx].ownerId !== user.uid) {
        return res.status(403).json({ error: 'Only the pipeline owner can delete this pipeline' })
      }
      all.splice(idx, 1)
      await saveAllPipelines(all)
      return res.status(200).json({ message: 'Pipeline deleted' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('pipelines API error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
