/**
 * Vercel Serverless Function
 * Manages public property lists that are accessible to all users
 * 
 * Methods:
 * - GET: Fetch all public lists
 * - POST: Create a new public list
 * - PATCH: Update an existing public list (add parcels)
 * - DELETE: Delete a public list
 * 
 * Uses Vercel KV (Redis) for persistent storage
 * Falls back to in-memory store if KV is not configured
 */

// Try to import KV, but handle gracefully if not available
let kv = null
let kvAvailable = false

// Check if KV environment variables are available
// Try Vercel KV REST API first (KV_REST_API_URL + KV_REST_API_TOKEN)
if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  try {
    const kvModule = await import('@vercel/kv')
    kv = kvModule.kv
    kvAvailable = true
    console.log('Vercel KV initialized successfully (REST API)')
  } catch (error) {
    console.warn('Failed to initialize Vercel KV (REST API):', error.message)
    kvAvailable = false
  }
} 
// Fallback: Try REDIS_URL (standard Redis connection string)
else if (process.env.REDIS_URL) {
  try {
    // For REDIS_URL, use the redis package (already in dependencies)
    const { createClient } = await import('redis')
    kv = createClient({ url: process.env.REDIS_URL })
    await kv.connect()
    kvAvailable = true
    console.log('Redis initialized successfully (REDIS_URL)')
  } catch (error) {
    console.warn('Failed to initialize Redis (REDIS_URL):', error.message)
    kvAvailable = false
  }
} else {
  console.warn('No KV/Redis environment variables found. Using in-memory store (data will not persist).')
  console.warn('Available env vars:', Object.keys(process.env).filter(k => k.includes('REDIS') || k.includes('KV')))
  kvAvailable = false
}

const KV_STORE_KEY = 'public_lists'

// Fallback in-memory store (used if KV is not available)
let fallbackStore = []

// Helper functions to get/set lists from KV (with fallback)
async function getListsFromKV() {
  if (!kvAvailable || !kv) {
    return fallbackStore
  }
  
  try {
    // Handle both @vercel/kv (REST API) and redis client (REDIS_URL)
    let lists
    const data = await kv.get(KV_STORE_KEY)
    
    // @vercel/kv returns objects directly, redis client returns strings
    if (typeof data === 'string') {
      lists = data ? JSON.parse(data) : null
    } else {
      lists = data
    }
    
    const result = Array.isArray(lists) ? lists : []
    // Sync fallback store
    fallbackStore = result
    return result
  } catch (error) {
    console.error('Error reading from KV:', error.message)
    // Fallback to in-memory if KV fails
    console.warn('Falling back to in-memory store')
    return fallbackStore
  }
}

async function saveListsToKV(lists) {
  // Always update fallback store first
  fallbackStore = lists
  
  if (!kvAvailable || !kv) {
    console.warn('KV not available, using in-memory store (data will not persist across restarts)')
    return true
  }
  
  try {
    // Handle both @vercel/kv (REST API) and redis client (REDIS_URL)
    // @vercel/kv handles objects directly, redis client needs JSON stringify
    try {
      // Try @vercel/kv style first (handles objects directly)
      await kv.set(KV_STORE_KEY, lists)
    } catch (e) {
      // If that fails, try redis client style (needs JSON stringify)
      await kv.set(KV_STORE_KEY, JSON.stringify(lists))
    }
    return true
  } catch (error) {
    console.error('Error writing to KV:', error.message)
    // Don't throw - we've already saved to fallback
    console.warn('Failed to save to KV, data saved to in-memory store only')
    return true
  }
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Max-Age', '86400')

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  const { method, body } = req

  try {
    if (method === 'GET') {
      // Fetch all public lists from KV
      const lists = await getListsFromKV()
      return res.status(200).json({ lists })
    }

    if (method === 'POST') {
      // Create a new public list
      const { name, parcels = [] } = body

      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'List name is required' })
      }

      const newList = {
        id: `public_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: name.trim(),
        parcels: parcels.map(p => typeof p === 'string' ? { id: p, addedAt: new Date().toISOString() } : p),
        isPublic: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      // Get existing lists and add new one
      const existingLists = await getListsFromKV()
      existingLists.push(newList)
      await saveListsToKV(existingLists)

      return res.status(201).json({ list: newList })
    }

    if (method === 'PATCH') {
      // Update an existing public list (add or remove parcels)
      const { listId, parcels: newParcels, removeParcels } = body

      if (!listId) {
        return res.status(400).json({ error: 'List ID is required' })
      }

      const existingLists = await getListsFromKV()
      const listIndex = existingLists.findIndex(list => list.id === listId)
      if (listIndex === -1) {
        return res.status(404).json({ error: 'List not found' })
      }

      const list = existingLists[listIndex]

      // Handle removing parcels
      if (removeParcels && Array.isArray(removeParcels)) {
        const removeIds = new Set(removeParcels)
        const updatedParcels = list.parcels.filter(p => {
          const parcelId = p.id || p
          return !removeIds.has(parcelId)
        })
        
        existingLists[listIndex] = {
          ...list,
          parcels: updatedParcels,
          updatedAt: new Date().toISOString()
        }

        await saveListsToKV(existingLists)

        return res.status(200).json({ 
          list: existingLists[listIndex],
          parcelsRemoved: list.parcels.length - updatedParcels.length
        })
      }

      // Handle adding parcels
      if (!Array.isArray(newParcels)) {
        return res.status(400).json({ error: 'Parcels must be an array' })
      }

      const existingIds = new Set(list.parcels.map(p => p.id || p))
      
      // Handle both string IDs and full parcel objects
      const parcelsToAdd = newParcels
        .map(p => {
          if (typeof p === 'string') {
            // Legacy: just an ID string
            return { id: p, addedAt: new Date().toISOString() }
          } else if (p.id) {
            // Full parcel object
            return {
              id: p.id,
              properties: p.properties || {},
              address: p.address || null,
              lat: p.lat || null,
              lng: p.lng || null,
              addedAt: p.addedAt || new Date().toISOString()
            }
          } else {
            return null
          }
        })
        .filter(p => p && !existingIds.has(p.id))
      
      existingLists[listIndex] = {
        ...list,
        parcels: [...list.parcels, ...parcelsToAdd],
        updatedAt: new Date().toISOString()
      }

      await saveListsToKV(existingLists)

      return res.status(200).json({ 
        list: existingLists[listIndex],
        parcelsAdded: parcelsToAdd.length
      })
    }

    if (method === 'DELETE') {
      // Delete a public list
      const { listId } = body

      if (!listId) {
        return res.status(400).json({ error: 'List ID is required' })
      }

      const existingLists = await getListsFromKV()
      const listIndex = existingLists.findIndex(list => list.id === listId)
      if (listIndex === -1) {
        return res.status(404).json({ error: 'List not found' })
      }

      existingLists.splice(listIndex, 1)
      await saveListsToKV(existingLists)

      return res.status(200).json({ message: 'List deleted successfully' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('Error in public-lists API:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    })
  }
}

