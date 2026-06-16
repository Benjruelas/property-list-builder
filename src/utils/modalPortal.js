/** Fullscreen overlays opened from map panels must portal here, not document.body. */
export function getModalPortalContainer() {
  if (typeof document === 'undefined') return null
  return document.getElementById('modal-root') || document.body
}
