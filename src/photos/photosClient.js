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
import { getPhotoThumbnailFetchKeys, getPhotoPreviewFetchKeys } from '@/utils/photoDisplay'
import { photoLog, photoLogError, photoLogWarn } from './photoDebug'

import { getApiBase } from '@/utils/apiBase'

export const LEAD_STORAGE_LIMIT_BYTES = ENTITY_STORAGE_LIMITS.lead
export const DEAL_STORAGE_LIMIT_BYTES = ENTITY_STORAGE_LIMITS.dealPhotos

export {
  MAX_SINGLE_UPLOAD_BYTES,
  sumLeadPhotoBytes as sumPhotoBytes,
  formatStorageBytes,
}

export function photoBlobUrl(key, cacheVersion = '') {
  if (!key) return ''
  const base = `${getApiBase()}/photos?key=${encodeURIComponent(key)}&redirect=0`
  return cacheVersion ? `${base}&v=${encodeURIComponent(cacheVersion)}` : base
}

export function photoUrl(key, cacheVersion = '') {
  if (!key) return ''
  const base = `${getApiBase()}/photos?key=${encodeURIComponent(key)}&format=url`
  return cacheVersion ? `${base}&v=${encodeURIComponent(cacheVersion)}` : base
}

/** @deprecated use photoUrl */
export const leadPhotoUrl = photoUrl

const blobMemoryCache = new Map()
const blobInflight = new Map()
const MAX_BLOB_CACHE = 96
const MAX_CONCURRENT_BLOB_FETCHES = 6
let activeBlobFetches = 0
const blobFetchWaitQueue = []

function acquireBlobFetchSlot() {
  if (activeBlobFetches < MAX_CONCURRENT_BLOB_FETCHES) {
    activeBlobFetches += 1
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    blobFetchWaitQueue.push(resolve)
  }).then(() => {
    activeBlobFetches += 1
  })
}

function releaseBlobFetchSlot() {
  activeBlobFetches = Math.max(0, activeBlobFetches - 1)
  const next = blobFetchWaitQueue.shift()
  if (next) next()
}

function blobCacheKey(key, cacheVersion = '') {
  return `${key}:${cacheVersion}`
}

export function getCachedPhotoBlob(key, cacheVersion = '') {
  if (!key) return null
  return blobMemoryCache.get(blobCacheKey(key, cacheVersion)) || null
}

export function getCachedPhotoPreviewBlob(photo, cacheVersion = '') {
  const [preferredKey] = getPhotoPreviewFetchKeys(photo)
  return getCachedPhotoBlob(preferredKey, cacheVersion)
}

export function invalidatePhotoBlobCache(photo) {
  if (!photo) return
  const keys = [
    photo.key,
    photo.thumbnailKey,
    photo.annotatedKey,
    photo.annotatedThumbnailKey,
  ].filter(Boolean)
  if (!keys.length) return
  for (const cacheKey of blobMemoryCache.keys()) {
    if (keys.some((k) => cacheKey.startsWith(`${k}:`))) {
      blobMemoryCache.delete(cacheKey)
    }
  }
}

