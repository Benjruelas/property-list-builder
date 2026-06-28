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
