/**
 * Lead photo upload/download client.
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

export const LEAD_STORAGE_LIMIT_BYTES = ENTITY_STORAGE_LIMITS.lead

export {
  MAX_SINGLE_UPLOAD_BYTES,
  sumLeadPhotoBytes,
  formatStorageBytes,
}

export function leadPhotoUrl(key, cacheVersion = '') {
  if (!key) return ''
  const base = `${getApiBase()}/lead-photos?key=${encodeURIComponent(key)}&redirect=0`
  return cacheVersion ? `${base}&v=${encodeURIComponent(cacheVersion)}` : base
}

export async function fetchLeadPhotoBlob(getToken, key, cacheVersion = '') {
  const token = await getToken()
  if (!token) throw new Error('Sign in required')
  const res = await fetch(leadPhotoUrl(key, cacheVersion), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Could not load photo')
  return res.blob()
}

function assertLeadPhotoStorage(existingPhotos, addingBytes) {
  const used = sumLeadPhotoBytes(existingPhotos)
  if (used + addingBytes > ENTITY_STORAGE_LIMITS.lead) {
    throw new Error(entityStorageError('lead', ENTITY_STORAGE_LIMITS.lead))
  }
}

export async function uploadLeadPhoto(getToken, {
  leadId,
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
  assertLeadPhotoStorage(existingPhotos, addingBytes)

  const token = await getToken()
  if (!token) throw new Error('Sign in to upload photos')

  const usePresigned = import.meta.env.VITE_PRESIGNED_PHOTOS === '1'
    || import.meta.env.VITE_PRESIGNED_PHOTOS === 'true'

  // #region agent log
  fetch('http://127.0.0.1:7670/ingest/d6025e07-f4a3-4325-9234-794e9f14731e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a5a5c'},body:JSON.stringify({sessionId:'7a5a5c',location:'leadPhotos.js:uploadLeadPhoto:start',message:'uploadLeadPhoto starting',data:{leadId,usePresigned,apiBase:getApiBase(),fileSize:compressed.file.size,thumbSize:compressed.thumbnail.size},timestamp:Date.now(),hypothesisId:'A,B'})}).catch(()=>{});
  // #endregion

  if (usePresigned) {
    const presignRes = await fetch(`${getApiBase()}/lead-photos?presign=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        leadId,
        contentType: 'image/jpeg',
        width: compressed.width,
        height: compressed.height,
        ...metadata,
      }),
    })
    // #region agent log
    fetch('http://127.0.0.1:7670/ingest/d6025e07-f4a3-4325-9234-794e9f14731e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a5a5c'},body:JSON.stringify({sessionId:'7a5a5c',location:'leadPhotos.js:uploadLeadPhoto:presign',message:'presign response',data:{leadId,ok:presignRes.ok,status:presignRes.status},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    if (presignRes.ok) {
      const presign = await presignRes.json()
      const [origPut, thumbPut] = await Promise.all([
        fetch(presign.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/jpeg' },
          body: compressed.file,
        }),
        fetch(presign.thumbnailUploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/jpeg' },
          body: compressed.thumbnail,
        }),
      ])
      // #region agent log
      fetch('http://127.0.0.1:7670/ingest/d6025e07-f4a3-4325-9234-794e9f14731e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a5a5c'},body:JSON.stringify({sessionId:'7a5a5c',location:'leadPhotos.js:uploadLeadPhoto:presignPut',message:'presigned PUT results',data:{leadId,origOk:origPut.ok,origStatus:origPut.status,thumbOk:thumbPut.ok,thumbStatus:thumbPut.status},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      const recordRes = await fetch(`${getApiBase()}/lead-photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          leadId,
          recordOnly: true,
          photoId: presign.photoId,
          key: presign.key,
          thumbnailKey: presign.thumbnailKey,
          size: compressed.file.size,
          thumbnailSize: compressed.thumbnail.size,
          contentType: 'image/jpeg',
          width: compressed.width,
          height: compressed.height,
          ...metadata,
        }),
      })
      if (recordRes.ok) {
        const json = await recordRes.json()
        return { ...json, thumbnailBlob: compressed.thumbnail }
      }
    }
    // Fall through to legacy base64 upload if presign unavailable
  }

  const [fileBase64, thumbnailBase64] = await Promise.all([
    blobToBase64(compressed.file),
    blobToBase64(compressed.thumbnail),
  ])

  let res
  try {
    res = await fetch(`${getApiBase()}/lead-photos`, {
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
  } catch (fetchErr) {
    // #region agent log
    fetch('http://127.0.0.1:7670/ingest/d6025e07-f4a3-4325-9234-794e9f14731e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a5a5c'},body:JSON.stringify({sessionId:'7a5a5c',location:'leadPhotos.js:uploadLeadPhoto:legacyFetchError',message:'legacy upload fetch threw',data:{leadId,errMessage:fetchErr?.message},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    throw fetchErr
  }
  // #region agent log
  fetch('http://127.0.0.1:7670/ingest/d6025e07-f4a3-4325-9234-794e9f14731e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a5a5c'},body:JSON.stringify({sessionId:'7a5a5c',location:'leadPhotos.js:uploadLeadPhoto:legacyResponse',message:'legacy upload response',data:{leadId,ok:res.ok,status:res.status},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
  // #endregion
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

export async function saveLeadPhotoAnnotations(getToken, {
  leadId,
  photoId,
  annotations,
  annotatedBlob,
  annotatedThumbnailBlob,
  existingPhotos = [],
}) {
  const token = await getToken()
  if (!token) throw new Error('Sign in required')

  const body = { leadId, photoId, annotations }
  if (annotatedBlob) {
    if (annotatedBlob.size > MAX_SINGLE_UPLOAD_BYTES) {
      throw new Error(`Annotated image must be ${formatStorageBytes(MAX_SINGLE_UPLOAD_BYTES)} or smaller`)
    }
    const existing = existingPhotos.find((p) => p.id === photoId)
    const oldAnnotatedBytes = (Number(existing?.annotatedSize) || 0) + (Number(existing?.annotatedThumbnailSize) || 0)
    const newAnnotatedBytes = annotatedBlob.size + (annotatedThumbnailBlob?.size || 0)
    const withoutAnnotated = sumLeadPhotoBytes(existingPhotos) - oldAnnotatedBytes
    if (withoutAnnotated + newAnnotatedBytes > ENTITY_STORAGE_LIMITS.lead) {
      throw new Error(entityStorageError('lead', ENTITY_STORAGE_LIMITS.lead))
    }
    body.annotatedBase64 = await blobToBase64(annotatedBlob)
    if (annotatedThumbnailBlob) {
      body.annotatedThumbnailBase64 = await blobToBase64(annotatedThumbnailBlob)
    }
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
