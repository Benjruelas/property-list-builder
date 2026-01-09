/**
 * Get PMTiles URL for a specific county
 * 
 * In development: Directly constructs the PMTiles URL (blob is public)
 * In production: Attempts to use API, falls back to direct URL if API fails
 * 
 * @param {string} county - County name (e.g., 'tarrant', 'dallas')
 * @returns {Promise<{pmtilesUrl: string, layerName: string}|null>} PMTiles info or null if failed
 */
const BLOB_STORAGE_BASE = 'https://c26a6qe6znzs7fed.public.blob.vercel-storage.com'

// Use relative path in development (goes through vite proxy)
// Use current window location in production to ensure we're hitting the right deployment
const getApiBaseUrl = () => {
  if (import.meta.env.DEV) {
    return '/api'  // Will use vite proxy to localhost:3000
  }
  // In production, use the current origin to ensure we're hitting the right deployment
  if (typeof window !== 'undefined' && window.location) {
    return `${window.location.origin}/api`
  }
  // Fallback for SSR or if window is not available
  return import.meta.env.VITE_API_URL || 'https://property-list-builder.vercel.app/api'
}

/**
 * Directly construct PMTiles URL (for development or fallback)
 */
const getDirectPMTilesUrl = (county) => {
  const normalizedCounty = county.toLowerCase().replace(/\s+/g, '-')
  return `${BLOB_STORAGE_BASE}/${normalizedCounty}-county.pmtiles`
}

export const getCountyPMTilesUrl = async (county) => {
  // Since PMTiles are stored in public blob storage, we can use direct URLs
  // This avoids CORS issues and API calls entirely
  const pmtilesUrl = getDirectPMTilesUrl(county)
  console.log(`Using direct PMTiles URL for ${county}:`, pmtilesUrl)
  return {
    pmtilesUrl: pmtilesUrl,
    layerName: 'parcels'
  }
  
  // Note: If you want to use the API route in the future, uncomment below:
  /*
  // In production, try API first, fallback to direct URL
  // Get API URL dynamically each time to ensure we have the latest origin
  const apiBaseUrl = getApiBaseUrl()
  try {
    const url = `${apiBaseUrl}/parcels?county=${county}`
    console.log(`Fetching PMTiles URL from: ${url}`)
    const response = await fetch(url)
    
    if (response.ok) {
      const data = await response.json()
      
      // Validate response structure
      if (data && data.pmtilesUrl) {
        return {
          pmtilesUrl: data.pmtilesUrl,
          layerName: data.layerName || 'parcels'
        }
      }
    }
    
    // If API fails, fallback to direct URL
    console.warn(`API request failed (${response.status}), using direct PMTiles URL`)
    const pmtilesUrl = getDirectPMTilesUrl(county)
    return {
      pmtilesUrl: pmtilesUrl,
      layerName: 'parcels'
    }
  } catch (error) {
    // If fetch fails (network error, CORS, etc.), use direct URL
    console.warn(`Error fetching from API, using direct PMTiles URL:`, error.message)
    const pmtilesUrl = getDirectPMTilesUrl(county)
    return {
      pmtilesUrl: pmtilesUrl,
      layerName: 'parcels'
    }
  }
  */
}


