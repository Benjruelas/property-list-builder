/**
 * Utility functions for managing the special "Skiptraced Parcels" list
 * This list tracks all parcels and lists that have been skip traced
 */

const STORAGE_KEY = 'skip_traced_list'

export const getSkipTracedList = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return {
        id: 'skip_traced_list',
        name: 'Skiptraced Parcels',
        parcels: [],
        listItems: []
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

const saveSkipTracedList = (list) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch (error) {
    console.error('Error saving skip traced list:', error)
  }
}

export const addParcelToSkipTracedList = (parcel) => {
  const list = getSkipTracedList()
  const parcelId = parcel.id || parcel.properties?.PROP_ID

  if (!parcelId) {
    console.warn('Cannot add parcel to skip traced list: no parcel ID')
    return
  }

  const existingIndex = list.parcels.findIndex(p => (p.id || p.properties?.PROP_ID) === parcelId)

  if (existingIndex === -1) {
    list.parcels.push({
      ...parcel,
      skipTracedAt: new Date().toISOString()
    })
    saveSkipTracedList(list)
  } else {
    list.parcels[existingIndex] = {
      ...list.parcels[existingIndex],
      ...parcel,
      skipTracedAt: list.parcels[existingIndex].skipTracedAt || new Date().toISOString()
    }
    saveSkipTracedList(list)
  }
}

export const addListToSkipTracedList = (listId, listName, parcels) => {
  const list = getSkipTracedList()
  const skipTracedAt = new Date().toISOString()

  const existingIndex = list.listItems.findIndex(item => item.listId === listId)

  if (existingIndex === -1) {
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
  } else {
    const existing = list.listItems[existingIndex]
    const existingParcelIds = new Set(
      existing.parcels.map(p => p.id || p.properties?.PROP_ID)
    )

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
    }
  }
}
