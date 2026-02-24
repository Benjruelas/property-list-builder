/**
 * Utility functions for skip tracing parcels via BatchData API (or SkipSherpa/Tracerfy if enabled)
 * 
 * Note: This is a client-side utility. The actual API call should be made
 * via a serverless function to keep the API key secure.
 * 
 * To use BatchData (default), set BATCHDATA_CLIENT_ID and BATCHDATA_CLIENT_SECRET (OAuth 2.0) or BATCHDATA_API_KEY
 * To use SkipSherpa (disabled), set SKIPSHERPA_API_KEY and enable USE_SKIPSHERPA=true
 * To use Tracerfy (disabled), set TRACERFY_API_KEY and enable USE_TRACERFY=true
 */

// Configuration: Set to 'batchdata', 'sherpa', or 'tracerfy' (default: 'batchdata')
const SKIP_TRACE_PROVIDER = import.meta.env.VITE_SKIP_TRACE_PROVIDER || 'batchdata'

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
 * Skip trace a single parcel or multiple parcels
 * @param {Array} parcels - Array of { parcelId, address, ownerName }
 * @returns {Promise} Result with job ID (async)
 */
export const skipTraceParcels = async (parcels) => {
  try {
    // Use BatchData by default, or SkipSherpa/Tracerfy if enabled
    let endpoint
    if (SKIP_TRACE_PROVIDER === 'tracerfy') {
      endpoint = `${API_BASE_URL}/skip-trace`
    } else if (SKIP_TRACE_PROVIDER === 'sherpa') {
      endpoint = `${API_BASE_URL}/skip-trace-sherpa`
    } else {
      endpoint = `${API_BASE_URL}/skip-trace-batchdata`
    }
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ parcels })
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(error.error || `HTTP ${response.status}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    console.error('Skip trace error:', error)
    throw error
  }
}

/**
 * Poll for skip trace job results
 * @param {string} jobId - Job ID from skipTraceParcels
 * @returns {Promise} Job status and results if complete
 */
export const pollSkipTraceJob = async (jobId) => {
  try {
    // Use BatchData by default, or SkipSherpa/Tracerfy if enabled
    let endpoint
    if (SKIP_TRACE_PROVIDER === 'tracerfy') {
      endpoint = `${API_BASE_URL}/skip-trace-status`
    } else if (SKIP_TRACE_PROVIDER === 'sherpa') {
      endpoint = `${API_BASE_URL}/skip-trace-status-sherpa`
    } else {
      endpoint = `${API_BASE_URL}/skip-trace-status-batchdata`
    }
    
    const response = await fetch(`${endpoint}?jobId=${encodeURIComponent(jobId)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(error.error || `HTTP ${response.status}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    console.error('Poll skip trace error:', error)
    throw error
  }
}

/**
 * Poll for results with retries
 * @param {string} jobId - Job ID
 * @param {number} maxRetries - Maximum number of polling attempts (default: 30)
 * @param {number} interval - Polling interval in milliseconds (default: 5000 = 5 seconds)
 * @returns {Promise} Results when complete
 */
export const pollSkipTraceJobUntilComplete = async (jobId, maxRetries = 30, interval = 5000) => {
  // For synchronous jobs (jobId === 'sync'), don't poll - results are already returned
  if (jobId === 'sync') {
    console.log(`✅ Synchronous job (jobId: ${jobId}) - results already returned, skipping poll`)
    return []
  }
  
  console.log(`🔄 Starting polling for job ${jobId} (max ${maxRetries} attempts, ${interval}ms interval)`)
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`🔄 Poll attempt ${attempt + 1}/${maxRetries} for job ${jobId}`)
      const status = await pollSkipTraceJob(jobId)
      
      console.log(`📊 Poll response:`, { status: status.status, resultsCount: status.results?.length || 0, hasResults: !!status.results })
      
      if (status.status === 'completed') {
        const results = status.results || []
        console.log(`✅ Job completed with ${results.length} results`)
        
        // If status is completed but results is empty, this might be a valid case (no contact info found)
        // But we should still return the empty array rather than throwing an error
        if (results.length === 0) {
          console.warn(`⚠️ Job marked as completed but no results returned. This may mean no contact information was found.`)
        }
        
        return results
      }
      
      if (status.status === 'processing' || status.status === 'pending') {
        console.log(`⏳ Job still ${status.status}, waiting ${interval}ms before next poll...`)
      }
      
      // Wait before next poll
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, interval))
      }
    } catch (error) {
      console.error(`❌ Poll attempt ${attempt + 1} failed:`, error)
      
      // On mobile, network errors might be more common - retry with exponential backoff
      if (attempt < maxRetries - 1) {
        const backoffDelay = Math.min(interval * Math.pow(1.5, attempt), 30000) // Max 30s backoff
        console.log(`⏸️ Waiting ${backoffDelay}ms before retry (exponential backoff)`)
        await new Promise(resolve => setTimeout(resolve, backoffDelay))
      } else {
        // Last attempt failed
        throw error
      }
    }
  }
  
  throw new Error('Skip trace job timed out')
}

/**
 * Get skip traced parcel data from storage (migrates old format to phoneDetails/emailDetails)
 * @param {string} parcelId - Parcel ID
 * @returns {Object|null} Skip traced parcel data or null
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
    return { value, verified: prev.verified ?? null, primary: prev.primary ?? (!hasPrimary && i === 0) }
  })
}

/**
 * Save skip traced parcel data to storage (global list)
 * @param {string} parcelId - Parcel ID
 * @param {Object} contactInfo - Contact information { phone, email, phoneNumbers, emails, address, skipTracedAt, phoneDetails, emailDetails }
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

    skipTracedParcels[parcelId] = {
      phone: primaryPhone?.value || phoneNumbers[0] || null,
      email: primaryEmail?.value || emails[0] || null,
      phoneNumbers,
      emails,
      phoneDetails,
      emailDetails,
      address: contactInfo.address || null,
      skipTracedAt: contactInfo.skipTracedAt || new Date().toISOString()
    }

    localStorage.setItem('skip_traced_parcels', JSON.stringify(skipTracedParcels))
    console.log('💾 Saved skip traced parcel:', parcelId, skipTracedParcels[parcelId])
  } catch (error) {
    console.error('Error saving skip traced parcel:', error)
  }
}

/**
 * Replace full phone or email details (for add/remove). Preserves verified/callerId from existing.
 * @param {string} parcelId - Parcel ID
 * @param {'phone'|'email'} type - Contact type
 * @param {Array<{value:string,verified?,callerId?,primary?}>} newDetails - New details array
 */
export const updateSkipTracedContacts = (parcelId, type, newDetails) => {
  const data = getSkipTracedParcel(parcelId)
  if (!data) return

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
      callerId: type === 'phone' ? (base.callerId ?? prev.callerId ?? '') : undefined,
      primary: base.primary ?? prev.primary ?? (i === 0)
    }
  })
  const hasPrimary = merged.some(d => d.primary)
  if (merged.length && !hasPrimary) merged[0] = { ...merged[0], primary: true }

  saveSkipTracedParcel(parcelId, {
    ...data,
    phoneDetails: type === 'phone' ? merged : (data.phoneDetails || toPhoneDetails(data.phoneNumbers || [], null)),
    emailDetails: type === 'email' ? merged : (data.emailDetails || toEmailDetails(data.emails || [], null))
  })
}

/**
 * Update contact metadata (verified, callerId, primary) for a single phone or email
 * @param {string} parcelId - Parcel ID
 * @param {'phone'|'email'} type - Contact type
 * @param {string} value - The phone/email value to update
 * @param {{ verified?: 'good'|'bad'|null, callerId?: string, primary?: boolean }} meta - Metadata to set
 */
export const updateContactMeta = (parcelId, type, value, meta) => {
  const data = getSkipTracedParcel(parcelId)
  if (!data) return

  const details = type === 'phone' ? (data.phoneDetails || toPhoneDetails(data.phoneNumbers || [], null)) : (data.emailDetails || toEmailDetails(data.emails || [], null))
  const idx = details.findIndex(d => String(d.value).trim() === String(value).trim())
  if (idx < 0) return

  const updated = details.map(d => ({ ...d, primary: d.primary ?? false }))
  if (meta.verified !== undefined) updated[idx] = { ...updated[idx], verified: meta.verified }
  if (meta.callerId !== undefined && type === 'phone') updated[idx] = { ...updated[idx], callerId: meta.callerId }
  if (meta.primary === true) {
    updated.forEach((u, i) => { updated[i] = { ...u, primary: i === idx } })
  } else if (meta.primary === false) {
    updated[idx] = { ...updated[idx], primary: false }
    if (!updated.some(u => u.primary) && updated.length > 0) {
      updated[0] = { ...updated[0], primary: true }
    }
  }

  saveSkipTracedParcel(parcelId, {
    ...data,
    phoneDetails: type === 'phone' ? updated : (data.phoneDetails || toPhoneDetails(data.phoneNumbers || [], null)),
    emailDetails: type === 'email' ? updated : (data.emailDetails || toEmailDetails(data.emails || [], null))
  })
}

/**
 * Save multiple skip traced parcels at once
 * @param {Array} results - Array of { parcelId, phone, email, phoneNumbers, emails, address, skipTracedAt }
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
    console.log(`💾 Saved ${results.length} skip traced parcels`)
  } catch (error) {
    console.error('Error saving skip traced parcels:', error)
  }
}

/**
 * Check if a parcel has been skip traced
 * @param {string} parcelId - Parcel ID
 * @returns {boolean} True if parcel has been skip traced
 */
export const isParcelSkipTraced = (parcelId) => {
  return getSkipTracedParcel(parcelId) !== null
}

/**
 * Get all skip traced parcels (global list)
 * @returns {Object} Object mapping parcelId to contact info
 */
export const getAllSkipTracedParcels = () => {
  try {
    const stored = localStorage.getItem('skip_traced_parcels')
    return stored ? JSON.parse(stored) : {}
  } catch (error) {
    console.error('Error getting all skip traced parcels:', error)
    return {}
  }
}
