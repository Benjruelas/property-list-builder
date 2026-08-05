/**
 * Client helpers for external Lead/Deal share links.
 */

import { getApiBase } from './apiBase'
import { buildResourceSharePublicUrl, getShareClaimTokenFromWindow } from './publicLinks'

const SHARE_TOKEN_STORAGE_KEY = 'ks_pending_resource_share'

export { buildResourceSharePublicUrl, getShareClaimTokenFromWindow }

export function persistShareClaimToken(token) {
  const t = String(token || '').trim()
  if (!t || typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(SHARE_TOKEN_STORAGE_KEY, t)
  } catch { /* ignore */ }
}

export function peekShareClaimToken() {
  if (typeof sessionStorage === 'undefined') return ''
  try {
    return String(sessionStorage.getItem(SHARE_TOKEN_STORAGE_KEY) || '').trim()
  } catch {
    return ''
  }
}

export function clearShareClaimToken() {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.removeItem(SHARE_TOKEN_STORAGE_KEY)
  } catch { /* ignore */ }
}

/** Prefer URL `?share=`, else sessionStorage (survives auth redirect). */
export function resolvePendingShareClaimToken() {
  const fromUrl = getShareClaimTokenFromWindow()
  if (fromUrl) {
    persistShareClaimToken(fromUrl)
    return fromUrl
  }
  return peekShareClaimToken()
}

export function clearShareQueryFromUrl() {
  if (typeof window === 'undefined') return
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('share')) return
    url.searchParams.delete('share')
    const next = `${url.pathname}${url.search}${url.hash}`
    window.history.replaceState({}, '', next)
  } catch { /* ignore */ }
}

async function authJson(getToken, path, body) {
  const token = await getToken?.()
  if (!token) throw new Error('Not signed in')
  const res = await fetch(`${getApiBase()}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body || {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

export async function createResourceShareLink(getToken, { type, leadId, dealId, pipelineId }) {
  return authJson(getToken, '/resource-share-links', {
    type,
    leadId,
    dealId,
    pipelineId,
  })
}

export async function claimResourceShare(getToken, token) {
  return authJson(getToken, '/resource-share-claim', { token })
}

export async function sendResourceShareEmail(getToken, payload) {
  return authJson(getToken, '/resource-share-send', payload)
}
