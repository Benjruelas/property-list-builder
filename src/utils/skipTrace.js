/**
 * Utility functions for skip tracing parcels via Tracerfy API
 * 
 * Note: This is a client-side utility. The actual API call should be made
 * via a serverless function to keep the API key secure.
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
 * Skip trace a single parcel or multiple parcels
 * @param {Array} parcels - Array of { parcelId, address, ownerName }
 * @returns {Promise} Result with job ID (async)
 */
export const skipTraceParcels = async (parcels) => {
  try {
    const response = await fetch(`${API_BASE_URL}/skip-trace`, {
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
    const response = await fetch(`${API_BASE_URL}/skip-trace-status?jobId=${encodeURIComponent(jobId)}`, {
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
 * Get skip traced parcel data from storage
 * @param {string} parcelId - Parcel ID
 * @returns {Object|null} Skip traced parcel data or null
 */
export const getSkipTracedParcel = (parcelId) => {
  try {
    const stored = localStorage.getItem('skip_traced_parcels')
    if (!stored) return null
    
    const skipTracedParcels = JSON.parse(stored)
    return skipTracedParcels[parcelId] || null
  } catch (error) {
    console.error('Error getting skip traced parcel:', error)
    return null
  }
}

/**
 * Save skip traced parcel data to storage (global list)
 * @param {string} parcelId - Parcel ID
 * @param {Object} contactInfo - Contact information { phone, email, phoneNumbers, emails, address, skipTracedAt }
 */
export const saveSkipTracedParcel = (parcelId, contactInfo) => {
  try {
    const stored = localStorage.getItem('skip_traced_parcels')
    const skipTracedParcels = stored ? JSON.parse(stored) : {}
    
    skipTracedParcels[parcelId] = {
      phone: contactInfo.phone || null,
      email: contactInfo.email || null,
      phoneNumbers: contactInfo.phoneNumbers || (contactInfo.phone ? [contactInfo.phone] : []),
      emails: contactInfo.emails || (contactInfo.email ? [contactInfo.email] : []),
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
 * Save multiple skip traced parcels at once
 * @param {Array} results - Array of { parcelId, phone, email, phoneNumbers, emails, address, skipTracedAt }
 */
export const saveSkipTracedParcels = (results) => {
  try {
    const stored = localStorage.getItem('skip_traced_parcels')
    const skipTracedParcels = stored ? JSON.parse(stored) : {}
    
    results.forEach(result => {
      if (result.parcelId) {
        skipTracedParcels[result.parcelId] = {
          phone: result.phone || null,
          email: result.email || null,
          phoneNumbers: result.phoneNumbers || (result.phone ? [result.phone] : []),
          emails: result.emails || (result.email ? [result.email] : []),
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
