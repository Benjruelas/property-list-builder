/**
 * KV storage helpers for public quote invite links.
 */

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
  fallbackInvites = invites
  if (!kvAvailable || !kv) return
  try {
    await kv.set(INVITES_KV_KEY, invites).catch(() => kv.set(INVITES_KV_KEY, JSON.stringify(invites)))
  } catch (e) {
    console.warn('quote invites KV save failed', e.message)
  }
}

export function generateToken() {
  const bytes = new Uint8Array(32)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
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
  if (!normalized || normalized.length < 16) {
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
