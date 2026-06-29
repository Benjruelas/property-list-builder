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

function tx(store, mode) {
  return openDb().then((db) => {
    if (!db) return null
    return db.transaction(store, mode).objectStore(store)
  })
}

export async function saveJob(job) {
  const store = await tx(JOBS, 'readwrite')
  if (!store) return
  store.put(job)
}

export async function saveBlobs(jobId, { thumb, full }) {
  const store = await tx(BLOBS, 'readwrite')
  if (!store) return
  store.put({ jobId, thumb, full })
}

export async function getBlobs(jobId) {
  const store = await tx(BLOBS, 'readonly')
  if (!store) return null
  return new Promise((resolve, reject) => {
    const req = store.get(jobId)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

export async function deleteJob(jobId) {
  const jobs = await tx(JOBS, 'readwrite')
  const blobs = await tx(BLOBS, 'readwrite')
  if (!jobs || !blobs) return
  jobs.delete(jobId)
  blobs.delete(jobId)
}

export async function loadAllJobs() {
  const store = await tx(JOBS, 'readonly')
  if (!store) return []
  return new Promise((resolve, reject) => {
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

export async function updateJob(jobId, patch) {
  const store = await tx(JOBS, 'readwrite')
  if (!store) return null
  return new Promise((resolve, reject) => {
    const getReq = store.get(jobId)
    getReq.onsuccess = () => {
      const existing = getReq.result
      if (!existing) {
        resolve(null)
        return
      }
      const next = { ...existing, ...patch }
      store.put(next)
      resolve(next)
    }
    getReq.onerror = () => reject(getReq.error)
  })
}
