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

  // Hard navigation through the recover path so a controlling SW also nukes itself.
  const url = new URL(window.location.href)
  url.searchParams.set('recover', '1')
  window.location.replace(url.toString())
}
