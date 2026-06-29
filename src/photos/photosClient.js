/**
 * Unified photo API client for leads and deals.
 */

import {
  ENTITY_STORAGE_LIMITS,
  MAX_SINGLE_UPLOAD_BYTES,
  entityStorageError,
  formatStorageBytes,
  sumLeadPhotoBytes,
} from '@/utils/uploadLimits'
import { apiBodyFromRef } from './entityRef'

const getApiBase = () => {
  if (import.meta.env.DEV) return '/api'
  if (typeof window !== 'undefined') return `${window.location.origin}/api`
  return import.meta.env.VITE_API_URL || ''
}

export const LEAD_STORAGE_LIMIT_BYTES = ENTITY_STORAGE_LIMITS.lead
export const DEAL_STORAGE_LIMIT_BYTES = ENTITY_STORAGE_LIMITS.dealPhotos

export {
  MAX_SINGLE_UPLOAD_BYTES,
  sumLeadPhotoBytes as sumPhotoBytes,
  formatStorageBytes,
}

export function photoUrl(key, cacheVersion = '') {
  if (!key) return ''
  const base = `${getApiBase()}/photos?key=${encodeURIComponent(key)}&redirect=0&format=url`
  return cacheVersion ? `${base}&v=${encodeURIComponent(cacheVersion)}` : base
}

/** @deprecated use photoUrl */
export const leadPhotoUrl = photoUrl

async function authHeaders(getToken) {
  const token = await getToken()
  if (!token) throw new Error('Sign in required')
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

export async function getSignedUrl(getToken, key, cacheVersion = '') {
  const headers = await authHeaders(getToken)
  const res = await fetch(photoUrl(key, cacheVersion), { headers })
  if (!res.ok) throw new Error('Could not load photo')
  const json = await res.json()
  return json.url
}

export async function fetchPhotoBlob(getToken, key, cacheVersion = '') {
  const url = await getSignedUrl(getToken, key, cacheVersion)
  const res = await fetch(url)
  if (!res.ok) throw new Error('Could not load photo')
  return res.blob()
}

/** @deprecated use fetchPhotoBlob */
export const fetchLeadPhotoBlob = fetchPhotoBlob

export async function presignUpload(getToken, entityRef, body = {}) {
  const headers = await authHeaders(getToken)
  const res = await fetch(`${getApiBase()}/photos`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      action: 'presign',
      ...apiBodyFromRef(entityRef),
      ...body,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Presign failed')
  }
  return res.json()
}

export async function presignAnnotationUpload(getToken, entityRef, photoId) {
  const headers = await authHeaders(getToken)
  const res = await fetch(`${getApiBase()}/photos`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      action: 'presign-annotation',
      photoId,
      ...apiBodyFromRef(entityRef),
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Presign failed')
  }
  return res.json()
}

export async function completeUpload(getToken, entityRef, payload) {
  const headers = await authHeaders(getToken)
  const res = await fetch(`${getApiBase()}/photos`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      action: 'complete',
      ...apiBodyFromRef(entityRef),
      ...payload,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Upload failed')
  }
  return res.json()
}

export async function saveAnnotations(getToken, entityRef, {
  photoId,
  annotations,
  annotatedKey,
  annotatedSize,
  annotatedThumbnailKey,
  annotatedThumbnailSize,
  clearAnnotated,
}) {
  const headers = await authHeaders(getToken)
  const res = await fetch(`${getApiBase()}/photos`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      photoId,
      annotations,
      annotatedKey,
      annotatedSize,
      annotatedThumbnailKey,
      annotatedThumbnailSize,
      clearAnnotated,
      ...apiBodyFromRef(entityRef),
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Save failed')
  }
  return res.json()
}

export async function deletePhoto(getToken, entityRef, photoId) {
  const headers = await authHeaders(getToken)
  const res = await fetch(`${getApiBase()}/photos`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ photoId, ...apiBodyFromRef(entityRef) }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    if (res.status === 404 && err.error === 'Photo not found') {
      return { notFound: true }
    }
    throw new Error(err.error || 'Delete failed')
  }
  return res.json()
}

export function assertPhotoStorage(entityType, existingPhotos, addingBytes) {
  const limit = entityType === 'deal' ? ENTITY_STORAGE_LIMITS.dealPhotos : ENTITY_STORAGE_LIMITS.lead
  const used = sumLeadPhotoBytes(existingPhotos)
  if (used + addingBytes > limit) {
    throw new Error(entityStorageError(entityType === 'deal' ? 'dealPhotos' : 'lead', limit))
  }
}

export async function getCurrentPosition() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    )
  })
}
