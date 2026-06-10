/**
 * KV storage for public photo report links.
 */

export const REPORT_INVITES_KV_KEY = 'photo_report_invites'
export const REPORT_INVITE_EXPIRY_DAYS = 30

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

export async function getAllReportInvites() {
  if (!kvAvailable || !kv) return fallbackInvites
  try {
    const data = await kv.get(REPORT_INVITES_KV_KEY)
    const parsed = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    const result = Array.isArray(parsed) ? parsed : []
    fallbackInvites = result
    return result
  } catch {
    return fallbackInvites
  }
}

export async function saveAllReportInvites(invites) {
  fallbackInvites = invites
  if (!kvAvailable || !kv) return
  try {
    await kv.set(REPORT_INVITES_KV_KEY, invites).catch(() => kv.set(REPORT_INVITES_KV_KEY, JSON.stringify(invites)))
  } catch (e) {
    console.warn('report invites KV save failed', e.message)
  }
}

export function generateReportToken() {
  const bytes = new Uint8Array(32)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function isReportInviteExpired(invite) {
  if (!invite?.expiresAt) return false
  return new Date(invite.expiresAt).getTime() <= Date.now()
}

export async function findReportInviteByToken(token) {
  const normalized = String(token || '').trim()
  if (!normalized || normalized.length < 16) {
    return { invite: null, index: -1, error: 'not_found' }
  }
  const all = await getAllReportInvites()
  const index = all.findIndex((inv) => inv.token === normalized)
  if (index === -1) return { invite: null, index: -1, error: 'not_found' }
  const invite = all[index]
  if (invite.status === 'revoked') return { invite, index, error: 'revoked' }
  if (invite.status === 'expired') return { invite, index, error: 'expired' }
  if (isReportInviteExpired(invite)) return { invite, index, error: 'expired' }
  return { invite, index, error: null }
}
