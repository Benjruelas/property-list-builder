/**
 * Client-only optimistic photo records shown while uploads run in the background.
 */

import { estimateDataUrlBytes } from './uploadLimits'

export const UPLOAD_STATUS = {
  UPLOADING: 'uploading',
  FAILED: 'failed',
}

export function createPendingPhotoId() {
  return `pending_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function isPendingPhoto(photo) {
  return !!(photo?.id && String(photo.id).startsWith('pending_'))
}

export function createPendingPhoto({
  localPreviewUrl,
  estimatedBytes = 0,
  capturedByUid = null,
  capturedByName = null,
  addressLabel = null,
  parcelId = null,
  lat = null,
  lng = null,
  id = createPendingPhotoId(),
} = {}) {
  const now = new Date().toISOString()
  return {
    id,
    _uploadStatus: UPLOAD_STATUS.UPLOADING,
    _localPreviewUrl: localPreviewUrl,
    contentType: 'image/jpeg',
    size: Math.max(0, Number(estimatedBytes) || 0),
    thumbnailSize: 0,
    capturedAt: now,
    capturedByUid,
    capturedByName,
    addressLabel,
    parcelId,
    lat,
    lng,
    createdAt: now,
    updatedAt: now,
  }
}

export function replacePhotoInList(photos, pendingId, serverPhoto) {
  const list = Array.isArray(photos) ? photos : []
  const idx = list.findIndex((p) => p.id === pendingId)
  if (idx === -1) return [...list, serverPhoto]
  const next = [...list]
  next[idx] = serverPhoto
  return next
}

export function removePhotoFromList(photos, photoId) {
  return (Array.isArray(photos) ? photos : []).filter((p) => p.id !== photoId)
}

export function insertPhotoInList(photos, photo, index) {
  const list = [...(Array.isArray(photos) ? photos : [])]
  const at = Math.max(0, Math.min(index, list.length))
  list.splice(at, 0, photo)
  return list
}

export function updatePhotoInList(photos, photoId, patch) {
  const list = Array.isArray(photos) ? photos : []
  const idx = list.findIndex((p) => p.id === photoId)
  if (idx === -1) return list
  const next = [...list]
  next[idx] = { ...next[idx], ...patch, updatedAt: new Date().toISOString() }
  return next
}

/** Photos persisted on the server (exclude client-only pending records). */
export function persistedPhotos(photos) {
  return (Array.isArray(photos) ? photos : []).filter((p) => p?.key && !isPendingPhoto(p))
}

export function estimatePhotoBytes(source) {
  if (!source) return 0
  if (typeof source === 'string') return estimateDataUrlBytes(source)
  if (typeof File !== 'undefined' && source instanceof File) return source.size
  if (typeof Blob !== 'undefined' && source instanceof Blob) return source.size
  return 0
}

export function revokeLocalPreview(photo) {
  const url = photo?._localPreviewUrl
  if (url?.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url)
    } catch { /* ignore */ }
  }
}
