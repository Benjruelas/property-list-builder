/**
 * IndexedDB write outbox for offline CRUD (lists, leads, paths).
 * Items replay on 'online' with Idempotency-Key so server never double-applies.
 */

const DB_NAME = 'knockscout_offline_outbox'
const DB_VERSION = 1
const STORE = 'mutations'

let dbPromise = null
const listeners = new Set()

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
  })
  return dbPromise
}

function runTx(mode, fn) {
  return openDb().then((db) => {
    if (!db) return null
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const store = tx.objectStore(STORE)
      let result
      try {
        result = fn(store)
      } catch (e) {
        reject(e)
        return
      }
      tx.oncomplete = () => resolve(result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  })
}

function requestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function newOutboxId() {
  return `outbox_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

export function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `idem_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`
}

export function newTempId(prefix = 'temp') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

/**
 * @param {{
 *   endpoint: string,
 *   method: string,
 *   body?: object,
 *   tempId?: string,
 *   idempotencyKey?: string,
 *   resource?: 'lists'|'leads'|'paths',
 *   meta?: object,
 * }} item
 */
export async function enqueueMutation(item) {
  const row = {
    id: item.id || newOutboxId(),
    endpoint: item.endpoint,
    method: String(item.method || 'POST').toUpperCase(),
    body: item.body ?? null,
    tempId: item.tempId || null,
    idempotencyKey: item.idempotencyKey || newIdempotencyKey(),
    resource: item.resource || null,
    meta: item.meta || null,
    createdAt: item.createdAt || Date.now(),
    attempts: item.attempts || 0,
    lastError: null,
  }
  await runTx('readwrite', (store) => {
    store.put(row)
  })
  notify()
  return row
}

export async function listMutations() {
  const rows = await runTx('readonly', (store) => requestToPromise(store.getAll()))
  const list = Array.isArray(rows) ? rows : []
  return list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
}

export async function getQueuedCount() {
  const rows = await listMutations()
  return rows.length
}

export async function removeMutation(id) {
  await runTx('readwrite', (store) => {
    store.delete(id)
  })
  notify()
}

export async function updateMutation(id, patch) {
  await runTx('readwrite', (store) => {
    const getReq = store.get(id)
    getReq.onsuccess = () => {
      const existing = getReq.result
      if (!existing) return
      store.put({ ...existing, ...patch })
    }
  })
  notify()
}

export function subscribeOutbox(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function notify() {
  listMutations()
    .then((rows) => {
      for (const fn of listeners) {
        try { fn(rows) } catch { /* ignore */ }
      }
    })
    .catch(() => {})
}

/** True for fetch failures that mean the request never reached the server. */
export function isNetworkFailure(err) {
  if (!err) return false
  if (err.name === 'TypeError') return true
  const msg = String(err.message || err)
  return /failed to fetch|networkerror|load failed|network request failed|offline/i.test(msg)
}

export function isBrowserOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}
