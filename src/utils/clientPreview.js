/**
 * Mint owner preview links that open the public client-facing quote/report pages.
 */

export const CLIENT_PREVIEW_RETURN_KEY = 'clientPreviewReturnUrl'
export const CLIENT_PREVIEW_NAV_KEY = 'clientPreviewNavStack'
export const CLIENT_PREVIEW_RESTORE_FLAG = 'clientPreviewRestorePending'

import { getApiBase } from './apiBase'

async function parseJsonSafe(res) {
  try {
    return await res.json()
  } catch {
    return {}
  }
}

/**
 * True when the current URL renders a public preview/share page (report, quote, form)
 * rather than the CRM app — mirrors the routing in AppWithPublicFormRoute.
 */
export function isPublicPreviewRoute() {
  if (typeof window === 'undefined') return false
  try {
    const params = new URLSearchParams(window.location.search)
    return params.has('report') || params.has('quote') || params.has('form')
  } catch {
    return false
  }
}

/** Persist the navigation stack so it can be restored after a preview round trip. */
export function persistNavStack(navStack) {
  if (typeof sessionStorage === 'undefined') return
  if (isPublicPreviewRoute()) return
  try {
    sessionStorage.setItem(CLIENT_PREVIEW_NAV_KEY, JSON.stringify(navStack ?? []))
  } catch {
    /* ignore quota / serialization errors */
  }
}

/** Read the persisted navigation stack, or null when unavailable. */
export function readPersistedNavStack() {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(CLIENT_PREVIEW_NAV_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Read-and-clear the restore flag; true only after a preview was opened. */
export function consumeNavRestoreFlag() {
  if (typeof sessionStorage === 'undefined') return false
  const pending = sessionStorage.getItem(CLIENT_PREVIEW_RESTORE_FLAG) === '1'
  if (pending) sessionStorage.removeItem(CLIENT_PREVIEW_RESTORE_FLAG)
  return pending
}

/** Remember where the user was before opening a client preview. */
export function markClientPreviewOpened() {
  if (typeof sessionStorage === 'undefined') return
  const path = typeof window !== 'undefined'
    ? `${window.location.pathname}${window.location.search}${window.location.hash}`
    : '/'
  sessionStorage.setItem(CLIENT_PREVIEW_RETURN_KEY, path)
  // Durable signal that survives the reload triggered by returnToAppFromClientPreview;
  // intentionally not cleared there so the app can restore nav state on next load.
  sessionStorage.setItem(CLIENT_PREVIEW_RESTORE_FLAG, '1')
}

/** True only for owner "View as client" previews — not real client share links. */
export function shouldShowOwnerPreviewBack({ preview = false } = {}) {
  return preview === true
}

/** Leave the public quote/report page and restore the CRM session. */
export function returnToAppFromClientPreview() {
  if (typeof window === 'undefined') return

  const stored = sessionStorage.getItem(CLIENT_PREVIEW_RETURN_KEY)
  sessionStorage.removeItem(CLIENT_PREVIEW_RETURN_KEY)

  if (stored) {
    try {
      const storedUrl = new URL(stored, window.location.origin)
      const current = new URL(window.location.href)
      if (storedUrl.href !== current.href) {
        window.location.href = storedUrl.pathname + storedUrl.search + storedUrl.hash
        return
      }
    } catch {
      /* fall through */
    }
  }

  const url = new URL(window.location.href)
  url.searchParams.delete('quote')
  url.searchParams.delete('report')
  url.searchParams.delete('payment')
  const next = url.pathname + url.search + url.hash
  window.location.href = next && next !== '?' ? next : '/'
}

/**
 * @param {() => Promise<string|null>} getToken
 * @param {{ type: 'quote' | 'report', id: string }} params
 * @returns {Promise<string>} publicUrl
 */
export async function fetchClientPreviewUrl(getToken, { type, id }) {
  const token = await getToken?.()
  if (!token) throw new Error('Sign in required')
  if (!type || !id) throw new Error('type and id are required')

  const res = await fetch(`${getApiBase()}/client-preview-link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ type, id }),
  })
  const data = await parseJsonSafe(res)
  if (!res.ok) throw new Error(data.error || 'Failed to create preview link')
  if (!data.publicUrl) throw new Error('Preview link missing from response')
  return data.publicUrl
}

/** Open a blank tab synchronously during the user click (before any await). */
export function prepareClientPreviewTab() {
  if (typeof window === 'undefined') return null
  markClientPreviewOpened()
  // Do not pass noopener — the opener must navigate this tab after async work.
  return window.open('about:blank', '_blank')
}

export function closeClientPreviewTab(previewWindow) {
  try {
    previewWindow?.close()
  } catch {
    /* ignore */
  }
}

export function openClientPreviewUrl(publicUrl, previewWindow = null) {
  if (!publicUrl || typeof window === 'undefined') return false
  markClientPreviewOpened()
  if (previewWindow && !previewWindow.closed) {
    try {
      previewWindow.location.href = publicUrl
      try {
        previewWindow.opener = null
      } catch {
        /* ignore */
      }
      return true
    } catch {
      /* fall through to window.open */
    }
  }
  const opened = window.open(publicUrl, '_blank', 'noopener,noreferrer')
  return !!opened
}