async function authHeaders(getToken) {
  const token = await getToken()
  if (!token) throw new Error('Sign in required')
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

export async function getSignedUrl(getToken, key, cacheVersion = '') {
  photoLog('client.get-url', 'GET signed URL', { key: key?.slice?.(0, 60) })
  const headers = await authHeaders(getToken)
  const res = await fetch(photoUrl(key, cacheVersion), { headers })
  if (!res.ok) {
    photoLogError('client.get-url', 'Signed URL failed', null, { status: res.status, key })
    throw new Error('Could not load photo')
  }
  const json = await res.json()
  photoLog('client.get-url', 'Signed URL OK', { key: key?.slice?.(0, 60) })
  return json.url
}

export async function fetchPhotoBlob(getToken, key, cacheVersion = '') {
  const cacheKey = blobCacheKey(key, cacheVersion)
  const cached = blobMemoryCache.get(cacheKey)
  if (cached) return cached

  const pending = blobInflight.get(cacheKey)
  if (pending) return pending

  const work = (async () => {
    await acquireBlobFetchSlot()
    try {
      photoLog('client.fetch-blob', 'GET photo via API proxy', { key: key?.slice?.(0, 60) })
      const token = await getToken()
      if (!token) throw new Error('Sign in required')
      const res = await fetch(photoBlobUrl(key, cacheVersion), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        blobMemoryCache.delete(cacheKey)
        photoLogError('client.fetch-blob', 'Photo fetch failed', null, { status: res.status, key })
        throw new Error('Could not load photo')
      }
      const blob = await res.blob()
      photoLog('client.fetch-blob', 'Photo blob OK', { key: key?.slice?.(0, 60), bytes: blob.size })
      blobMemoryCache.set(cacheKey, blob)
      if (blobMemoryCache.size > MAX_BLOB_CACHE) {
        const oldest = blobMemoryCache.keys().next().value
        if (oldest) blobMemoryCache.delete(oldest)
      }
      return blob
    } finally {
      releaseBlobFetchSlot()
    }
  })()

  blobInflight.set(cacheKey, work)
  try {
    return await work
  } finally {
    blobInflight.delete(cacheKey)
  }
}

export async function fetchPhotoThumbnailBlob(getToken, photo, cacheVersion = '') {
  const keys = getPhotoThumbnailFetchKeys(photo)
  if (!keys.length) throw new Error('Could not load photo')
  let lastErr
  for (const key of keys) {
    try {
      return await fetchPhotoBlob(getToken, key, cacheVersion)
    } catch (e) {
      lastErr = e
      photoLogWarn('client.fetch-thumb', 'Thumb key failed, trying next', { key: key?.slice?.(0, 60) })
    }
  }
  throw lastErr || new Error('Could not load photo')
}

export async function fetchPhotoPreviewBlob(getToken, photo, cacheVersion = '') {
  const keys = getPhotoPreviewFetchKeys(photo)
  if (!keys.length) throw new Error('Could not load photo')
  let lastErr
  for (const key of keys) {
    try {
      return await fetchPhotoBlob(getToken, key, cacheVersion)
    } catch (e) {
      lastErr = e
      photoLogWarn('client.fetch-preview', 'Preview key failed, trying next', { key: key?.slice?.(0, 60) })
    }
  }
  throw lastErr || new Error('Could not load photo')
}

/** @deprecated use fetchPhotoBlob */
export const fetchLeadPhotoBlob = fetchPhotoBlob

export async function presignUpload(getToken, entityRef, body = {}) {
  photoLog('client.presign', 'POST /api/photos action=presign', { entityRef: apiBodyFromRef(entityRef) })
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
    photoLogError('client.presign', 'Presign failed', null, { status: res.status, error: err.error })
    throw new Error(err.error || 'Presign failed')
  }
  const json = await res.json()
  photoLog('client.presign', 'Presign OK', { photoId: json.photoId, key: json.key })
  return json
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

/** Browser → R2 PUT needs bucket CORS; default off — use API proxy instead. */
export const PHOTO_DIRECT_R2_UPLOAD = import.meta.env.VITE_PHOTO_DIRECT_R2_UPLOAD === '1'

export async function uploadBytesViaApi(getToken, entityRef, key, blob, contentType = 'image/jpeg') {
  const { blobToBase64 } = await import('@/utils/imageCompress')
  const dataBase64 = await blobToBase64(blob)
  photoLog('client.upload-bytes', 'POST /api/photos action=upload-bytes', { key: key?.slice?.(0, 60), bytes: blob.size })
  const headers = await authHeaders(getToken)
  const res = await fetch(`${getApiBase()}/photos`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      action: 'upload-bytes',
      key,
      contentType,
      dataBase64,
      ...apiBodyFromRef(entityRef),
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    photoLogError('client.upload-bytes', 'API upload failed', null, { status: res.status, error: err.error })
    throw new Error(err.error || 'Upload failed')
  }
  photoLog('client.upload-bytes', 'API upload OK', { key: key?.slice?.(0, 60) })
  return res.json()
}

export async function completeUpload(getToken, entityRef, payload) {
  photoLog('client.complete', 'POST /api/photos action=complete', {
    entityRef: apiBodyFromRef(entityRef),
    photoId: payload.photoId,
    key: payload.key,
  })
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
    photoLogError('client.complete', 'Complete failed', null, { status: res.status, error: err.error })
    throw new Error(err.error || 'Upload failed')
  }
  const json = await res.json()
  photoLog('client.complete', 'Complete OK', { photoId: json.photo?.id })
  return json
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
  photoLog('client.delete', 'DELETE photo', { ...apiBodyFromRef(entityRef), photoId })
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
