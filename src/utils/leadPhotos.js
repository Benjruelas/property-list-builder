/**
 * Lead photo upload/download client.
 */

import { compressImageFile, compressDataUrl, blobToBase64 } from './imageCompress'

const MAX_FILE_BYTES = 10 * 1024 * 1024

const getApiBase = () => {
  if (import.meta.env.DEV) return '/api'
  if (typeof window !== 'undefined') return `${window.location.origin}/api`
  return import.meta.env.VITE_API_URL || ''
}

export { MAX_FILE_BYTES }

export function leadPhotoUrl(key) {
  if (!key) return ''
  return `${getApiBase()}/lead-photos?key=${encodeURIComponent(key)}`
}

export async function fetchLeadPhotoBlob(getToken, key) {
  const token = await getToken()
  if (!token) throw new Error('Sign in required')
  const res = await fetch(leadPhotoUrl(key), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Could not load photo')
  return res.blob()
}

export async function uploadLeadPhoto(getToken, {
  leadId,
  file,
  dataUrl,
  metadata = {},
}) {
  let compressed
  if (dataUrl) {
    compressed = await compressDataUrl(dataUrl)
  } else if (file) {
    if (file.size > MAX_FILE_BYTES * 2) throw new Error('Image too large')
    compressed = await compressImageFile(file)
  } else {
    throw new Error('No image provided')
  }

  const [fileBase64, thumbnailBase64] = await Promise.all([
    blobToBase64(compressed.file),
    blobToBase64(compressed.thumbnail),
  ])

  const token = await getToken()
  if (!token) throw new Error('Sign in to upload photos')

  const res = await fetch(`${getApiBase()}/lead-photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      leadId,
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

export async function saveLeadPhotoAnnotations(getToken, {
  leadId,
  photoId,
  annotations,
  annotatedBlob,
}) {
  const token = await getToken()
  if (!token) throw new Error('Sign in required')

  const body = { leadId, photoId, annotations }
  if (annotatedBlob) {
    body.annotatedBase64 = await blobToBase64(annotatedBlob)
  }

  const res = await fetch(`${getApiBase()}/lead-photos`, {
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

export async function deleteLeadPhoto(getToken, { leadId, photoId }) {
  const token = await getToken()
  if (!token) throw new Error('Sign in required')
  const res = await fetch(`${getApiBase()}/lead-photos`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ leadId, photoId }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Delete failed')
  }
  return res.json()
}

export async function getCurrentPosition() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    )
  })
}
