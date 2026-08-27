/**
 * Client helpers for iOS Home Screen Google OAuth handoff via Safari.
 *
 * Opens accounts.google.com (not a same-origin KnockScout URL) so iOS does not
 * reclaim the window into the standalone PWA before Google finishes.
 */

import { resolveApiUrl } from './apiBase'

const STORAGE_KEY = 'knockscout.googleHandoff.v1'
export const HANDOFF_POLL_MS = 2000
export const HANDOFF_TIMEOUT_MS = 5 * 60 * 1000

function storageBackends() {
  const list = []
  try {
    if (typeof sessionStorage !== 'undefined') list.push(sessionStorage)
  } catch {
    /* ignore */
  }
  try {
    if (typeof localStorage !== 'undefined') list.push(localStorage)
  } catch {
    /* ignore */
  }
  return list
}

export function readStoredHandoff() {
  for (const store of storageBackends()) {
    try {
      const raw = store.getItem(STORAGE_KEY)
      if (!raw) continue
      const parsed = JSON.parse(raw)
      if (!parsed?.handoffId || !parsed?.pollToken) continue
      return parsed
    } catch {
      /* try next */
    }
  }
  return null
}

export function storeHandoff(session) {
  const payload = JSON.stringify({
    handoffId: session.handoffId,
    pollToken: session.pollToken,
    startedAt: session.startedAt || Date.now(),
    safariUrl: session.safariUrl || '',
  })
  for (const store of storageBackends()) {
    try {
      store.setItem(STORAGE_KEY, payload)
    } catch {
      /* ignore quota / private mode */
    }
  }
}

export function clearStoredHandoff() {
  for (const store of storageBackends()) {
    try {
      store.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }
}

/** @deprecated Prefer session.authUrl / session.safariUrl from startGoogleHandoff */
export function buildHandoffSafariUrl(handoffId, origin = window.location.origin) {
  const url = new URL('/auth/google-handoff', origin)
  url.searchParams.set('id', handoffId)
  return url.toString()
}

export async function startGoogleHandoff() {
  const res = await fetch(resolveApiUrl('/api/auth-google-handoff'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'start' }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || 'Unable to start Google sign-in.')
    err.code = 'handoff/start-failed'
    throw err
  }
  if (!data.authUrl) {
    const err = new Error('Google sign-in did not return an authorization URL.')
    err.code = 'handoff/start-failed'
    throw err
  }
  const session = {
    handoffId: data.handoffId,
    pollToken: data.pollToken,
    authUrl: data.authUrl,
    safariUrl: data.authUrl,
    startedAt: Date.now(),
  }
  storeHandoff(session)
  return session
}

export async function completeGoogleHandoff({ handoffId, idToken }) {
  const res = await fetch(resolveApiUrl('/api/auth-google-handoff'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'complete', handoffId, idToken }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || 'Unable to finish Google sign-in.')
    err.code = 'handoff/complete-failed'
    throw err
  }
  return data
}

export async function pollGoogleHandoffStatus({ handoffId, pollToken }) {
  const url = new URL(resolveApiUrl('/api/auth-google-handoff'))
  url.searchParams.set('handoffId', handoffId)
  url.searchParams.set('pollToken', pollToken)
  const res = await fetch(url.toString(), { method: 'GET' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || 'Unable to check Google sign-in.')
    err.code = 'handoff/status-failed'
    throw err
  }
  return data
}

/**
 * Poll until ready/expired/timeout. Calls onTick optionally.
 * Returns customToken string when ready.
 */
export async function waitForGoogleHandoffCustomToken(session, { signal, onTick } = {}) {
  const startedAt = session.startedAt || Date.now()
  while (true) {
    if (signal?.aborted) {
      const err = new Error('Google sign-in cancelled.')
      err.code = 'handoff/cancelled'
      throw err
    }
    if (Date.now() - startedAt > HANDOFF_TIMEOUT_MS) {
      clearStoredHandoff()
      const err = new Error('Google sign-in timed out. Try again.')
      err.code = 'handoff/timeout'
      throw err
    }

    const status = await pollGoogleHandoffStatus(session)
    onTick?.(status)
    if (status.status === 'ready' && status.customToken) {
      clearStoredHandoff()
      return status.customToken
    }
    if (status.status === 'expired') {
      clearStoredHandoff()
      const err = new Error('Google sign-in expired. Try again.')
      err.code = 'handoff/expired'
      throw err
    }

    await new Promise((resolve) => {
      const t = window.setTimeout(resolve, HANDOFF_POLL_MS)
      signal?.addEventListener('abort', () => {
        window.clearTimeout(t)
        resolve()
      }, { once: true })
    })
  }
}
