import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchClientPreviewUrl, openClientPreviewUrl } from '../clientPreview'

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
  it('opens url in new tab', () => {
    const open = vi.fn()
    vi.stubGlobal('window', { open })
    openClientPreviewUrl('https://app.test/?report=abc')
    expect(open).toHaveBeenCalledWith('https://app.test/?report=abc', '_blank', 'noopener,noreferrer')
    vi.unstubAllGlobals()
  })
})
