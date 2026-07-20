import { beforeEach, describe, expect, it, vi } from 'vitest'

// Node test environment has no Web Storage; provide a minimal localStorage.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(String(key), String(value)) },
    removeItem: (key) => { store.delete(key) },
    clear: () => { store.clear() },
  }
}

const native = vi.hoisted(() => ({ value: false }))
const geolocationPlugin = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  getCurrentPosition: vi.fn(),
  watchPosition: vi.fn(),
  clearWatch: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => native.value) },
}))

vi.mock('@capacitor/geolocation', () => ({
  Geolocation: geolocationPlugin,
}))

import {
  LOCATION_ACCESS_ATTAINED_KEY,
  LOCATION_PERMISSION,
  checkLocationPermission,
  getCurrentPositionWithFallback,
  hasAttainedLocationAccess,
  normalizeNativeLocationPermission,
  requestLocationAccess,
  setLocationAccessAttained,
  shouldProbeLocationOnStartup,
  syncLocationAccessAttained,
  watchLocation,
} from '../geolocation'

const position = {
  coords: { latitude: 32.77, longitude: -96.79, accuracy: 10 },
  timestamp: 1,
}

function browserNavigator(overrides = {}) {
  return {
    maxTouchPoints: 0,
    geolocation: {
      getCurrentPosition: vi.fn(),
      watchPosition: vi.fn(),
      clearWatch: vi.fn(),
    },
    permissions: { query: vi.fn() },
    ...overrides,
  }
}

