/**
 * KV storage helpers for public quote invite links.
 */

import { generatePublicInviteToken } from './publicLinks.js'

export const INVITES_KV_KEY = 'quote_invites'
export const INVITE_EXPIRY_DAYS = 30

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

export async function getAllQuoteInvites() {
  if (!kvAvailable || !kv) return fallbackInvites
  try {
    const data = await kv.get(INVITES_KV_KEY)
    const parsed = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    const result = Array.isArray(parsed) ? parsed : []
    fallbackInvites = result
    return result
  } catch {
    return fallbackInvites
  }
}

export async function saveAllQuoteInvites(invites) {
  const { pruneDeadInvites } = await import('./invitePrune.js')
  const pruned = pruneDeadInvites(invites)
  fallbackInvites = pruned
  if (!kvAvailable || !kv) return
  try {
    await kv.set(INVITES_KV_KEY, pruned).catch(() => kv.set(INVITES_KV_KEY, JSON.stringify(pruned)))
  } catch (e) {
    console.warn('quote invites KV save failed', e.message)
  }
}

export function generateToken() {
  return generatePublicInviteToken()
}

export function isInviteExpired(invite) {
  if (!invite?.expiresAt) return false
  return new Date(invite.expiresAt).getTime() <= Date.now()
}

export function isValidEmail(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())
}

export function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function findQuoteInviteByToken(token) {
  const normalized = String(token || '').trim()
  if (!normalized || normalized.length < 8) {
    return { invite: null, index: -1, error: 'not_found' }
  }
  const all = await getAllQuoteInvites()
  const index = all.findIndex((inv) => inv.token === normalized)
  if (index === -1) return { invite: null, index: -1, error: 'not_found' }
  const invite = all[index]
  if (invite.status === 'revoked') return { invite, index, error: 'revoked' }
  if (invite.status === 'expired') return { invite, index, error: 'expired' }
  if (isInviteExpired(invite)) return { invite, index, error: 'expired' }
  return { invite, index, error: null }
}

export function supersedePendingQuoteInvites(allInvites, { quoteId, recipientEmail, keepToken }) {
  const normalizedRecipient = String(recipientEmail || '').trim().toLowerCase()
  const normalizedQuoteId = String(quoteId || '')
  const now = new Date().toISOString()
  let supersededCount = 0

  const next = (allInvites || []).map((inv) => {
    if (
      inv.token !== keepToken &&
      String(inv.quoteId) === normalizedQuoteId &&
      String(inv.recipientEmail || '').trim().toLowerCase() === normalizedRecipient &&
      inv.status === 'pending' &&
      !isInviteExpired(inv)
    ) {
      supersededCount++
      return { ...inv, status: 'revoked', revokedAt: now, revokedReason: 'superseded' }
    }
    return inv
  })

  return { invites: next, supersededCount }
}

export function hasPriorQuoteInvite(allInvites, { quoteId, recipientEmail }) {
  const normalizedRecipient = String(recipientEmail || '').trim().toLowerCase()
  const normalizedQuoteId = String(quoteId || '')
  return (allInvites || []).some(
    (inv) =>
      String(inv.quoteId) === normalizedQuoteId &&
      String(inv.recipientEmail || '').trim().toLowerCase() === normalizedRecipient
  )
}

export function findActivePreviewQuoteInvite(allInvites, { quoteId, ownerId }) {
  const normalizedQuoteId = String(quoteId || '')
  const normalizedOwnerId = String(ownerId || '')
  return (allInvites || []).find(
    (inv) =>
      inv.preview === true &&
      inv.status === 'pending' &&
      !isInviteExpired(inv) &&
      String(inv.quoteId) === normalizedQuoteId &&
      String(inv.ownerId) === normalizedOwnerId
  ) || null
}
