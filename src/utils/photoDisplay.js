/** Prefer small annotated thumb for grids, then fall back to larger keys. */
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

/** Full-size preview: annotated render when available. */
export function getPhotoPreviewKey(photo) {
  if (!photo) return null
  return photo.annotatedKey || photo.key || null
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
  // Only trust an in-memory local preview before the photo has a real server key.
  // A persisted photo (has key/annotatedKey) must always fetch from the server —
  // a leftover _localPreviewUrl can be stale or revoked and would never load.
  return Boolean(
    photo?._localPreviewUrl
    && !photo?.key
    && !photo?.annotatedKey
    && !photo?._annotatedPreviewUrl,
  )
}

export function shouldUseAnnotatedPreviewUrl(photo) {
  return Boolean(photo?._annotatedPreviewUrl?.startsWith('data:'))
}
