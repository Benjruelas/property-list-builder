/**
 * Utility functions for managing parcel notes
 * Notes are stored in localStorage keyed by parcel ID
 */

const STORAGE_KEY = 'parcel_notes'

/**
 * Get all notes (returns a map of parcelId -> note)
 * @returns {Object} Object with parcel IDs as keys and notes as values
 */
export const getAllParcelNotes = () => {
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

/**
 * Get note for a specific parcel
 * @param {string} parcelId - Parcel ID
 * @returns {string|null} Note text or null if not found
 */
export const getParcelNote = (parcelId) => {
  if (!parcelId) return null
  const notes = getAllParcelNotes()
  return notes[parcelId] || null
}

/**
 * Save note for a specific parcel
 * @param {string} parcelId - Parcel ID
 * @param {string} note - Note text (can be empty string to delete)
 */
export const saveParcelNote = (parcelId, note) => {
  if (!parcelId) {
    console.warn('Cannot save parcel note: no parcel ID')
    return
  }
  
  try {
    const notes = getAllParcelNotes()
    
    if (note && note.trim()) {
      // Save note
      notes[parcelId] = note.trim()
    } else {
      // Remove note if empty
      delete notes[parcelId]
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
    console.log('✅ Saved parcel note for:', parcelId)
  } catch (error) {
    console.error('Error saving parcel note:', error)
  }
}

/**
 * Delete note for a specific parcel
 * @param {string} parcelId - Parcel ID
 */
export const deleteParcelNote = (parcelId) => {
  if (!parcelId) return
  
  try {
    const notes = getAllParcelNotes()
    delete notes[parcelId]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
    console.log('✅ Deleted parcel note for:', parcelId)
  } catch (error) {
    console.error('Error deleting parcel note:', error)
  }
}

