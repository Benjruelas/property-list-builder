/**
 * KV storage for public photo report links.
 */

import { generatePublicInviteToken } from './publicLinks.js'

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
  return generatePublicInviteToken()
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

export function isValidReportEmail(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())
}

export function supersedePendingReportInvites(allInvites, { reportId, recipientEmail, keepToken }) {
  const normalizedRecipient = String(recipientEmail || '').trim().toLowerCase()
  const normalizedReportId = String(reportId || '')
  const now = new Date().toISOString()
  let supersededCount = 0

  const next = (allInvites || []).map((inv) => {
    if (
      inv.token !== keepToken &&
      String(inv.reportId) === normalizedReportId &&
      String(inv.recipientEmail || '').trim().toLowerCase() === normalizedRecipient &&
      inv.status === 'pending' &&
      !isReportInviteExpired(inv)
    ) {
      supersededCount++
      return { ...inv, status: 'revoked', revokedAt: now, revokedReason: 'superseded' }
    }
    return inv
  })

  return { invites: next, supersededCount }
}

export function hasPriorReportInvite(allInvites, { reportId, recipientEmail }) {
  const normalizedRecipient = String(recipientEmail || '').trim().toLowerCase()
  const normalizedReportId = String(reportId || '')
  return (allInvites || []).some(
    (inv) =>
      String(inv.reportId) === normalizedReportId &&
      String(inv.recipientEmail || '').trim().toLowerCase() === normalizedRecipient
  )
}

export function findActivePreviewReportInvite(allInvites, { reportId, ownerId }) {
  const normalizedReportId = String(reportId || '')
  const normalizedOwnerId = String(ownerId || '')
  return (allInvites || []).find(
    (inv) =>
      inv.preview === true &&
      inv.status === 'pending' &&
      !isReportInviteExpired(inv) &&
      String(inv.reportId) === normalizedReportId &&
      String(inv.ownerId) === normalizedOwnerId
  ) || null
}
