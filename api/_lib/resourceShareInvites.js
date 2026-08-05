/**
 * KV storage for external Lead/Deal share links (/s/{token}).
 * Links stay pending until expiry so multiple recipients can claim.
 * Per-uid claims are tracked on the invite for deal-clone idempotency.
 */

import { generatePublicInviteToken } from './publicLinks.js'

export const RESOURCE_SHARE_INVITES_KV_KEY = 'resource_share_invites'
export const RESOURCE_SHARE_INVITE_EXPIRY_DAYS = 30

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

let fallbackInvites = []

export async function getAllResourceShareInvites() {
  if (!kvAvailable || !kv) return fallbackInvites
  try {
    const data = await kv.get(RESOURCE_SHARE_INVITES_KV_KEY)
    const parsed = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    const result = Array.isArray(parsed) ? parsed : []
    fallbackInvites = result
    return result
  } catch {
    return fallbackInvites
  }
}

export async function saveAllResourceShareInvites(invites) {
  const { pruneDeadInvites } = await import('./invitePrune.js')
  const pruned = pruneDeadInvites(invites)
  fallbackInvites = pruned
  if (!kvAvailable || !kv) return
  try {
    await kv.set(RESOURCE_SHARE_INVITES_KV_KEY, pruned).catch(() =>
      kv.set(RESOURCE_SHARE_INVITES_KV_KEY, JSON.stringify(pruned)),
    )
  } catch (e) {
    console.warn('resource share invites KV save failed', e.message)
  }
}

export function generateResourceShareToken() {
  return generatePublicInviteToken()
}

export function isResourceShareInviteExpired(invite) {
  if (!invite?.expiresAt) return false
  return new Date(invite.expiresAt).getTime() <= Date.now()
}

export async function findResourceShareInviteByToken(token) {
  const normalized = String(token || '').trim()
  if (!normalized || normalized.length < 8) {
    return { invite: null, index: -1, error: 'not_found' }
  }
  const all = await getAllResourceShareInvites()
  const index = all.findIndex((inv) => inv.token === normalized)
  if (index === -1) return { invite: null, index: -1, error: 'not_found' }
  const invite = all[index]
  if (invite.status === 'revoked') return { invite, index, error: 'revoked' }
  if (invite.status === 'expired') return { invite, index, error: 'expired' }
  if (isResourceShareInviteExpired(invite)) return { invite, index, error: 'expired' }
  return { invite, index, error: null }
}

export function findActiveResourceShareInvite(allInvites, { resourceType, resourceId, ownerId }) {
  const type = String(resourceType || '')
  const id = String(resourceId || '')
  const oid = String(ownerId || '')
  return (allInvites || []).find(
    (inv) =>
      String(inv.resourceType) === type &&
      String(inv.resourceId) === id &&
      String(inv.ownerId || '') === oid &&
      inv.status === 'pending' &&
      !isResourceShareInviteExpired(inv),
  ) || null
}

export function findClaimForUid(invite, uid) {
  if (!invite || !uid) return null
  const claims = Array.isArray(invite.claims) ? invite.claims : []
  return claims.find((c) => c && String(c.uid) === String(uid)) || null
}

export function upsertClaimOnInvite(invite, claim) {
  const claims = Array.isArray(invite.claims) ? [...invite.claims] : []
  const idx = claims.findIndex((c) => c && String(c.uid) === String(claim.uid))
  if (idx >= 0) claims[idx] = { ...claims[idx], ...claim }
  else claims.push(claim)
  return { ...invite, claims }
}

export function isValidShareEmail(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())
}

export function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
