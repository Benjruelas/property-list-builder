// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

const { resetSiteCache } = await import('../resetSiteCache')
const { BASEMAP_SESSION_STORAGE_KEY } = await import('../../hooks/useBasemapStyle')

describe('resetSiteCache', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    sessionStorage.clear()
  })

  it('clears basemap session, deletes caches, unregisters SW, and reloads', async () => {
    sessionStorage.setItem(BASEMAP_SESSION_STORAGE_KEY, JSON.stringify({ satellite: { expiry: 1 } }))

    const deleteCache = vi.fn(async () => true)
    vi.stubGlobal('caches', {
      keys: vi.fn(async () => ['knockscout-map-tiles-v2', 'workbox-precache-v2']),
      delete: deleteCache,
    })

    const unregister = vi.fn(async () => true)
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistrations: vi.fn(async () => [{ unregister }]),
      },
    })

    const replace = vi.fn()
    const locationDescriptor = Object.getOwnPropertyDescriptor(window, 'location')
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        href: 'https://knockscout.app/',
        pathname: '/',
        search: '',
        hash: '',
        replace,
      },
    })

    try {
      await resetSiteCache()
    } finally {
      if (locationDescriptor) {
        Object.defineProperty(window, 'location', locationDescriptor)
      }
    }

    expect(sessionStorage.getItem(BASEMAP_SESSION_STORAGE_KEY)).toBeNull()
    expect(deleteCache).toHaveBeenCalledWith('knockscout-map-tiles-v2')
    expect(deleteCache).toHaveBeenCalledWith('workbox-precache-v2')
    expect(unregister).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledTimes(1)
    expect(String(replace.mock.calls[0][0])).toContain('/recover.html')
  })
})
