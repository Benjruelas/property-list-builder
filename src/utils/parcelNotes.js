/**
 * Utility functions for managing parcel notes
 * Notes are stored in localStorage keyed by parcel ID
 */

const STORAGE_KEY = 'parcel_notes'

const getAllParcelNotes = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return {}
    }
    return JSON.parse(stored)
  } catch (error) {
    console.error('Error getting parcel notes:', error)
    return {}
  }
}

export const getParcelNote = (parcelId) => {
  if (!parcelId) return null
  const notes = getAllParcelNotes()
  return notes[parcelId] || null
}

export const saveParcelNote = (parcelId, note) => {
  if (!parcelId) {
    console.warn('Cannot save parcel note: no parcel ID')
    return
  }

  try {
    const notes = getAllParcelNotes()

    if (note && note.trim()) {
      notes[parcelId] = note.trim()
    } else {
      delete notes[parcelId]
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
  } catch (error) {
    console.error('Error saving parcel note:', error)
  }
}
