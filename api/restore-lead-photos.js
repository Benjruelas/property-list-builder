/**
 * Admin-only: rebuild lead.photos[] from surviving R2/local blobs after a bad import.
 * POST { ownerUid?, dryRun?: boolean, leadIds?: string[] }
 * Requires Authorization + X-Migrate-Secret (same as migrate-infra).
 */

import { authenticate } from './_lib/auth.js'
import { restoreLeadPhotosForOwner } from './_lib/restoreLeadPhotos.js'

export const config = {
  maxDuration: 60,
}

function assertMigrateAccess(req, user) {
  const secret = process.env.MIGRATE_SECRET
  const provided = req.headers['x-migrate-secret']
  if (!secret || provided !== secret) {
    return { status: 403, error: 'Forbidden' }
  }
  if (!user) return { status: 401, error: 'Unauthorized' }

  const adminList = String(process.env.MIGRATE_ADMIN_UIDS || process.env.ADMIN_UIDS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

  const uid = String(user.uid || '').toLowerCase()
  const email = String(user.email || '').toLowerCase()
  const isSelfRestore = String(req.body?.ownerUid || user.uid) === user.uid

  if (adminList.length > 0) {
    if (!adminList.includes(uid) && !adminList.includes(email) && !isSelfRestore) {
      return { status: 403, error: 'Forbidden' }
    }
    return null
  }

  if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
    if (!isSelfRestore) {
      return { status: 403, error: 'Admin allowlist not configured' }
    }
  }
  return null
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Migrate-Secret')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { user } = await authenticate(req)
  const denied = assertMigrateAccess(req, user)
  if (denied) return res.status(denied.status).json({ error: denied.error })

  const body = req.body || {}
  const ownerUid = String(body.ownerUid || user.uid || '').trim()
  if (!ownerUid) return res.status(400).json({ error: 'ownerUid is required' })

  if (ownerUid !== user.uid) {
    const adminList = String(process.env.MIGRATE_ADMIN_UIDS || process.env.ADMIN_UIDS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
    const uid = String(user.uid || '').toLowerCase()
    const email = String(user.email || '').toLowerCase()
    if (!adminList.includes(uid) && !adminList.includes(email)) {
      return res.status(403).json({ error: 'Only admins can restore another user\'s photos' })
    }
  }

  const dryRun = body.dryRun !== false
  const leadIds = Array.isArray(body.leadIds)
    ? body.leadIds.map(String).filter(Boolean)
    : null

  try {
    const report = await restoreLeadPhotosForOwner({ ownerUid, dryRun, leadIds })
    return res.status(200).json({ ok: true, ...report })
  } catch (err) {
    console.error('restore-lead-photos error', err)
    return res.status(500).json({ error: err.message || 'Restore failed' })
  }
}
