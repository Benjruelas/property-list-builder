/**
 * KV storage helpers for single-use public form invite links.
 */

export const INVITES_KV_KEY = 'form_invites'
export const TEMPLATES_KV_KEY = 'user_form_templates'
export const SUBMISSIONS_KV_KEY = 'user_form_submissions'
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
let fallbackSubmissions = []

export async function getAllInvites() {
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

export async function saveAllInvites(invites) {
  const { pruneDeadInvites } = await import('./invitePrune.js')
  const pruned = pruneDeadInvites(invites)
  fallbackInvites = pruned
  if (!kvAvailable || !kv) return
  try {
    await kv.set(INVITES_KV_KEY, pruned).catch(() => kv.set(INVITES_KV_KEY, JSON.stringify(pruned)))
  } catch (e) {
    console.warn('form invites KV save failed', e.message)
  }
}

export async function getAllTemplates() {
  if (!kvAvailable || !kv) return []
  try {
    const data = await kv.get(TEMPLATES_KV_KEY)
    const parsed = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function appendSubmission(record) {
  if (!kvAvailable || !kv) {
    fallbackSubmissions.push(record)
    return
  }
  try {
    const data = await kv.get(SUBMISSIONS_KV_KEY)
    const parsed = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    const all = Array.isArray(parsed) ? parsed : []
    all.push(record)
    await kv.set(SUBMISSIONS_KV_KEY, all).catch(() => kv.set(SUBMISSIONS_KV_KEY, JSON.stringify(all)))
  } catch (e) {
    console.warn('submission save failed', e.message)
  }
}

export async function getAllSubmissions() {
  if (!kvAvailable || !kv) return fallbackSubmissions
  try {
    const data = await kv.get(SUBMISSIONS_KV_KEY)
    const parsed = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    const result = Array.isArray(parsed) ? parsed : []
    fallbackSubmissions = result
    return result
  } catch {
    return fallbackSubmissions
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

/**
 * Resolve invite by token. Returns { invite, index, error } where error is
 * 'not_found' | 'expired' | 'submitted' | null.
 */
export async function findInviteByToken(token) {
  const normalized = String(token || '').trim()
  if (!normalized || normalized.length < 16) {
    return { invite: null, index: -1, error: 'not_found' }
  }
  const all = await getAllInvites()
  const index = all.findIndex((inv) => inv.token === normalized)
  if (index === -1) return { invite: null, index: -1, error: 'not_found' }
  const invite = all[index]
  if (invite.status === 'submitted') {
    return { invite, index, error: 'submitted' }
  }
  if (invite.status === 'revoked') {
    return { invite, index, error: 'revoked' }
  }
  if (invite.status === 'expired') {
    return { invite, index, error: 'expired' }
  }
  if (isInviteExpired(invite)) {
    return { invite, index, error: 'expired' }
  }
  return { invite, index, error: null }
}

/**
 * Atomically mark invite as submitted. Returns false if already submitted.
 */
export async function markInviteSubmitted(token) {
  const all = await getAllInvites()
  const index = all.findIndex((inv) => inv.token === String(token || '').trim())
  if (index === -1) return { ok: false, reason: 'not_found', invite: null }
  const invite = all[index]
  if (invite.status === 'submitted') return { ok: false, reason: 'submitted', invite }
  if (invite.status === 'revoked' || invite.status === 'expired' || isInviteExpired(invite)) {
    return { ok: false, reason: 'expired', invite }
  }
  const now = new Date().toISOString()
  all[index] = { ...invite, status: 'submitted', submittedAt: now }
  await saveAllInvites(all)
  return { ok: true, invite: all[index] }
}

/**
 * Record a public open/view on a pending invite. Returns
 * { ok, invite, isFirst } — isFirst is true only on the first view.
 */
export async function recordInviteView(token) {
  const all = await getAllInvites()
  const index = all.findIndex((inv) => inv.token === String(token || '').trim())
  if (index === -1) return { ok: false, reason: 'not_found', invite: null, isFirst: false }
  const invite = all[index]
  if (invite.status === 'submitted') {
    return { ok: false, reason: 'submitted', invite, isFirst: false }
  }
  if (invite.status === 'revoked') {
    return { ok: false, reason: 'revoked', invite, isFirst: false }
  }
  if (invite.status === 'expired' || isInviteExpired(invite)) {
    return { ok: false, reason: 'expired', invite, isFirst: false }
  }
  const now = new Date().toISOString()
  const vt = invite.viewTracking || { viewCount: 0 }
  const isFirst = !vt.firstViewedAt
  all[index] = {
    ...invite,
    viewTracking: {
      firstViewedAt: vt.firstViewedAt || now,
      lastViewedAt: now,
      viewCount: (vt.viewCount || 0) + 1,
    },
  }
  await saveAllInvites(all)
  return { ok: true, invite: all[index], isFirst }
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

export function sanitizeFilename(s) {
  return String(s || 'form').replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 60) || 'form'
}

export function isFieldValueFilled(field, value) {
  if (!field) return false
  if (field.type === 'checkbox') return !!value
  return typeof value === 'string' ? !!value.trim() : !!value
}

/**
 * Keep only valid, non-empty values for known template fields.
 * Caps total payload size (signatures can be large data URLs).
 */
export function sanitizePrefillValues(rawValues, fields, { maxBytes = 600000 } = {}) {
  if (!rawValues || typeof rawValues !== 'object' || Array.isArray(rawValues)) return {}
  const fieldsById = new Map((fields || []).map((f) => [f.id, f]))
  const out = {}
  let size = 0

  for (const [fieldId, value] of Object.entries(rawValues)) {
    const field = fieldsById.get(fieldId)
    if (!field || !isFieldValueFilled(field, value)) continue

    if (field.type === 'signature') {
      const s = typeof value === 'string' ? value : ''
      if (!s.startsWith('data:') || s.length > 250000) continue
      out[fieldId] = s
      size += s.length
    } else if (field.type === 'checkbox') {
      out[fieldId] = !!value
      size += 8
    } else {
      const s = String(value ?? '').slice(0, 10000)
      if (!s.trim()) continue
      out[fieldId] = s
      size += s.length
    }

    if (size > maxBytes) break
  }

  return out
}

export function mergeInviteValues(invite, submittedValues) {
  const prefill = invite?.prefillValues && typeof invite.prefillValues === 'object'
    ? invite.prefillValues
    : {}
  const merged = { ...(submittedValues || {}), ...prefill }
  for (const key of Object.keys(prefill)) {
    merged[key] = prefill[key]
  }
  return merged
}

/**
 * Revoke still-active pending invites for the same template + recipient so a
 * newly issued link is the only one that works.
 */
export function supersedePendingInvites(allInvites, { templateId, recipientEmail, keepToken }) {
  const normalizedRecipient = String(recipientEmail || '').trim().toLowerCase()
  const normalizedTemplateId = String(templateId || '')
  const now = new Date().toISOString()
  let supersededCount = 0

  const next = (allInvites || []).map((inv) => {
    if (
      inv.token !== keepToken &&
      String(inv.templateId) === normalizedTemplateId &&
      String(inv.recipientEmail || '').trim().toLowerCase() === normalizedRecipient &&
      inv.status === 'pending' &&
      !isInviteExpired(inv)
    ) {
      supersededCount++
      return {
        ...inv,
        status: 'revoked',
        revokedAt: now,
        revokedReason: 'superseded',
      }
    }
    return inv
  })

  return { invites: next, supersededCount }
}

export function hasPriorInviteForRecipient(allInvites, { templateId, recipientEmail }) {
  const normalizedRecipient = String(recipientEmail || '').trim().toLowerCase()
  const normalizedTemplateId = String(templateId || '')
  return (allInvites || []).some(
    (inv) =>
      String(inv.templateId) === normalizedTemplateId &&
      String(inv.recipientEmail || '').trim().toLowerCase() === normalizedRecipient
  )
}
