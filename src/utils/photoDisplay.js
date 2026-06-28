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
  if (photo._annotatedPreviewUrl) {
    return `local-annotated:${photo.updatedAt || 'pending'}`
  }
  return `${getPhotoThumbnailKey(photo) || ''}:${photo.updatedAt || ''}`
}

export function shouldUseLocalPhotoPreview(photo) {
  return Boolean(photo?._localPreviewUrl && !photo?.annotatedKey && !photo?._annotatedPreviewUrl)
}

export function shouldUseAnnotatedPreviewUrl(photo) {
  return Boolean(photo?._annotatedPreviewUrl?.startsWith('data:'))
}
