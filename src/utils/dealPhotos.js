/**
 * Deal photo upload/download client.
 */

import { compressImageFile, compressDataUrl, blobToBase64 } from './imageCompress'
import {
  ENTITY_STORAGE_LIMITS,
  MAX_SINGLE_UPLOAD_BYTES,
  entityStorageError,
  formatStorageBytes,
  sumLeadPhotoBytes,
} from './uploadLimits'

const getApiBase = () => {
  if (import.meta.env.DEV) return '/api'
  if (typeof window !== 'undefined') return `${window.location.origin}/api`
  return import.meta.env.VITE_API_URL || ''
}

export const DEAL_PHOTO_STORAGE_LIMIT_BYTES = ENTITY_STORAGE_LIMITS.dealPhotos

export {
  MAX_SINGLE_UPLOAD_BYTES,
  sumLeadPhotoBytes as sumDealPhotoBytes,
  formatStorageBytes,
}

export { getCurrentPosition } from './leadPhotos'

export function dealPhotoUrl(key, cacheVersion = '') {
  if (!key) return ''
  const base = `${getApiBase()}/deal-photos?key=${encodeURIComponent(key)}`
  return cacheVersion ? `${base}&v=${encodeURIComponent(cacheVersion)}` : base
}

export async function fetchDealPhotoBlob(getToken, key, cacheVersion = '') {
  const token = await getToken()
  if (!token) throw new Error('Sign in required')
  const res = await fetch(dealPhotoUrl(key, cacheVersion), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Could not load photo')
  return res.blob()
}

function assertDealPhotoStorage(existingPhotos, addingBytes) {
  const used = sumLeadPhotoBytes(existingPhotos)
  if (used + addingBytes > ENTITY_STORAGE_LIMITS.dealPhotos) {
    throw new Error(entityStorageError('dealPhotos', ENTITY_STORAGE_LIMITS.dealPhotos))
  }
}

export async function uploadDealPhoto(getToken, {
  pipelineId,
  dealId,
  file,
  dataUrl,
  metadata = {},
  existingPhotos = [],
}) {
  let compressed
  if (dataUrl) {
    compressed = await compressDataUrl(dataUrl)
  } else if (file) {
    if (file.size > MAX_SINGLE_UPLOAD_BYTES * 2) {
      throw new Error(`Image too large (max ${formatStorageBytes(MAX_SINGLE_UPLOAD_BYTES)} per upload)`)
    }
    compressed = await compressImageFile(file)
  } else {
    throw new Error('No image provided')
  }

  const addingBytes = compressed.file.size + compressed.thumbnail.size
  if (compressed.file.size > MAX_SINGLE_UPLOAD_BYTES) {
    throw new Error(`Each upload must be ${formatStorageBytes(MAX_SINGLE_UPLOAD_BYTES)} or smaller`)
  }
  assertDealPhotoStorage(existingPhotos, addingBytes)

  const [fileBase64, thumbnailBase64] = await Promise.all([
    blobToBase64(compressed.file),
    blobToBase64(compressed.thumbnail),
  ])

  const token = await getToken()
  if (!token) throw new Error('Sign in to upload photos')

  const res = await fetch(`${getApiBase()}/deal-photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      pipelineId,
      dealId,
      fileBase64,
      thumbnailBase64,
      contentType: 'image/jpeg',
      width: compressed.width,
      height: compressed.height,
      ...metadata,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Upload failed')
  }
  const json = await res.json()
  // Hand back the thumbnail we just compressed so the gallery can display it
  // immediately instead of waiting on a server round-trip that competes with
  // the rest of a batch upload.
  return { ...json, thumbnailBlob: compressed.thumbnail }
}

export async function saveDealPhotoAnnotations(getToken, {
  pipelineId,
  dealId,
  photoId,
  annotations,
  annotatedBlob,
  annotatedThumbnailBlob,
  existingPhotos = [],
}) {
  const token = await getToken()
  if (!token) throw new Error('Sign in required')

  const body = { pipelineId, dealId, photoId, annotations }
  if (annotatedBlob) {
    if (annotatedBlob.size > MAX_SINGLE_UPLOAD_BYTES) {
      throw new Error(`Annotated image must be ${formatStorageBytes(MAX_SINGLE_UPLOAD_BYTES)} or smaller`)
    }
    const existing = existingPhotos.find((p) => p.id === photoId)
    const oldAnnotatedBytes = (Number(existing?.annotatedSize) || 0) + (Number(existing?.annotatedThumbnailSize) || 0)
    const newAnnotatedBytes = annotatedBlob.size + (annotatedThumbnailBlob?.size || 0)
    const withoutAnnotated = sumLeadPhotoBytes(existingPhotos) - oldAnnotatedBytes
    if (withoutAnnotated + newAnnotatedBytes > ENTITY_STORAGE_LIMITS.dealPhotos) {
      throw new Error(entityStorageError('dealPhotos', ENTITY_STORAGE_LIMITS.dealPhotos))
    }
    body.annotatedBase64 = await blobToBase64(annotatedBlob)
    if (annotatedThumbnailBlob) {
      body.annotatedThumbnailBase64 = await blobToBase64(annotatedThumbnailBlob)
    }
  }

  const res = await fetch(`${getApiBase()}/deal-photos`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Save failed')
  }
  return res.json()
}

export async function deleteDealPhoto(getToken, { pipelineId, dealId, photoId }) {
  const token = await getToken()
  if (!token) throw new Error('Sign in required')
  const res = await fetch(`${getApiBase()}/deal-photos`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ pipelineId, dealId, photoId }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    // The photo is already gone server-side (a rapid/duplicate delete, or a
    // record the server never persisted). Deleting something that no longer
    // exists is the desired end state, so treat it as success rather than
    // surfacing a misleading "Photo not found" error.
    if (res.status === 404 && err.error === 'Photo not found') {
      return { notFound: true }
    }
    throw new Error(err.error || 'Delete failed')
  }
  return res.json()
}
