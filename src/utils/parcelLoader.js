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
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api`
  }
  // Fallback for SSR or if window is not available
  return import.meta.env.VITE_API_URL || 'https://property-list-builder.vercel.app/api'
}

const API_BASE_URL = getApiBaseUrl()

/**
 * Directly construct PMTiles URL (for development or fallback)
 */
const getDirectPMTilesUrl = (county) => {
  const normalizedCounty = county.toLowerCase().replace(/\s+/g, '-')
  return `${BLOB_STORAGE_BASE}/${normalizedCounty}-county.pmtiles`
}

export const getCountyPMTilesUrl = async (county) => {
  // In development, use direct URL (blob is public, no API needed)
  if (import.meta.env.DEV) {
    const pmtilesUrl = getDirectPMTilesUrl(county)
    console.log(`Development mode: Using direct PMTiles URL for ${county}:`, pmtilesUrl)
    return {
      pmtilesUrl: pmtilesUrl,
      layerName: 'parcels'
    }
  }

  // In production, try API first, fallback to direct URL
  try {
    const url = `${API_BASE_URL}/parcels?county=${county}`
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
}


