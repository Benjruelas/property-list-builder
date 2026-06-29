const DB_NAME = 'property_list_photos'
const DB_VERSION = 1
const JOBS = 'uploadJobs'
const BLOBS = 'blobs'

let dbPromise = null

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
      if (!db.objectStoreNames.contains(JOBS)) {
        db.createObjectStore(JOBS, { keyPath: 'jobId' })
      }
      if (!db.objectStoreNames.contains(BLOBS)) {
        db.createObjectStore(BLOBS, { keyPath: 'jobId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
  })
  return dbPromise
}

function runTx(storeNames, mode, fn) {
  return openDb().then((db) => {
    if (!db) return null
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames, mode)
      const stores = storeNames.map((name) => tx.objectStore(name))
      let result
      try {
        result = fn(...stores)
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

export async function saveJob(job) {
  await runTx([JOBS], 'readwrite', (store) => {
    store.put(job)
  })
}

export async function saveBlobs(jobId, { thumb, full }) {
  await runTx([BLOBS], 'readwrite', (store) => {
    store.put({ jobId, thumb, full })
  })
}

export async function getBlobs(jobId) {
  return runTx([BLOBS], 'readonly', (store) => requestToPromise(store.get(jobId)))
}

export async function deleteJob(jobId) {
  await runTx([JOBS, BLOBS], 'readwrite', (jobs, blobs) => {
    jobs.delete(jobId)
    blobs.delete(jobId)
  })
}

export async function loadAllJobs() {
  const rows = await runTx([JOBS], 'readonly', (store) => requestToPromise(store.getAll()))
  return rows || []
}

export async function updateJob(jobId, patch) {
  return runTx([JOBS], 'readwrite', (store) => {
    const getReq = store.get(jobId)
    getReq.onsuccess = () => {
      const existing = getReq.result
      if (!existing) return
      store.put({ ...existing, ...patch })
    }
  })
}
