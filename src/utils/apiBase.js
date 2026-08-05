/**
 * Shared API base URL — web, PWA, and Capacitor native builds.
 */

import { Capacitor } from '@capacitor/core'

const DEFAULT_PRODUCTION_API = 'https://knockscout.app/api'

let warnedMissingNativeApiUrl = false

export function getApiBase() {
  if (import.meta.env.DEV) return '/api'

  const envUrl = import.meta.env.VITE_API_URL || ''

  if (Capacitor.isNativePlatform()) {
    if (!envUrl && !warnedMissingNativeApiUrl) {
      warnedMissingNativeApiUrl = true
      console.error(
        'VITE_API_URL is not set for this native build — falling back to '
        + `${DEFAULT_PRODUCTION_API}. Set VITE_API_URL before running cap:sync `
        + 'so native apps target the correct API origin.'
      )
    }
    return envUrl || DEFAULT_PRODUCTION_API
  }

  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api`
  }

  return envUrl
}

/** Alias used by skipTrace and a few legacy callers. */
export function getApiBaseUrl() {
  return getApiBase()
}

export function isNativeApp() {
  return Capacitor.isNativePlatform()
}

/**
 * Resolve a server-relative `/api/...` path to a fetchable URL.
 * Uses getApiBase() so Capacitor native builds hit the configured API host.
 */
export function resolveApiUrl(url) {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  const base = getApiBase().replace(/\/$/, '')
  if (url.startsWith('/api')) {
    return `${base}${url.slice(4)}`
  }
  return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`
}
