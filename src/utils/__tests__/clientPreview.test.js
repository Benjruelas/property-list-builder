import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The `node` test environment does not expose Web Storage; provide a minimal
// in-memory sessionStorage so storage-backed helpers can be exercised.
if (typeof globalThis.sessionStorage === 'undefined') {
  const store = new Map()
  globalThis.sessionStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)) },
    removeItem: (key) => { store.delete(key) },
    clear: () => { store.clear() },
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)) },
    removeItem: (key) => { store.delete(key) },
    clear: () => { store.clear() },
  }
}

import {
  CLIENT_PREVIEW_RETURN_KEY,
  CLIENT_PREVIEW_NAV_KEY,
  CLIENT_PREVIEW_RESTORE_FLAG,
  fetchClientPreviewUrl,
  markClientPreviewOpened,
  openClientPreviewUrl,
  prepareClientPreviewTab,
  closeClientPreviewTab,
  returnToAppFromClientPreview,
  shouldShowOwnerPreviewBack,
  isPublicPreviewRoute,
  persistNavStack,
  readPersistedNavStack,
  consumeNavRestoreFlag,
  clearClientPreviewHandoff,
} from '../clientPreview'

describe('fetchClientPreviewUrl', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts type and id and returns publicUrl', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ publicUrl: 'https://app.test/q/token123' }),
    })

    const url = await fetchClientPreviewUrl(
      async () => 'auth-token',
      { type: 'quote', id: 'q_1' },
    )

    expect(url).toBe('https://app.test/q/token123')
    expect(fetch).toHaveBeenCalledWith(
      '/api/client-preview-link',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer auth-token',
        }),
        body: JSON.stringify({ type: 'quote', id: 'q_1' }),
      }),
    )
  })

  it('throws when not signed in', async () => {
    await expect(fetchClientPreviewUrl(async () => null, { type: 'report', id: 'r1' }))
      .rejects.toThrow('Sign in required')
  })

  it('throws API error message', async () => {
    fetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Quote not found' }),
    })

    await expect(fetchClientPreviewUrl(async () => 't', { type: 'quote', id: 'missing' }))
      .rejects.toThrow('Quote not found')
  })
})

describe('openClientPreviewUrl', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
  })

  it('stores return url and opens a new tab when allowed', () => {
    const open = vi.fn(() => ({}))
    vi.stubGlobal('window', {
      open,
      location: { pathname: '/app', search: '?panel=quotes', hash: '', href: 'https://app.test/app?panel=quotes' },
    })
    markClientPreviewOpened()
    openClientPreviewUrl('https://app.test/r/abc')
    expect(sessionStorage.getItem(CLIENT_PREVIEW_RETURN_KEY)).toBe('/app?panel=quotes')
    expect(localStorage.getItem(CLIENT_PREVIEW_RETURN_KEY)).toBe('/app?panel=quotes')
    expect(open).toHaveBeenCalledWith('https://app.test/r/abc', '_blank', 'noopener,noreferrer')
    vi.unstubAllGlobals()
  })

  it('returns false when popup is blocked', () => {
    const open = vi.fn(() => null)
    vi.stubGlobal('window', { open, location: { href: 'https://app.test/app' } })
    expect(openClientPreviewUrl('https://app.test/q/abc')).toBe(false)
    vi.unstubAllGlobals()
  })
})

describe('prepareClientPreviewTab', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
  })

  it('opens a blank tab and stores return url', () => {
    const previewWindow = {}
    const open = vi.fn(() => previewWindow)
    vi.stubGlobal('window', {
      open,
      location: { pathname: '/app', search: '', hash: '' },
    })
    expect(prepareClientPreviewTab()).toBe(previewWindow)
    expect(open).toHaveBeenCalledWith('about:blank', '_blank')
    expect(sessionStorage.getItem(CLIENT_PREVIEW_RETURN_KEY)).toBe('/app')
    vi.unstubAllGlobals()
  })

  it('navigates a prepared tab when url is ready', () => {
    const previewWindow = { closed: false, location: { href: 'about:blank' } }
    vi.stubGlobal('window', { open: vi.fn(), location: { pathname: '/', search: '', hash: '' } })
    expect(openClientPreviewUrl('https://app.test/r/abc', previewWindow)).toBe(true)
    expect(previewWindow.location.href).toBe('https://app.test/r/abc')
    vi.unstubAllGlobals()
  })
})

