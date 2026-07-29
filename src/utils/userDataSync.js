/**
 * User data sync - load/save deal pipeline, leads, tasks, parcel notes, skip traced, etc.
 * Syncs to API (Vercel KV) when signed in. Reads from localStorage; merges server data on sign-in.
 */

import { getApiBase } from './apiBase'
import { clearLocalLeadsCache, setLocalLeadsUid } from './leads'
import { resetPipelinesListEtag } from './pipelines'

/** localStorage key -> blob key mapping */
const LS_TO_BLOB = {
  deal_pipeline_columns: 'dealPipelineColumns',
  deal_pipeline_leads: 'dealPipelineLeads',
  deal_pipeline_title: 'dealPipelineTitle',
  lead_tasks: 'leadTasks',
  parcel_notes: 'parcelNotes',
  skip_traced_parcels: 'skipTracedParcels',
  email_templates: 'emailTemplates',
  text_templates: 'textTemplates',
  deal_templates: 'dealTemplates',
  skip_trace_jobs: 'skipTraceJobs',
  skip_traced_list: 'skipTracedList',
  app_settings: 'appSettings',
  closed_leads: 'closedLeads'
}

const BLOB_TO_LS = Object.fromEntries(
  Object.entries(LS_TO_BLOB).map(([k, v]) => [v, k])
)

/** sessionStorage key: last uid whose synced blob was applied (detect account switches). */
const USER_DATA_BLOB_UID_SESSION_KEY = '__userData_blob_uid'

const MAX_CONFLICT_RETRIES = 3

/** Remove all keys that sync to the server user-data blob (deal pipeline, tasks, notes, etc.). */
function clearLocalBlobKeys() {
  for (const lsKey of Object.keys(LS_TO_BLOB)) {
    try {
      localStorage.removeItem(lsKey)
    } catch {
      /* ignore */
    }
  }
}

/**
 * Call when a signed-in user's uid is known (e.g. useLayoutEffect on currentUser.uid).
 * Clears synced localStorage when switching accounts so the previous user's data does not leak.
 */
export function syncLocalBlobStorageIfUserChanged(uid) {
  if (typeof window === 'undefined' || !uid) return
  const prev = sessionStorage.getItem(USER_DATA_BLOB_UID_SESSION_KEY)
  if (prev != null && prev !== uid) {
    clearLocalBlobKeys()
    clearLocalLeadsCache()
    resetPipelinesListEtag()
  }
  sessionStorage.setItem(USER_DATA_BLOB_UID_SESSION_KEY, uid)
  setLocalLeadsUid(uid)
}

/** Read current localStorage into blob format */
export function readLocalBlob() {
  const blob = {}
  for (const [lsKey, blobKey] of Object.entries(LS_TO_BLOB)) {
    try {
      const raw = localStorage.getItem(lsKey)
      if (raw != null) {
        if (blobKey === 'dealPipelineTitle') {
          blob[blobKey] = raw
        } else {
          blob[blobKey] = JSON.parse(raw)
        }
      }
    } catch {
      // Skip invalid entries
    }
  }
  return blob
}

let quotaWarned = false

function isQuotaError(e) {
  return e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014)
}

function writeBlobKeyToLocal(blobKey, value) {
  const lsKey = BLOB_TO_LS[blobKey]
  if (!lsKey) return
  if (value === undefined || value === null) return
  try {
    if (blobKey === 'dealPipelineTitle') {
      localStorage.setItem(lsKey, String(value))
    } else {
      localStorage.setItem(lsKey, JSON.stringify(value))
    }
  } catch (e) {
    console.warn('userDataSync: failed to merge key', blobKey, e)
    if (isQuotaError(e) && !quotaWarned) {
      quotaWarned = true
      import('../components/ui/toast')
        .then(({ showToast }) => showToast(
          'Device storage is full — some offline data may not be saved locally. Your data is still synced to your account.',
          'warning'
        ))
        .catch(() => {})
    }
  }
}

/** Write blob to localStorage (merge: only overwrite keys present in blob) */
function mergeBlobToLocal(blob) {
  if (!blob || typeof blob !== 'object') return
  for (const [blobKey, value] of Object.entries(blob)) {
    writeBlobKeyToLocal(blobKey, value)
  }
}

/**
 * 3-way merge on version conflict: keep local edits, adopt server values for
 * keys we have not changed since our last known sync snapshot.
 */
function mergeConflictKeepingLocalEdits(serverBlob) {
  if (!serverBlob || typeof serverBlob !== 'object') return
  const local = readLocalBlob()
  for (const [blobKey, serverValue] of Object.entries(serverBlob)) {
    if (!BLOB_TO_LS[blobKey]) continue
    let localSerialized
    try {
      localSerialized = local[blobKey] === undefined ? undefined : JSON.stringify(local[blobKey])
    } catch {
      continue
    }
    const lastKnown = lastSyncedSnapshot[blobKey]
    // Unchanged locally since last sync → safe to take server's value.
    if (localSerialized === lastKnown) {
      writeBlobKeyToLocal(blobKey, serverValue)
    }
  }
  lastSyncedSnapshot = snapshotFromBlob(serverBlob)
}

