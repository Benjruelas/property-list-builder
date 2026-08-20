/**
 * True when running as an iOS Home Screen web app (standalone WKWebView).
 * Google redirect OAuth cannot round-trip into this context — it completes in Safari.
 */
export function isIosStandalone() {
  if (typeof window === 'undefined') return false
  const standalone = (
    window.navigator.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches
  )
  if (!standalone) return false
  return /iP(hone|od|ad)/.test(window.navigator.userAgent)
}
