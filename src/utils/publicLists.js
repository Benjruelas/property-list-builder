/**
 * Utility functions for managing public lists via API
 */

// Use relative path in development (goes through vite proxy)
// Use production URL in production - use current window location for dynamic detection
const getApiBaseUrl = () => {
  if (import.meta.env.DEV) {
    return '/api'  // Will use vite proxy to localhost:3001 (vercel dev)
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
 * Fetch all public lists
 */
export const fetchPublicLists = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/public-lists`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch public lists: ${response.status}`)
    }
    
    const data = await response.json()
    return data.lists || []
  } catch (error) {
    console.error('Error fetching public lists:', error)
    return []
  }
}

/**
 * Create a new public list
 */
export const createPublicList = async (name, parcels = []) => {
  try {
    console.log('Creating public list at:', `${API_BASE_URL}/public-lists`)
    const response = await fetch(`${API_BASE_URL}/public-lists`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        parcels
      })
    })
    
    console.log('Response status:', response.status, response.statusText)
    
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`
      try {
        const errorData = await response.json()
        errorMessage = errorData.error || errorMessage
      } catch (e) {
        const errorText = await response.text()
        errorMessage = errorText || errorMessage
      }
      throw new Error(errorMessage)
    }
    
    const data = await response.json()
    console.log('Created list data:', data)
    return data.list
  } catch (error) {
    console.error('Error creating public list:', error)
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      throw new Error('Cannot connect to API. Make sure you are using "vercel dev" for local development, or the app is deployed.')
    }
    throw error
  }
}

/**
 * Add parcels to an existing public list
 */
export const addParcelsToPublicList = async (listId, parcels) => {
  try {
    const response = await fetch(`${API_BASE_URL}/public-lists`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        listId,
        parcels
      })
    })
    
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || `Failed to update public list: ${response.status}`)
    }
    
    const data = await response.json()
    return data
  } catch (error) {
    console.error('Error adding parcels to public list:', error)
    throw error
  }
}

/**
 * Remove parcels from a public list
 */
export const removeParcelsFromPublicList = async (listId, parcelIds) => {
  try {
    const response = await fetch(`${API_BASE_URL}/public-lists`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        listId,
        removeParcels: parcelIds // Array of parcel IDs to remove
      })
    })
    
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || `Failed to remove parcels from public list: ${response.status}`)
    }
    
    const data = await response.json()
    return data
  } catch (error) {
    console.error('Error removing parcels from public list:', error)
    throw error
  }
}

/**
 * Delete a public list
 */
export const deletePublicList = async (listId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/public-lists`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        listId
      })
    })
    
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || `Failed to delete public list: ${response.status}`)
    }
    
    return true
  } catch (error) {
    console.error('Error deleting public list:', error)
    throw error
  }
}