describe('location permission adapter', () => {
  beforeEach(() => {
    native.value = false
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('persists and clears the location-access attained flag', () => {
    expect(hasAttainedLocationAccess()).toBe(false)
    setLocationAccessAttained(true)
    expect(localStorage.getItem(LOCATION_ACCESS_ATTAINED_KEY)).toBe('1')
    expect(hasAttainedLocationAccess()).toBe(true)
    setLocationAccessAttained(false)
    expect(hasAttainedLocationAccess()).toBe(false)
  })

  it('syncs attained flag from granted and denied states only', () => {
    syncLocationAccessAttained(LOCATION_PERMISSION.GRANTED)
    expect(hasAttainedLocationAccess()).toBe(true)
    syncLocationAccessAttained(LOCATION_PERMISSION.PROMPT)
    expect(hasAttainedLocationAccess()).toBe(true)
    syncLocationAccessAttained(LOCATION_PERMISSION.DENIED)
    expect(hasAttainedLocationAccess()).toBe(false)
  })

  it('allows a startup probe only when check is prompt and access was attained', () => {
    expect(shouldProbeLocationOnStartup(LOCATION_PERMISSION.PROMPT, true)).toBe(true)
    expect(shouldProbeLocationOnStartup(LOCATION_PERMISSION.PROMPT, false)).toBe(false)
    expect(shouldProbeLocationOnStartup(LOCATION_PERMISSION.GRANTED, true)).toBe(false)
    expect(shouldProbeLocationOnStartup(LOCATION_PERMISSION.DENIED, true)).toBe(false)
    setLocationAccessAttained(true)
    expect(shouldProbeLocationOnStartup(LOCATION_PERMISSION.PROMPT)).toBe(true)
  })

  it('normalizes native precise and approximate grants', () => {
    expect(normalizeNativeLocationPermission({ location: 'granted' })).toBe(LOCATION_PERMISSION.GRANTED)
    expect(normalizeNativeLocationPermission({ location: 'denied', coarseLocation: 'granted' }))
      .toBe(LOCATION_PERMISSION.GRANTED)
    expect(normalizeNativeLocationPermission({ location: 'prompt-with-rationale' }))
      .toBe(LOCATION_PERMISSION.PROMPT)
    expect(normalizeNativeLocationPermission({ location: 'denied' })).toBe(LOCATION_PERMISSION.DENIED)
    expect(normalizeNativeLocationPermission({})).toBe(LOCATION_PERMISSION.UNSUPPORTED)
  })

  it('checks browser permission without requesting a position', async () => {
    const nav = browserNavigator()
    nav.permissions.query.mockResolvedValue({ state: 'granted' })
    vi.stubGlobal('navigator', nav)

    await expect(checkLocationPermission()).resolves.toBe(LOCATION_PERMISSION.GRANTED)
    expect(nav.permissions.query).toHaveBeenCalledWith({ name: 'geolocation' })
    expect(nav.geolocation.getCurrentPosition).not.toHaveBeenCalled()
  })

  it('uses prompt when the browser permission query is unavailable', async () => {
    vi.stubGlobal('navigator', browserNavigator({ permissions: undefined }))
    await expect(checkLocationPermission()).resolves.toBe(LOCATION_PERMISSION.PROMPT)
  })

  it('reports unsupported when geolocation is absent', async () => {
    vi.stubGlobal('navigator', {})
    await expect(checkLocationPermission()).resolves.toBe(LOCATION_PERMISSION.UNSUPPORTED)
  })

  it('does not retry browser permission denial', async () => {
    const nav = browserNavigator()
    nav.geolocation.getCurrentPosition.mockImplementation((_success, failure) => {
      failure({ code: 1, message: 'Permission denied' })
    })
    vi.stubGlobal('navigator', nav)

    await expect(getCurrentPositionWithFallback()).rejects.toMatchObject({ code: 1 })
    expect(nav.geolocation.getCurrentPosition).toHaveBeenCalledTimes(1)
  })

  it('retries a recoverable browser failure and returns the next fix', async () => {
    const nav = browserNavigator()
    nav.geolocation.getCurrentPosition
      .mockImplementationOnce((_success, failure) => failure({ code: 3, message: 'Timeout' }))
      .mockImplementationOnce((success) => success(position))
    vi.stubGlobal('navigator', nav)

    await expect(getCurrentPositionWithFallback()).resolves.toBe(position)
    expect(nav.geolocation.getCurrentPosition).toHaveBeenCalledTimes(2)
  })

  it('returns the first browser fix with an explicit access request', async () => {
    const nav = browserNavigator()
    nav.geolocation.getCurrentPosition.mockImplementation((success) => success(position))
    vi.stubGlobal('navigator', nav)

    await expect(requestLocationAccess()).resolves.toEqual({
      state: LOCATION_PERMISSION.GRANTED,
      position,
    })
    expect(nav.geolocation.getCurrentPosition).toHaveBeenCalledTimes(1)
    expect(hasAttainedLocationAccess()).toBe(true)
  })

  it('clears attained flag when an explicit access request is denied', async () => {
    setLocationAccessAttained(true)
    const nav = browserNavigator()
    nav.geolocation.getCurrentPosition.mockImplementation((_success, failure) => {
      failure({ code: 1, message: 'Permission denied' })
    })
    vi.stubGlobal('navigator', nav)

    await expect(requestLocationAccess()).resolves.toMatchObject({
      state: LOCATION_PERMISSION.DENIED,
      position: null,
    })
    expect(hasAttainedLocationAccess()).toBe(false)
  })

  it('requests and watches native foreground location with cleanup', async () => {
    native.value = true
    geolocationPlugin.requestPermissions.mockResolvedValue({ location: 'granted' })
    geolocationPlugin.getCurrentPosition.mockResolvedValue(position)
    geolocationPlugin.watchPosition.mockResolvedValue('watch-1')

    await expect(requestLocationAccess()).resolves.toEqual({
      state: LOCATION_PERMISSION.GRANTED,
      position,
    })
    expect(hasAttainedLocationAccess()).toBe(true)
    const stop = await watchLocation(vi.fn(), vi.fn())
    stop()
    stop()

    expect(geolocationPlugin.requestPermissions).toHaveBeenCalledTimes(1)
    expect(geolocationPlugin.getCurrentPosition).toHaveBeenCalledTimes(1)
    expect(geolocationPlugin.clearWatch).toHaveBeenCalledOnce()
    expect(geolocationPlugin.clearWatch).toHaveBeenCalledWith({ id: 'watch-1' })
  })
})
