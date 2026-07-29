/**
 * Offline-aware API mutations for lists / leads / paths.
 * Queues failed/offline writes into IndexedDB and replays on reconnect.
 */

import { getApiBase } from './apiBase'
import {
  enqueueMutation,
  listMutations,
  removeMutation,
  updateMutation,
  newIdempotencyKey,
  newTempId,
  isNetworkFailure,
  isBrowserOffline,
  subscribeOutbox,
} from './offlineOutbox'
import { showToast } from '../components/ui/toast'

const replayListeners = new Set()
let flushInFlight = null
let getTokenRef = null
let onlineBound = false

export function setOutboxGetToken(getToken) {
  getTokenRef = getToken
  ensureOnlineListener()
}

export function subscribeOutboxReplay(fn) {
  replayListeners.add(fn)
  return () => replayListeners.delete(fn)
}

function emitReplay(event) {
  for (const fn of replayListeners) {
    try { fn(event) } catch { /* ignore */ }
  }
}

function ensureOnlineListener() {
  if (onlineBound || typeof window === 'undefined') return
  onlineBound = true
  window.addEventListener('online', () => {
    flushOutbox().catch(() => {})
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      flushOutbox().catch(() => {})
    }
  })
}

async function executeMutation(item, getToken) {
  const token = await getToken()
  if (!token) throw new Error('Sign in required')
  const path = item.endpoint.startsWith('/') ? item.endpoint : `/${item.endpoint}`
  const res = await fetch(`${getApiBase()}${path}`, {
    method: item.method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': item.idempotencyKey,
    },
    body: item.body != null ? JSON.stringify(item.body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const error = new Error(err.error || `HTTP ${res.status}`)
    error.status = res.status
    error.body = err
    throw error
  }
  if (res.status === 204) return null
  return res.json().catch(() => ({}))
}

/**
 * Perform a mutating API call, queueing when offline or on network failure.
 * @returns {Promise<{ queued: boolean, data?: any, tempId?: string, item?: object }>}
 */
export async function mutateOrQueue({
  endpoint,
  method,
  body,
  getToken,
  resource,
  tempId,
  optimistic,
  silentQueueToast = false,
}) {
  ensureOnlineListener()
  const idempotencyKey = newIdempotencyKey()
  const resolvedTempId = tempId || (optimistic ? newTempId(resource || 'temp') : null)
  const item = {
    endpoint,
    method,
    body,
    resource,
    tempId: resolvedTempId,
    idempotencyKey,
    meta: optimistic ? { optimistic } : null,
  }

  if (isBrowserOffline()) {
    const row = await enqueueMutation(item)
    if (!silentQueueToast) {
      showToast('Saved offline — will sync when you\'re back online', 'info', 3500)
    }
    emitReplay({ type: 'queued', item: row })
    return { queued: true, tempId: resolvedTempId, item: row, data: optimistic || null }
  }

  try {
    const data = await executeMutation(item, getToken)
    return { queued: false, data, tempId: resolvedTempId }
  } catch (err) {
    if (isNetworkFailure(err)) {
      const row = await enqueueMutation(item)
      if (!silentQueueToast) {
        showToast('Saved offline — will sync when you\'re back online', 'info', 3500)
      }
      emitReplay({ type: 'queued', item: row })
      return { queued: true, tempId: resolvedTempId, item: row, data: optimistic || null }
    }
    throw err
  }
}

export async function flushOutbox(getToken = getTokenRef) {
  if (!getToken) return { flushed: 0, failed: 0 }
  if (isBrowserOffline()) return { flushed: 0, failed: 0 }
  if (flushInFlight) return flushInFlight

  flushInFlight = (async () => {
    const items = await listMutations()
    let flushed = 0
    let failed = 0
    for (const item of items) {
      try {
        const data = await executeMutation(item, getToken)
        await removeMutation(item.id)
        flushed += 1
        emitReplay({ type: 'flushed', item, data })
      } catch (err) {
        if (isNetworkFailure(err)) {
          // Stop — still offline / flaky. Leave remaining items queued.
          break
        }
        // Permanent failure (4xx) — drop so we don't retry forever, surface error.
        failed += 1
        await updateMutation(item.id, {
          attempts: (item.attempts || 0) + 1,
          lastError: err.message || 'Failed',
        })
        // After 5 hard failures, drop the item.
        if ((item.attempts || 0) + 1 >= 5) {
          await removeMutation(item.id)
          emitReplay({ type: 'dropped', item, error: err })
        } else {
          emitReplay({ type: 'failed', item, error: err })
        }
      }
    }
    if (flushed > 0) {
      showToast(
        flushed === 1 ? 'Synced 1 offline change' : `Synced ${flushed} offline changes`,
        'success',
        2500,
      )
      emitReplay({ type: 'sync-complete', flushed, failed })
    }
    return { flushed, failed }
  })()

  try {
    return await flushInFlight
  } finally {
    flushInFlight = null
  }
}

export { subscribeOutbox, listMutations, getQueuedCount } from './offlineOutbox'
export { newTempId }
