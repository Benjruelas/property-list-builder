/** Prefer annotated flat render, then thumbnail/original for grid display. */
export function getPhotoThumbnailKey(photo) {
  if (!photo) return null
  return photo.annotatedKey || photo.thumbnailKey || photo.key || null
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
  if (photo._annotatedPreviewUrl) {
    return `local-annotated:${photo._annotatedPreviewUrl}:${photo.updatedAt || ''}`
  }
  return `${getPhotoThumbnailKey(photo) || ''}:${photo.updatedAt || ''}`
}

export function shouldUseLocalPhotoPreview(photo) {
  return Boolean(photo?._localPreviewUrl && !photo?.annotatedKey && !photo?._annotatedPreviewUrl)
}

export function shouldUseAnnotatedPreviewUrl(photo) {
  return Boolean(photo?._annotatedPreviewUrl)
}
