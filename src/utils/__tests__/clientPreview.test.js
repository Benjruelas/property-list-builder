import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  CLIENT_PREVIEW_RETURN_KEY,
  fetchClientPreviewUrl,
  markClientPreviewOpened,
  openClientPreviewUrl,
  prepareClientPreviewTab,
  closeClientPreviewTab,
  returnToAppFromClientPreview,
  shouldShowOwnerPreviewBack,
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
      json: async () => ({ publicUrl: 'https://app.test/?quote=token123' }),
    })

    const url = await fetchClientPreviewUrl(
      async () => 'auth-token',
      { type: 'quote', id: 'q_1' },
    )

    expect(url).toBe('https://app.test/?quote=token123')
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
  })

  it('stores return url and opens a new tab when allowed', () => {
    const open = vi.fn(() => ({}))
    vi.stubGlobal('window', {
      open,
      location: { pathname: '/app', search: '?panel=quotes', hash: '', href: 'https://app.test/app?panel=quotes' },
    })
    markClientPreviewOpened()
    openClientPreviewUrl('https://app.test/?report=abc')
    expect(sessionStorage.getItem(CLIENT_PREVIEW_RETURN_KEY)).toBe('/app?panel=quotes')
    expect(open).toHaveBeenCalledWith('https://app.test/?report=abc', '_blank', 'noopener,noreferrer')
    vi.unstubAllGlobals()
  })

  it('returns false when popup is blocked', () => {
    const open = vi.fn(() => null)
    vi.stubGlobal('window', { open, location: { href: 'https://app.test/app' } })
    expect(openClientPreviewUrl('https://app.test/?quote=abc')).toBe(false)
    vi.unstubAllGlobals()
  })
})

describe('prepareClientPreviewTab', () => {
  beforeEach(() => {
    sessionStorage.clear()
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
    expect(openClientPreviewUrl('https://app.test/?report=abc', previewWindow)).toBe(true)
    expect(previewWindow.location.href).toBe('https://app.test/?report=abc')
    vi.unstubAllGlobals()
  })
})

describe('owner preview back helpers', () => {
  beforeEach(() => {
    sessionStorage.clear()
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
    vi.stubGlobal('window', { location })
    returnToAppFromClientPreview()
    expect(location.href).toBe('/app?panel=reports')
    expect(sessionStorage.getItem(CLIENT_PREVIEW_RETURN_KEY)).toBeNull()
    vi.unstubAllGlobals()
  })
})
