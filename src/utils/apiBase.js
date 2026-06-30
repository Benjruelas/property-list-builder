/**
 * Shared API base URL — web, PWA, and Capacitor native builds.
 */

import { Capacitor } from '@capacitor/core'

const DEFAULT_PRODUCTION_API = 'https://property-list-builder.vercel.app/api'

export function getApiBase() {
  if (import.meta.env.DEV) return '/api'

  const envUrl = import.meta.env.VITE_API_URL || ''

  if (Capacitor.isNativePlatform()) {
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
