/**
 * User data sync - load/save deal pipeline, leads, tasks, parcel notes, skip traced, etc.
 * Syncs to API (Vercel KV) when signed in. Reads from localStorage; merges server data on sign-in.
 */

const getApiBase = () => {
  if (import.meta.env.DEV) return '/api'
  if (typeof window !== 'undefined') return `${window.location.origin}/api`
  return import.meta.env.VITE_API_URL || ''
}

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
  skip_trace_jobs: 'skipTraceJobs',
  skip_traced_list: 'skipTracedList',
  app_settings: 'appSettings'
}

const BLOB_TO_LS = Object.fromEntries(
  Object.entries(LS_TO_BLOB).map(([k, v]) => [v, k])
)

/** sessionStorage key: last uid whose synced blob was applied (detect account switches). */
const USER_DATA_BLOB_UID_SESSION_KEY = '__userData_blob_uid'

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
  }
  sessionStorage.setItem(USER_DATA_BLOB_UID_SESSION_KEY, uid)
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

/** Write blob to localStorage (merge: only overwrite keys present in blob) */
function mergeBlobToLocal(blob) {
  if (!blob || typeof blob !== 'object') return
  for (const [blobKey, value] of Object.entries(blob)) {
    const lsKey = BLOB_TO_LS[blobKey]
    if (!lsKey) continue
    try {
      if (value === undefined || value === null) continue
      if (blobKey === 'dealPipelineTitle') {
        localStorage.setItem(lsKey, String(value))
      } else {
        localStorage.setItem(lsKey, JSON.stringify(value))
      }
    } catch (e) {
      console.warn('userDataSync: failed to merge key', blobKey, e)
    }
  }
}

/**
 * Load user data from API and merge into localStorage (overwrite existing keys).
 * @param {() => Promise<string|null>} getToken - Returns Firebase ID token
 * @returns {Promise<Object>} The loaded blob
 */
export async function loadUserData(getToken) {
  const token = await getToken()
  if (!token) return {}
  try {
    const res = await fetch(`${getApiBase()}/user-data`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const { data } = await res.json()
    if (data && typeof data === 'object') {
      mergeBlobToLocal(data)
      return data
    }
    return {}
  } catch (e) {
    console.warn('loadUserData failed:', e.message)
    return {}
  }
}

/**
 * Save user data blob to API (PATCH - merge). Used internally by scheduleUserDataSync.
 * @param {() => Promise<string|null>} getToken - Returns Firebase ID token
 * @param {Object} data - Partial blob to merge
 */
export async function saveUserData(getToken, data) {
  const token = await getToken()
  if (!token) return
  if (!data || typeof data !== 'object') return
  try {
    const res = await fetch(`${getApiBase()}/user-data`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(data)
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch (e) {
    console.warn('saveUserData failed:', e.message)
  }
}

let debounceTimer = null
const DEBOUNCE_MS = 1500

/**
 * Schedule a debounced sync of current localStorage to API.
 * Call this after any local save (saveLeads, saveColumns, saveParcelNote, etc.).
 * @param {() => Promise<string|null>} getToken - Returns Firebase ID token
 */
export function scheduleUserDataSync(getToken) {
  if (!getToken) return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    const blob = readLocalBlob()
    saveUserData(getToken, blob)
  }, DEBOUNCE_MS)
}
