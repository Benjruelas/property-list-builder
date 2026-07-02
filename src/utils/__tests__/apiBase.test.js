import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
  },
}))

describe('resolveApiUrl', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { location: { origin: 'https://app.test' } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('returns absolute URLs unchanged', async () => {
    const { resolveApiUrl } = await import('../apiBase')
    expect(resolveApiUrl('https://cdn.test/file.pdf')).toBe('https://cdn.test/file.pdf')
  })

  it('maps /api paths to getApiBase on web production', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_API_URL', '')
    const { resolveApiUrl } = await import('../apiBase')
    expect(resolveApiUrl('/api/public-report?token=abc&download=1'))
      .toBe('https://app.test/api/public-report?token=abc&download=1')
  })

  it('maps /api paths to VITE_API_URL on native', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_API_URL', 'https://api.prod.test/api')
    const { Capacitor } = await import('@capacitor/core')
    Capacitor.isNativePlatform.mockReturnValue(true)
    const { resolveApiUrl } = await import('../apiBase')
    expect(resolveApiUrl('/api/public-report?token=abc&download=1'))
      .toBe('https://api.prod.test/api/public-report?token=abc&download=1')
  })

  it('uses relative /api base in dev', async () => {
    vi.stubEnv('DEV', true)
    const { resolveApiUrl } = await import('../apiBase')
    expect(resolveApiUrl('/api/public-report?download=1'))
      .toBe('/api/public-report?download=1')
  })
})