/** Server data version (for optimistic concurrency) and last-synced snapshot for delta computation. */
let serverVersion = 0
/** blobKey -> JSON string of the last value we know the server has. */
let lastSyncedSnapshot = {}
/** True after the first successful loadUserData for this session (or empty load). */
let initialLoadDone = false
/** True while the initial GET is in flight. */
let loadInFlight = false
/** Serialize PATCH requests so concurrent tabs/timers don't share a stale baseVersion. */
let saveChain = Promise.resolve()

function snapshotFromBlob(blob) {
  const snap = {}
  for (const [k, v] of Object.entries(blob || {})) {
    if (k === '__version') continue
    try { snap[k] = JSON.stringify(v) } catch { /* ignore */ }
  }
  return snap
}

/**
 * Load user data from API and merge into localStorage (overwrite existing keys).
 * @param {() => Promise<string|null>} getToken - Returns Firebase ID token
 * @returns {Promise<Object>} The loaded blob
 */
export async function loadUserData(getToken) {
  const token = await getToken()
  if (!token) {
    initialLoadDone = true
    return {}
  }
  loadInFlight = true
  try {
    const res = await fetch(`${getApiBase()}/user-data`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const { data, version } = await res.json()
    serverVersion = Number(version) || 0
    if (data && typeof data === 'object') {
      mergeBlobToLocal(data)
      lastSyncedSnapshot = snapshotFromBlob(data)
    } else {
      lastSyncedSnapshot = {}
    }
    initialLoadDone = true
    // Push any local-only keys that still differ after the server merge.
    const delta = computeDelta()
    if (Object.keys(delta).length > 0) {
      saveUserData(getToken, delta)
    }
    return data && typeof data === 'object' ? data : {}
  } catch (e) {
    console.warn('loadUserData failed:', e.message)
    initialLoadDone = true
    return {}
  } finally {
    loadInFlight = false
  }
}

async function patchUserData(getToken, data) {
  const token = await getToken()
  if (!token) return { ok: false, skipped: true }
  const res = await fetch(`${getApiBase()}/user-data`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ ...data, __baseVersion: serverVersion })
  })
  if (res.status === 409) {
    const conflict = await res.json().catch(() => ({}))
    return {
      ok: false,
      conflict: true,
      version: Number(conflict?.version) || serverVersion,
      data: conflict?.data,
    }
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json().catch(() => ({}))
  return {
    ok: true,
    version: Number(body?.version) || serverVersion,
    data: body?.data,
  }
}

/**
 * Save user data blob to API (PATCH - merge). Used internally by scheduleUserDataSync.
 * Only the provided keys are sent; the server merges them field-by-field.
 * Serializes concurrent saves and retries on version conflicts.
 * @param {() => Promise<string|null>} getToken - Returns Firebase ID token
 * @param {Object} data - Partial blob to merge
 */
export async function saveUserData(getToken, data) {
  if (!getToken) return
  if (!data || typeof data !== 'object') return

  const run = async () => {
    let pending = { ...data }
    for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES; attempt++) {
      if (Object.keys(pending).length === 0) return
      try {
        const result = await patchUserData(getToken, pending)
        if (result.skipped) return
        if (result.conflict) {
          serverVersion = result.version
          mergeConflictKeepingLocalEdits(result.data)
          // Recompute against the updated snapshot so we only retry real local edits.
          pending = computeDelta()
          continue
        }
        serverVersion = result.version
        for (const [k, v] of Object.entries(pending)) {
          try { lastSyncedSnapshot[k] = JSON.stringify(v) } catch { /* ignore */ }
        }
        return
      } catch (e) {
        console.warn('saveUserData failed:', e.message)
        // Signal OfflineStatusProvider when the failure looks like a dead zone.
        if (typeof window !== 'undefined' && /failed to fetch|networkerror|load failed|offline/i.test(e.message || '')) {
          try { window.dispatchEvent(new Event('offline-detected')) } catch { /* ignore */ }
        }
        return
      }
    }
    // Exhausted retries — next local edit will schedule another sync.
  }

  const queued = saveChain.then(run, run)
  // Keep the chain alive even if this save fails.
  saveChain = queued.catch(() => {})
  await queued
}

/** Compute only the blob keys whose value changed since the last successful sync. */
function computeDelta() {
  const blob = readLocalBlob()
  const delta = {}
  for (const [k, v] of Object.entries(blob)) {
    let serialized
    try { serialized = JSON.stringify(v) } catch { continue }
    if (lastSyncedSnapshot[k] !== serialized) delta[k] = v
  }
  return delta
}

let debounceTimer = null
const DEBOUNCE_MS = 1500

/**
 * Schedule a debounced, delta-only sync of localStorage to the API.
 * Call this after any local save (saveLeads, saveColumns, saveParcelNote, etc.).
 * @param {() => Promise<string|null>} getToken - Returns Firebase ID token
 */
export function scheduleUserDataSync(getToken) {
  if (!getToken) return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    // Avoid racing the initial GET with a PATCH that still thinks version is 0.
    if (!initialLoadDone) {
      if (loadInFlight) scheduleUserDataSync(getToken)
      return
    }
    const delta = computeDelta()
    if (Object.keys(delta).length === 0) return
    saveUserData(getToken, delta)
  }, DEBOUNCE_MS)
}
