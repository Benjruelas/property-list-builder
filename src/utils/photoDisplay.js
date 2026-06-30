import { estimateDataUrlBytes } from './uploadLimits'

/** Safari/iOS chokes on multi-MB data URLs in <img src>. */
const MAX_LOCAL_PREVIEW_BYTES = 512 * 1024
export function getPhotoThumbnailKey(photo) {
  if (!photo) return null
  return photo.annotatedThumbnailKey || photo.annotatedKey || photo.thumbnailKey || photo.key || null
}

export function getPhotoThumbnailFetchKeys(photo) {
  if (!photo) return []
  return [...new Set(
    [photo.annotatedThumbnailKey, photo.annotatedKey, photo.thumbnailKey, photo.key].filter(Boolean),
  )]
}

const CLIENT_PHOTO_FIELDS = [
  '_annotatedPreviewUrl',
  '_annotationSaving',
  '_annotationSaveFailed',
  '_annotationSaveError',
  '_annotationRetryPayload',
  '_localThumbUrl',
  '_localPreviewUrl',
]

export function stripClientPhotoFields(photo) {
  if (!photo || typeof photo !== 'object') return photo
  const next = { ...photo }
  for (const key of CLIENT_PHOTO_FIELDS) delete next[key]
  return next
}

/** Merge one photo record from server/poll onto client state. */
export function mergePhotoRecord(prevPhoto, incomingPhoto) {
  if (!incomingPhoto) return prevPhoto
  if (!prevPhoto) return incomingPhoto
  const merged = { ...prevPhoto, ...incomingPhoto }
  if (incomingPhoto._annotationSaving) return merged
  return stripClientPhotoFields(merged)
}

/** Full-size preview keys — annotated render first, then original. */
export function getPhotoPreviewFetchKeys(photo) {
  if (!photo) return []
  return [...new Set([photo.annotatedKey, photo.key].filter(Boolean))]
}

/** Full-size preview: annotated render when available. */
export function getPhotoPreviewKey(photo) {
  const keys = getPhotoPreviewFetchKeys(photo)
  return keys[0] || null
}

/** Original photo used as the annotation editor canvas base. */
export function getPhotoAnnotationBaseKey(photo) {
  if (!photo) return null
  return photo.key || null
}

export function getPhotoThumbSourceToken(photo) {
  if (!photo) return ''
  // Never embed _annotatedPreviewUrl in query params — data URLs exceed URI limits.
  if (photo._annotatedPreviewUrl?.startsWith('data:')) {
    return `local-annotated:${photo.updatedAt || 'pending'}`
  }
  return `${getPhotoThumbnailKey(photo) || ''}:${photo.updatedAt || ''}`
}

/** In-memory data URL preview shown while annotation save is in flight. */
export function getAnnotatedDataPreviewUrl(photo, pendingPreviewUrl, { skipLocalPreview = false } = {}) {
  if (skipLocalPreview) return null
  const raw = photo?._annotatedPreviewUrl || pendingPreviewUrl || null
  return raw?.startsWith('data:') ? raw : null
}

export function shouldUseLocalPhotoPreview(photo) {
  const url = photo?._localPreviewUrl
  if (
    !url
    || photo?.key
    || photo?.annotatedKey
    || photo?._annotatedPreviewUrl
  ) {
    return false
  }
  if (url.startsWith('data:') && estimateDataUrlBytes(url) > MAX_LOCAL_PREVIEW_BYTES) {
    return false
  }
  return true
}

export function shouldUseAnnotatedPreviewUrl(photo) {
  return Boolean(photo?._annotatedPreviewUrl?.startsWith('data:'))
}
