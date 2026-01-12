/**
 * Utility functions for managing the special "Skiptraced Parcels" list
 * This list tracks all parcels and lists that have been skip traced
 */

const STORAGE_KEY = 'skip_traced_list'

/**
 * Get the skip traced list structure
 * @returns {Object} List structure with parcels and listItems
 */
export const getSkipTracedList = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return {
        id: 'skip_traced_list',
        name: 'Skiptraced Parcels',
        parcels: [],
        listItems: [] // Array of { listId, listName, parcels, skipTracedAt }
      }
    }
    return JSON.parse(stored)
  } catch (error) {
    console.error('Error getting skip traced list:', error)
    return {
      id: 'skip_traced_list',
      name: 'Skiptraced Parcels',
      parcels: [],
      listItems: []
    }
  }
}

/**
 * Save the skip traced list structure
 * @param {Object} list - List structure
 */
const saveSkipTracedList = (list) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch (error) {
    console.error('Error saving skip traced list:', error)
  }
}

/**
 * Add a parcel to the skip traced list (if not already present)
 * @param {Object} parcel - Parcel object with id, properties, address, etc.
 */
export const addParcelToSkipTracedList = (parcel) => {
  const list = getSkipTracedList()
  const parcelId = parcel.id || parcel.properties?.PROP_ID
  
  if (!parcelId) {
    console.warn('Cannot add parcel to skip traced list: no parcel ID')
    return
  }
  
  // Check if parcel already exists
  const existingIndex = list.parcels.findIndex(p => (p.id || p.properties?.PROP_ID) === parcelId)
  
  if (existingIndex === -1) {
    // Add new parcel
    list.parcels.push({
      ...parcel,
      skipTracedAt: new Date().toISOString()
    })
    saveSkipTracedList(list)
    console.log('✅ Added parcel to skip traced list:', parcelId)
  } else {
    // Update existing parcel
    list.parcels[existingIndex] = {
      ...list.parcels[existingIndex],
      ...parcel,
      skipTracedAt: list.parcels[existingIndex].skipTracedAt || new Date().toISOString()
    }
    saveSkipTracedList(list)
    console.log('✅ Updated parcel in skip traced list:', parcelId)
  }
}

/**
 * Add multiple parcels from a list to the skip traced list
 * @param {string} listId - Original list ID
 * @param {string} listName - Original list name
 * @param {Array} parcels - Array of parcel objects
 */
export const addListToSkipTracedList = (listId, listName, parcels) => {
  const list = getSkipTracedList()
  const skipTracedAt = new Date().toISOString()
  
  // Check if list already exists
  const existingIndex = list.listItems.findIndex(item => item.listId === listId)
  
  if (existingIndex === -1) {
    // Add new list item
    list.listItems.push({
      listId,
      listName,
      parcels: parcels.map(p => ({
        ...p,
        skipTracedAt
      })),
      skipTracedAt
    })
    saveSkipTracedList(list)
    console.log(`✅ Added list "${listName}" to skip traced list with ${parcels.length} parcels`)
  } else {
    // Update existing list item (merge parcels)
    const existing = list.listItems[existingIndex]
    const existingParcelIds = new Set(
      existing.parcels.map(p => p.id || p.properties?.PROP_ID)
    )
    
    // Add new parcels that don't already exist
    const newParcels = parcels.filter(p => {
      const parcelId = p.id || p.properties?.PROP_ID
      return !existingParcelIds.has(parcelId)
    }).map(p => ({
      ...p,
      skipTracedAt
    }))
    
    if (newParcels.length > 0) {
      existing.parcels = [...existing.parcels, ...newParcels]
      existing.skipTracedAt = skipTracedAt
      saveSkipTracedList(list)
      console.log(`✅ Updated list "${listName}" in skip traced list with ${newParcels.length} new parcels`)
    }
  }
}

/**
 * Get the total count of skip traced parcels (individual + from lists)
 * @returns {number} Total count
 */
export const getSkipTracedCount = () => {
  const list = getSkipTracedList()
  const individualCount = list.parcels.length
  const listCount = list.listItems.reduce((sum, item) => sum + item.parcels.length, 0)
  return individualCount + listCount
}

