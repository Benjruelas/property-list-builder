/**
 * Clear service-worker caches / registration and basemap session so a stuck
 * iOS Home Screen / Safari Web Clip can recover from poisoned offline state.
 */

import { BASEMAP_SESSION_STORAGE_KEY } from '../hooks/useBasemapStyle'

/**
 * @returns {Promise<void>}
 */
export async function resetSiteCache() {
  try {
    sessionStorage.removeItem(BASEMAP_SESSION_STORAGE_KEY)
  } catch {
    /* private mode / quota */
  }

  if (typeof caches !== 'undefined' && caches?.keys) {
    try {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    } catch {
      /* ignore Cache Storage failures */
    }
  }

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((reg) => reg.unregister()))
    } catch {
      /* ignore */
    }
  }

  // Prefer the static recover page so an old PrecacheRoute cannot swallow ?recover=1.
  window.location.replace(`/recover.html?t=${Date.now()}`)
}
