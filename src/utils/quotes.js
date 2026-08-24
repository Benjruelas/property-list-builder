/**
 * Quotes and quote templates API client.
 */

import { getApiBase } from './apiBase'
import { buildQuotePublicUrl as buildQuotePublicUrlFromToken } from './publicLinks'

async function parseJsonSafe(res) {
  try {
    return await res.json()
  } catch {
    return {}
  }
}

async function authFetch(getToken, path, options = {}) {
  const token = await getToken()
  if (!token) throw new Error('Sign in required')
  const res = await fetch(`${getApiBase()}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  })
  return res
}

// --- Quote templates ---

export async function fetchQuoteTemplates(getToken) {
  const res = await authFetch(getToken, '/quote-templates')
  if (!res.ok) throw new Error('Failed to fetch quote templates')
  const data = await parseJsonSafe(res)
  return data.templates || []
}

export async function createQuoteTemplate(getToken, payload) {
  const res = await authFetch(getToken, '/quote-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await parseJsonSafe(res)
    throw new Error(err.error || 'Failed to create template')
  }
  const data = await parseJsonSafe(res)
  return data.template
}

export async function updateQuoteTemplate(getToken, templateId, updates) {
  const res = await authFetch(getToken, '/quote-templates', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateId, ...updates }),
  })
  if (!res.ok) {
    const err = await parseJsonSafe(res)
    throw new Error(err.error || 'Failed to update template')
  }
  const data = await parseJsonSafe(res)
  return data.template
}

export async function deleteQuoteTemplate(getToken, templateId) {
  const res = await authFetch(getToken, '/quote-templates', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateId }),
  })
  if (!res.ok) {
    const err = await parseJsonSafe(res)
    throw new Error(err.error || 'Failed to delete template')
  }
}

// --- Quotes ---

const dealQuotesCache = new Map()

export function getCachedDealQuotes(dealId) {
  if (!dealId) return null
  const entry = dealQuotesCache.get(dealId)
  return entry?.quotes ?? null
}

export function setCachedDealQuotes(dealId, quotes) {
  if (!dealId) return
  dealQuotesCache.set(dealId, { quotes, at: Date.now() })
}

export function invalidateDealQuotesCache(dealId) {
  if (dealId) dealQuotesCache.delete(dealId)
  else dealQuotesCache.clear()
}

export async function fetchQuotes(getToken, { dealId, skipCache = false } = {}) {
  if (dealId && !skipCache) {
    const cached = getCachedDealQuotes(dealId)
    if (cached) return cached
  }
  const qs = dealId ? `?dealId=${encodeURIComponent(dealId)}` : ''
  const res = await authFetch(getToken, `/quotes${qs}`)
  if (!res.ok) throw new Error('Failed to fetch quotes')
  const data = await parseJsonSafe(res)
  const quotes = data.quotes || []
  if (dealId) setCachedDealQuotes(dealId, quotes)
  return quotes
}

export async function fetchQuote(getToken, quoteId) {
  const res = await authFetch(getToken, `/quotes?quoteId=${encodeURIComponent(quoteId)}`)
  if (!res.ok) throw new Error('Failed to fetch quote')
  const data = await parseJsonSafe(res)
  return data.quote
}

export async function createQuote(getToken, payload) {
  const res = await authFetch(getToken, '/quotes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await parseJsonSafe(res)
    throw new Error(err.error || 'Failed to create quote')
  }
  const data = await parseJsonSafe(res)
  return data.quote
}

export async function updateQuote(getToken, quoteId, updates) {
  const res = await authFetch(getToken, '/quotes', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quoteId, ...updates }),
  })
  if (!res.ok) {
    const err = await parseJsonSafe(res)
    throw new Error(err.error || 'Failed to update quote')
  }
  const data = await parseJsonSafe(res)
  return data.quote
}

export async function deleteQuote(getToken, quoteId) {
  const res = await authFetch(getToken, '/quotes', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quoteId }),
  })
  if (!res.ok) {
    const err = await parseJsonSafe(res)
    throw new Error(err.error || 'Failed to delete quote')
  }
}

export async function sendQuoteEmail(getToken, { quoteId, recipientEmail, subject, message, recipientPhone, generateOnly = false, senderUid = null }) {
  const res = await authFetch(getToken, '/quotes-send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quoteId, recipientEmail, subject, message, recipientPhone, generateOnly, senderUid }),
  })
  if (!res.ok) {
    const err = await parseJsonSafe(res)
    throw new Error(err.error || 'Failed to send quote')
  }
  return parseJsonSafe(res)
}

// --- Public (no auth) ---

export async function fetchPublicQuote(token) {
  const res = await fetch(`${getApiBase()}/public-quote?token=${encodeURIComponent(token)}`)
  const data = await parseJsonSafe(res)
  if (!res.ok) throw Object.assign(new Error(data.error || 'Failed to load quote'), { status: res.status, data })
  return data
}

export async function respondToPublicQuote(token, { action, message, selectedOptionalIds, consent }) {
  const res = await fetch(`${getApiBase()}/public-quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, action, message, selectedOptionalIds, consent }),
  })
  const data = await parseJsonSafe(res)
  if (!res.ok) throw Object.assign(new Error(data.error || 'Failed to submit response'), { status: res.status, data })
  return data
}

export async function createQuoteCheckout(token) {
  const res = await fetch(`${getApiBase()}/public-quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, action: 'checkout' }),
  })
  const data = await parseJsonSafe(res)
  if (!res.ok) throw Object.assign(new Error(data.error || 'Failed to start checkout'), { status: res.status, data })
  return data
}

export function buildQuotePublicUrl(token) {
  return buildQuotePublicUrlFromToken(token)
}