describe('owner preview back helpers', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
  })

  it('shouldShowOwnerPreviewBack only when API preview flag is true', () => {
    expect(shouldShowOwnerPreviewBack({ preview: true })).toBe(true)
    expect(shouldShowOwnerPreviewBack({ preview: false })).toBe(false)
    expect(shouldShowOwnerPreviewBack()).toBe(false)
    sessionStorage.setItem(CLIENT_PREVIEW_RETURN_KEY, '/app')
    expect(shouldShowOwnerPreviewBack()).toBe(false)
  })

  it('returnToAppFromClientPreview restores stored url', () => {
    sessionStorage.setItem(CLIENT_PREVIEW_RETURN_KEY, '/app?panel=reports')
    const location = { href: 'https://app.test/?report=token', origin: 'https://app.test' }
    vi.stubGlobal('window', { location, opener: null, close: vi.fn() })
    returnToAppFromClientPreview()
    expect(location.href).toBe('/app?panel=reports')
    expect(sessionStorage.getItem(CLIENT_PREVIEW_RETURN_KEY)).toBeNull()
    vi.unstubAllGlobals()
  })

  it('returnToAppFromClientPreview focuses opener and closes preview tab', () => {
    const openerSession = new Map()
    const opener = {
      closed: false,
      focus: vi.fn(),
      sessionStorage: {
        getItem: (key) => (openerSession.has(key) ? openerSession.get(key) : null),
        setItem: (key, value) => { openerSession.set(key, String(value)) },
        removeItem: (key) => { openerSession.delete(key) },
      },
      localStorage: {
        getItem: () => null,
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    }
    openerSession.set(CLIENT_PREVIEW_RETURN_KEY, '/app')
    openerSession.set(CLIENT_PREVIEW_RESTORE_FLAG, '1')
    const close = vi.fn()
    vi.stubGlobal('window', {
      location: { href: 'https://app.test/r/token', origin: 'https://app.test' },
      opener,
      close,
    })
    returnToAppFromClientPreview()
    expect(opener.focus).toHaveBeenCalled()
    expect(close).toHaveBeenCalled()
    expect(openerSession.get(CLIENT_PREVIEW_RETURN_KEY)).toBeUndefined()
    expect(openerSession.get(CLIENT_PREVIEW_RESTORE_FLAG)).toBeUndefined()
    vi.unstubAllGlobals()
  })

  it('returnToAppFromClientPreview reads return url from localStorage when sessionStorage is empty', () => {
    localStorage.setItem(CLIENT_PREVIEW_RETURN_KEY, '/app?panel=reports')
    const location = { href: 'https://app.test/r/token', origin: 'https://app.test' }
    vi.stubGlobal('window', { location, opener: null, close: vi.fn() })
    returnToAppFromClientPreview()
    expect(location.href).toBe('/app?panel=reports')
    expect(localStorage.getItem(CLIENT_PREVIEW_RETURN_KEY)).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('nav stack persistence helpers', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('markClientPreviewOpened sets the durable restore flag', () => {
    vi.stubGlobal('window', { location: { pathname: '/', search: '', hash: '' } })
    markClientPreviewOpened()
    expect(sessionStorage.getItem(CLIENT_PREVIEW_RESTORE_FLAG)).toBe('1')
    expect(localStorage.getItem(CLIENT_PREVIEW_RESTORE_FLAG)).toBe('1')
  })

  it('isPublicPreviewRoute detects report/quote/form params and short paths', () => {
    vi.stubGlobal('window', { location: { pathname: '/', search: '?report=abc' } })
    expect(isPublicPreviewRoute()).toBe(true)
    vi.stubGlobal('window', { location: { pathname: '/r/abc', search: '' } })
    expect(isPublicPreviewRoute()).toBe(true)
    vi.stubGlobal('window', { location: { pathname: '/', search: '?quote=abc' } })
    expect(isPublicPreviewRoute()).toBe(true)
    vi.stubGlobal('window', { location: { pathname: '/q/abc', search: '' } })
    expect(isPublicPreviewRoute()).toBe(true)
    vi.stubGlobal('window', { location: { pathname: '/', search: '?form=abc' } })
    expect(isPublicPreviewRoute()).toBe(true)
    vi.stubGlobal('window', { location: { pathname: '/', search: '?panel=reports' } })
    expect(isPublicPreviewRoute()).toBe(false)
  })

  it('persistNavStack / readPersistedNavStack round trip on app routes', () => {
    vi.stubGlobal('window', { location: { search: '?panel=reports' } })
    const stack = [{ type: 'reports' }, { type: 'reports.editor', report: { id: 'r1' } }]
    persistNavStack(stack)
    expect(sessionStorage.getItem(CLIENT_PREVIEW_NAV_KEY)).toBe(JSON.stringify(stack))
    expect(localStorage.getItem(CLIENT_PREVIEW_NAV_KEY)).toBe(JSON.stringify(stack))
    expect(readPersistedNavStack()).toEqual(stack)
  })

  it('readPersistedNavStack falls back to localStorage', () => {
    const stack = [{ type: 'reports.detail', reportId: 'r1' }]
    localStorage.setItem(CLIENT_PREVIEW_NAV_KEY, JSON.stringify(stack))
    expect(readPersistedNavStack()).toEqual(stack)
  })

  it('clearClientPreviewHandoff removes keys from both storages', () => {
    sessionStorage.setItem(CLIENT_PREVIEW_RETURN_KEY, '/app')
    localStorage.setItem(CLIENT_PREVIEW_RETURN_KEY, '/app')
    sessionStorage.setItem(CLIENT_PREVIEW_RESTORE_FLAG, '1')
    localStorage.setItem(CLIENT_PREVIEW_RESTORE_FLAG, '1')
    clearClientPreviewHandoff()
    expect(sessionStorage.getItem(CLIENT_PREVIEW_RETURN_KEY)).toBeNull()
    expect(localStorage.getItem(CLIENT_PREVIEW_RETURN_KEY)).toBeNull()
    expect(sessionStorage.getItem(CLIENT_PREVIEW_RESTORE_FLAG)).toBeNull()
    expect(localStorage.getItem(CLIENT_PREVIEW_RESTORE_FLAG)).toBeNull()
  })

  it('persistNavStack is a no-op on public preview routes', () => {
    vi.stubGlobal('window', { location: { pathname: '/r/token', search: '' } })
    persistNavStack([{ type: 'reports' }])
    expect(sessionStorage.getItem(CLIENT_PREVIEW_NAV_KEY)).toBeNull()
    expect(readPersistedNavStack()).toBeNull()
  })

  it('consumeNavRestoreFlag reads then clears the flag', () => {
    expect(consumeNavRestoreFlag()).toBe(false)
    sessionStorage.setItem(CLIENT_PREVIEW_RESTORE_FLAG, '1')
    expect(consumeNavRestoreFlag()).toBe(true)
    expect(sessionStorage.getItem(CLIENT_PREVIEW_RESTORE_FLAG)).toBeNull()
    expect(consumeNavRestoreFlag()).toBe(false)
  })
})
