/**
 * Short public URLs for client-facing quote and report links.
 */

export function normalizePublicOrigin(origin) {
  if (origin) return String(origin).replace(/\/$/, '')
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

export function encodePublicLinkToken(token) {
  return encodeURIComponent(String(token || '').trim())
}

export function buildQuotePublicUrl(token, origin) {
  const base = normalizePublicOrigin(origin)
  return `${base}/q/${encodePublicLinkToken(token)}`
}

export function buildReportPublicUrl(token, origin) {
  const base = normalizePublicOrigin(origin)
  return `${base}/r/${encodePublicLinkToken(token)}`
}

export function parseReportTokenFromPublicUrl(url) {
  const match = String(url || '').match(/\/r\/([^/?#]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

export function parsePublicRoute(pathname = '', search = '') {
  const path = String(pathname || '')
  if (/^\/reset-password\/?$/.test(path)) {
    return { type: 'reset-password' }
  }
  const quoteMatch = path.match(/^\/q\/([^/?#]+)\/?$/)
  if (quoteMatch) {
    return { type: 'quote', token: decodeURIComponent(quoteMatch[1]) }
  }
  const reportMatch = path.match(/^\/r\/([^/?#]+)\/?$/)
  if (reportMatch) {
    return { type: 'report', token: decodeURIComponent(reportMatch[1]) }
  }

  const params = new URLSearchParams(search || '')
  const quote = params.get('quote')
  if (quote) return { type: 'quote', token: quote }
  const report = params.get('report')
  if (report) return { type: 'report', token: report }
  const form = params.get('form')
  if (form) return { type: 'form', token: form }
  return null
}

export function getPublicRouteFromWindow() {
  if (typeof window === 'undefined') return null
  return parsePublicRoute(window.location.pathname, window.location.search)
}
