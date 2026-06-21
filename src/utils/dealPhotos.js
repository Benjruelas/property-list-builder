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

export function dealPhotoUrl(key) {
  if (!key) return ''
  return `${getApiBase()}/deal-photos?key=${encodeURIComponent(key)}`
}

export async function fetchDealPhotoBlob(getToken, key) {
  const token = await getToken()
  if (!token) throw new Error('Sign in required')
  const res = await fetch(dealPhotoUrl(key), {
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
  return res.json()
}

export async function saveDealPhotoAnnotations(getToken, {
  pipelineId,
  dealId,
  photoId,
  annotations,
  annotatedBlob,
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
    const withoutAnnotated = sumLeadPhotoBytes(existingPhotos) - (Number(existing?.annotatedSize) || 0)
    if (withoutAnnotated + annotatedBlob.size > ENTITY_STORAGE_LIMITS.dealPhotos) {
      throw new Error(entityStorageError('dealPhotos', ENTITY_STORAGE_LIMITS.dealPhotos))
    }
    body.annotatedBase64 = await blobToBase64(annotatedBlob)
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
    throw new Error(err.error || 'Delete failed')
  }
  return res.json()
}
