/**
 * Short public URLs for client-facing quote, report, and resource share links.
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

export function buildResourceSharePublicUrl(token, origin) {
  const base = normalizePublicOrigin(origin)
  return `${base}/s/${encodePublicLinkToken(token)}`
}

export function parseReportTokenFromPublicUrl(url) {
  const match = String(url || '').match(/\/r\/([^/?#]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

export function parseShareTokenFromPublicUrl(url) {
  const match = String(url || '').match(/\/s\/([^/?#]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

/**
 * Public-only SPA routes (no main App). Note: `?share=` is intentionally NOT
 * a public route — the main app loads and runs the authenticated claim flow.
 */
export function parsePublicRoute(pathname = '', search = '') {
  const path = String(pathname || '')
  if (/^\/reset-password\/?$/.test(path)) {
    return { type: 'reset-password' }
  }
  if (/^\/terms\/?$/.test(path)) {
    return { type: 'terms' }
  }
  if (/^\/privacy\/?$/.test(path)) {
    return { type: 'privacy' }
  }
  const quoteMatch = path.match(/^\/q\/([^/?#]+)\/?$/)
  if (quoteMatch) {
    return { type: 'quote', token: decodeURIComponent(quoteMatch[1]) }
  }
  const reportMatch = path.match(/^\/r\/([^/?#]+)\/?$/)
  if (reportMatch) {
    return { type: 'report', token: decodeURIComponent(reportMatch[1]) }
  }
  // /s/{token} is served by the share-landing API (OG + redirect). If the SPA
  // ever loads it, treat as a share claim hint via query after redirect.
  const shareMatch = path.match(/^\/s\/([^/?#]+)\/?$/)
  if (shareMatch) {
    return { type: 'share-redirect', token: decodeURIComponent(shareMatch[1]) }
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

/** Read pending share claim token from `?share=` (main app, not a public route). */
export function getShareClaimTokenFromWindow() {
  if (typeof window === 'undefined') return ''
  try {
    const params = new URLSearchParams(window.location.search || '')
    return String(params.get('share') || '').trim()
  } catch {
    return ''
  }
}

export function getPublicRouteFromWindow() {
  if (typeof window === 'undefined') return null
  return parsePublicRoute(window.location.pathname, window.location.search)
}
