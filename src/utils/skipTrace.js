/**
 * Skip tracing via Trestle IQ (Reverse Address API).
 *
 * The Trestle endpoint is synchronous, so skipTraceParcels() always resolves
 * with `{ jobId: 'sync', async: false, results: [...] }`. pollSkipTraceJobUntilComplete()
 * is kept as a no-op for compatibility with existing async-polling call sites.
 *
 * The API key lives server-side as TRESTLE_API_KEY and is never exposed to the
 * browser — all calls go through /api/skip-trace.
 */

const getApiBaseUrl = () => {
  if (import.meta.env.DEV) {
    return '/api'
  }
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api`
  }
  return import.meta.env.VITE_API_URL || 'https://property-list-builder.vercel.app/api'
}

const API_BASE_URL = getApiBaseUrl()

/**
 * Skip trace one or more parcels.
 * @param {Array<{parcelId: string, address: string, ownerName?: string}>} parcels
 * @returns {Promise<{ success: boolean, jobId: 'sync', async: false, status: 'completed', results: Array }>}
 */
export const skipTraceParcels = async (parcels) => {
  try {
    const response = await fetch(`${API_BASE_URL}/skip-trace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parcels })
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(error.error || `HTTP ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Skip trace error:', error)
    throw error
  }
}

/**
 * Compatibility shim — Trestle is synchronous so jobs never need polling.
 * The existing App.jsx bulk flow handles sync results directly; this exists
 * so leftover async-polling call sites don't crash.
 */
export const pollSkipTraceJob = async () => ({ status: 'completed', results: [] })
export const pollSkipTraceJobUntilComplete = async () => []

/**
 * Get skip traced parcel data from storage (migrates old format to phoneDetails/emailDetails)
 */
export const getSkipTracedParcel = (parcelId) => {
  try {
    const stored = localStorage.getItem('skip_traced_parcels')
    if (!stored) return null

    const skipTracedParcels = JSON.parse(stored)
    const data = skipTracedParcels[parcelId]
    if (!data) return null

    if (!data.phoneDetails && (data.phoneNumbers?.length || data.phone)) {
      data.phoneDetails = toPhoneDetails(data.phoneNumbers || (data.phone ? [data.phone] : []), null)
    }
    if (!data.emailDetails && (data.emails?.length || data.email)) {
      data.emailDetails = toEmailDetails(data.emails || (data.email ? [data.email] : []), null)
    }
    return data
  } catch (error) {
    console.error('Error getting skip traced parcel:', error)
    return null
  }
}

/** Normalize contact info into details arrays with verified/callerId/primary */
const toPhoneDetails = (phones, existing) => {
  const byValue = new Map((existing || []).map(p => [p.value, p]))
  const arr = Array.isArray(phones) ? phones : (phones ? [phones] : [])
  const hasPrimary = (existing || []).some(d => d.primary)
  return arr.map((value, i) => {
    const prev = byValue.get(value) || {}
    return { value, verified: prev.verified ?? null, callerId: prev.callerId ?? '', primary: prev.primary ?? (!hasPrimary && i === 0) }
  })
}
const toEmailDetails = (emails, existing) => {
  const byValue = new Map((existing || []).map(e => [e.value, e]))
  const arr = Array.isArray(emails) ? emails : (emails ? [emails] : [])
  const hasPrimary = (existing || []).some(d => d.primary)
  return arr.map((value, i) => {
    const prev = byValue.get(value) || {}
    return { value, verified: prev.verified ?? null, callerId: prev.callerId ?? '', primary: prev.primary ?? (!hasPrimary && i === 0) }
  })
}

/**
 * Save skip traced parcel data to storage (global list).
 * Accepts phoneDetails/emailDetails with callerId from Trestle; preserves
 * any existing verified/callerId/primary flags when overwriting.
 */
export const saveSkipTracedParcel = (parcelId, contactInfo) => {
  try {
    const stored = localStorage.getItem('skip_traced_parcels')
    const skipTracedParcels = stored ? JSON.parse(stored) : {}
    const existing = skipTracedParcels[parcelId]

    const phoneDetails = contactInfo.phoneDetails ?? existing?.phoneDetails ?? toPhoneDetails(contactInfo.phoneNumbers || (contactInfo.phone ? [contactInfo.phone] : []), null)
    const emailDetails = contactInfo.emailDetails ?? existing?.emailDetails ?? toEmailDetails(contactInfo.emails || (contactInfo.email ? [contactInfo.email] : []), null)
    const phoneNumbers = phoneDetails.map(p => p.value)
    const emails = emailDetails.map(e => e.value)
    const primaryPhone = phoneDetails.find(p => p.primary) || phoneDetails[0]
    const primaryEmail = emailDetails.find(e => e.primary) || emailDetails[0]

    const preservedSkipTracedAt = 'skipTracedAt' in contactInfo
      ? contactInfo.skipTracedAt
      : (existing?.skipTracedAt || new Date().toISOString())

    skipTracedParcels[parcelId] = {
      phone: primaryPhone?.value || phoneNumbers[0] || null,
      email: primaryEmail?.value || emails[0] || null,
      phoneNumbers,
      emails,
      phoneDetails,
      emailDetails,
      address: contactInfo.address ?? existing?.address ?? null,
      skipTracedAt: preservedSkipTracedAt
    }

    localStorage.setItem('skip_traced_parcels', JSON.stringify(skipTracedParcels))
  } catch (error) {
    console.error('Error saving skip traced parcel:', error)
  }
}

/**
 * Replace full phone or email details (for add/remove). Preserves verified/callerId from existing.
 * If no skip-trace record exists yet, seeds one with skipTracedAt: null so the UI can still
 * distinguish "only manual contacts" from "was actually skip-traced".
 */
export const updateSkipTracedContacts = (parcelId, type, newDetails) => {
  if (!parcelId) return
  const data = getSkipTracedParcel(parcelId) || {
    phone: null,
    email: null,
    phoneNumbers: [],
    emails: [],
    phoneDetails: [],
    emailDetails: [],
    address: null,
    skipTracedAt: null
  }

  const existing = type === 'phone' ? (data.phoneDetails || toPhoneDetails(data.phoneNumbers || [], null)) : (data.emailDetails || toEmailDetails(data.emails || [], null))
  const byValue = new Map(existing.map(d => [String(d.value).trim().toLowerCase(), d]))

  const merged = (newDetails || []).map((d, i) => {
    const val = typeof d === 'string' ? d : (d.value ?? d)
    const key = String(val).trim().toLowerCase()
    const prev = byValue.get(key) || {}
    const base = typeof d === 'object' && d !== null ? d : { value: val }
    return {
      value: String(val).trim(),
      verified: base.verified ?? prev.verified ?? null,
      callerId: base.callerId ?? prev.callerId ?? '',
      primary: base.primary ?? prev.primary ?? (i === 0)
    }
  })
  const hasPrimary = merged.some(d => d.primary)
  if (merged.length && !hasPrimary) merged[0] = { ...merged[0], primary: true }

  saveSkipTracedParcel(parcelId, {
    ...data,
    phoneDetails: type === 'phone' ? merged : (data.phoneDetails || toPhoneDetails(data.phoneNumbers || [], null)),
    emailDetails: type === 'email' ? merged : (data.emailDetails || toEmailDetails(data.emails || [], null)),
    skipTracedAt: data.skipTracedAt ?? null
  })
}

/**
 * Update contact metadata (verified, callerId, primary) for a single phone or email.
 */
export const updateContactMeta = (parcelId, type, value, meta) => {
  const data = getSkipTracedParcel(parcelId)
  if (!data) return

  const details = type === 'phone' ? (data.phoneDetails || toPhoneDetails(data.phoneNumbers || [], null)) : (data.emailDetails || toEmailDetails(data.emails || [], null))
  const idx = details.findIndex(d => String(d.value).trim() === String(value).trim())
  if (idx < 0) return

  const updated = details.map(d => ({ ...d, primary: d.primary ?? false }))
  if (meta.verified !== undefined) updated[idx] = { ...updated[idx], verified: meta.verified }
  if (meta.callerId !== undefined) updated[idx] = { ...updated[idx], callerId: meta.callerId }
  if (meta.primary === true) {
    updated.forEach((u, i) => { updated[i] = { ...u, primary: i === idx } })
  } else if (meta.primary === false) {
    updated[idx] = { ...updated[idx], primary: false }
  }

  saveSkipTracedParcel(parcelId, {
    ...data,
    phoneDetails: type === 'phone' ? updated : (data.phoneDetails || toPhoneDetails(data.phoneNumbers || [], null)),
    emailDetails: type === 'email' ? updated : (data.emailDetails || toEmailDetails(data.emails || [], null))
  })
}

/**
 * Save multiple skip traced parcels at once. Preserves phoneDetails/emailDetails
 * (including callerId) when the caller supplies them.
 */
export const saveSkipTracedParcels = (results) => {
  try {
    const stored = localStorage.getItem('skip_traced_parcels')
    const skipTracedParcels = stored ? JSON.parse(stored) : {}

    results.forEach(result => {
      if (result.parcelId) {
        const existing = skipTracedParcels[result.parcelId]
        const phoneNumbers = result.phoneNumbers || (result.phone ? [result.phone] : [])
        const emails = result.emails || (result.email ? [result.email] : [])
        skipTracedParcels[result.parcelId] = {
          phone: result.phone || phoneNumbers[0] || null,
          email: result.email || emails[0] || null,
          phoneNumbers,
          emails,
          phoneDetails: result.phoneDetails || toPhoneDetails(phoneNumbers, existing?.phoneDetails),
          emailDetails: result.emailDetails || toEmailDetails(emails, existing?.emailDetails),
          address: result.address || null,
          skipTracedAt: result.skipTracedAt || new Date().toISOString()
        }
      }
    })

    localStorage.setItem('skip_traced_parcels', JSON.stringify(skipTracedParcels))
  } catch (error) {
    console.error('Error saving skip traced parcels:', error)
  }
}

export const isParcelSkipTraced = (parcelId) => {
  return getSkipTracedParcel(parcelId) !== null
}

/** Remove a single parcel's skip-trace record from localStorage. */
export const deleteSkipTracedParcel = (parcelId) => {
  if (!parcelId) return
  try {
    const stored = localStorage.getItem('skip_traced_parcels')
    if (!stored) return
    const skipTracedParcels = JSON.parse(stored)
    if (skipTracedParcels[parcelId] != null) {
      delete skipTracedParcels[parcelId]
      localStorage.setItem('skip_traced_parcels', JSON.stringify(skipTracedParcels))
    }
  } catch (error) {
    console.error('Error deleting skip traced parcel:', error)
  }
}

export const getAllSkipTracedParcels = () => {
  try {
    const stored = localStorage.getItem('skip_traced_parcels')
    return stored ? JSON.parse(stored) : {}
  } catch (error) {
    console.error('Error getting all skip traced parcels:', error)
    return {}
  }
}
