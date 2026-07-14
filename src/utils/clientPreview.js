/**
 * Mint owner preview links that open the public client-facing quote/report pages.
 */

export const CLIENT_PREVIEW_RETURN_KEY = 'clientPreviewReturnUrl'
export const CLIENT_PREVIEW_NAV_KEY = 'clientPreviewNavStack'
export const CLIENT_PREVIEW_RESTORE_FLAG = 'clientPreviewRestorePending'

import { getApiBase } from './apiBase'
import { getPublicRouteFromWindow, parsePublicRoute } from './publicLinks'

const PREVIEW_HANDOFF_KEYS = [
  CLIENT_PREVIEW_RETURN_KEY,
  CLIENT_PREVIEW_NAV_KEY,
  CLIENT_PREVIEW_RESTORE_FLAG,
]

function getSessionStorage() {
  if (typeof sessionStorage === 'undefined') return null
  return sessionStorage
}

function getLocalStorage() {
  if (typeof localStorage === 'undefined') return null
  return localStorage
}

function getStorageTargets(storageWindow = null) {
  const targets = []
  const session = getSessionStorage()
  const local = getLocalStorage()
  if (session) targets.push(session)
  if (local) targets.push(local)
  if (storageWindow?.sessionStorage) targets.push(storageWindow.sessionStorage)
  if (storageWindow?.localStorage) targets.push(storageWindow.localStorage)
  return targets
}

/** Write preview handoff data to both session and local storage for cross-tab restore. */
function writePreviewHandoff(key, value) {
  for (const storage of getStorageTargets()) {
    try {
      storage.setItem(key, value)
    } catch {
      /* ignore quota / serialization errors */
    }
  }
}

/** Read preview handoff data from session storage, then local storage. */
function readPreviewHandoff(key) {
  const session = getSessionStorage()
  if (session) {
    const value = session.getItem(key)
    if (value != null) return value
  }
  const local = getLocalStorage()
  if (local) {
    return local.getItem(key)
  }
  return null
}

function removePreviewHandoff(key) {
  for (const storage of getStorageTargets()) {
    try {
      storage.removeItem(key)
    } catch {
      /* ignore */
    }
  }
}

/** Clear all preview handoff keys from the current tab and optionally another window. */
export function clearClientPreviewHandoff(storageWindow = null) {
  for (const key of PREVIEW_HANDOFF_KEYS) {
    for (const storage of getStorageTargets(storageWindow)) {
      try {
        storage.removeItem(key)
      } catch {
        /* ignore */
      }
    }
  }
}

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
    return !!getPublicRouteFromWindow()
  } catch {
    return false
  }
}

/** Persist the navigation stack so it can be restored after a preview round trip. */
export function persistNavStack(navStack) {
  if (isPublicPreviewRoute()) return
  try {
    writePreviewHandoff(CLIENT_PREVIEW_NAV_KEY, JSON.stringify(navStack ?? []))
  } catch {
    /* ignore quota / serialization errors */
  }
}

/** Read the persisted navigation stack, or null when unavailable. */
export function readPersistedNavStack() {
  try {
    const raw = readPreviewHandoff(CLIENT_PREVIEW_NAV_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Read-and-clear the restore flag; true only after a preview was opened. */
export function consumeNavRestoreFlag() {
  const pending = readPreviewHandoff(CLIENT_PREVIEW_RESTORE_FLAG) === '1'
  if (pending) removePreviewHandoff(CLIENT_PREVIEW_RESTORE_FLAG)
  return pending
}

/** Remember where the user was before opening a client preview. */
export function markClientPreviewOpened() {
  const path = typeof window !== 'undefined'
    ? `${window.location.pathname}${window.location.search}${window.location.hash}`
    : '/'
  writePreviewHandoff(CLIENT_PREVIEW_RETURN_KEY, path)
  // Durable signal that survives the reload triggered by returnToAppFromClientPreview;
  // intentionally not cleared there so the app can restore nav state on next load.
  writePreviewHandoff(CLIENT_PREVIEW_RESTORE_FLAG, '1')
}

/** True only for owner "View as client" previews — not real client share links. */
export function shouldShowOwnerPreviewBack({ preview = false } = {}) {
  return preview === true
}

/** Leave the public quote/report page and restore the CRM session. */
export function returnToAppFromClientPreview() {
  if (typeof window === 'undefined') return

  // Prefer returning to the live app tab so React state, auth, and nav stack stay intact.
  // Keep opener handoff keys — if the background app tab was discarded and reloads on
  // focus, NavigationProvider needs CLIENT_PREVIEW_RESTORE_FLAG + nav stack to reopen
  // the report/quote the user was editing.
  try {
    const opener = window.opener
    if (opener && !opener.closed) {
      opener.focus()
      window.close()
      return
    }
  } catch {
    /* opener access blocked — fall through to stored return URL */
  }

  const stored = readPreviewHandoff(CLIENT_PREVIEW_RETURN_KEY)
  removePreviewHandoff(CLIENT_PREVIEW_RETURN_KEY)

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
  const parsed = parsePublicRoute(url.pathname, url.search)
  if (parsed?.type === 'quote' || parsed?.type === 'report') {
    url.pathname = '/'
    url.search = ''
    url.hash = ''
    window.location.href = url.toString()
    return
  }
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
      return true
    } catch {
      /* fall through to window.open */
    }
  }
  const opened = window.open(publicUrl, '_blank', 'noopener,noreferrer')
  return !!opened
}
