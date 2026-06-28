/** Revoke a blob URL after the browser has painted the replacement src. */
export function deferRevokeObjectURL(url) {
  if (!url?.startsWith('blob:')) return
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        URL.revokeObjectURL(url)
      } catch {
        /* ignore */
      }
    })
  })
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read image'))
    reader.readAsDataURL(blob)
  })
}

/** Safe optimistic gallery preview — data URLs cannot be revoked like blob URLs. */
export function isStablePhotoPreviewUrl(url) {
  return typeof url === 'string' && (url.startsWith('data:') || url.startsWith('blob:'))
}

export function isRevocableBlobUrl(url) {
  return typeof url === 'string' && url.startsWith('blob:')
}
