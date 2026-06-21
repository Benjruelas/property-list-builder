/**
 * Per-entity storage limits (not per-file).
 */

export const ENTITY_STORAGE_LIMITS = {
  deal: 10 * 1024 * 1024,
  dealPhotos: 100 * 1024 * 1024,
  lead: 100 * 1024 * 1024,
  leadFiles: 10 * 1024 * 1024,
}

export const MAX_SINGLE_UPLOAD_BYTES = 10 * 1024 * 1024

export function sumDealFileBytes(files) {
  return (Array.isArray(files) ? files : []).reduce((sum, f) => sum + (Number(f.size) || 0), 0)
}

export function sumLeadPhotoBytes(photos) {
  return (Array.isArray(photos) ? photos : []).reduce((sum, p) => {
    return sum
      + (Number(p.size) || 0)
      + (Number(p.thumbnailSize) || 0)
      + (Number(p.annotatedSize) || 0)
  }, 0)
}

export function formatStorageBytes(bytes) {
  const n = Math.max(0, Number(bytes) || 0)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

export function storageUsagePercent(used, limit) {
  if (!limit) return 0
  return Math.min(100, Math.round((Math.max(0, used) / limit) * 100))
}

export function entityStorageError(entityType, limit) {
  const label = entityType === 'deal'
    ? 'Deal'
    : entityType === 'dealPhotos'
      ? 'Deal photo'
    : entityType === 'leadFiles'
      ? 'Lead file'
      : 'Lead photo'
  return `${label} storage limit reached (${formatStorageBytes(limit)} total)`
}

export function estimateDataUrlBytes(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return 0
  const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '')
  return Math.round((base64.length * 3) / 4)
}
