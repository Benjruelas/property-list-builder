/**
 * Short public URLs for client-facing quote and report links.
 * Share links use compact path URLs: /q/{token}, /r/{token}
 */

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const DEFAULT_INVITE_TOKEN_LENGTH = 10

export function generatePublicInviteToken(length = DEFAULT_INVITE_TOKEN_LENGTH) {
  const size = Math.max(8, Math.min(length, 24))
  const bytes = new Uint8Array(size)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < size; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  let out = ''
  for (let i = 0; i < size; i++) out += BASE62[bytes[i] % BASE62.length]
  return out
}

export function normalizePublicOrigin(origin) {
  return String(origin || '').replace(/\/$/, '') || 'https://localhost'
}

export function encodePublicLinkToken(token) {
  return encodeURIComponent(String(token || '').trim())
}

export function buildQuotePublicUrl(origin, token) {
  return `${normalizePublicOrigin(origin)}/q/${encodePublicLinkToken(token)}`
}

export function buildReportPublicUrl(origin, token) {
  return `${normalizePublicOrigin(origin)}/r/${encodePublicLinkToken(token)}`
}

export function buildQuotePublicPath(token, { payment } = {}) {
  const params = new URLSearchParams()
  if (payment) params.set('payment', payment)
  const qs = params.toString()
  return `/q/${encodePublicLinkToken(token)}${qs ? `?${qs}` : ''}`
}
