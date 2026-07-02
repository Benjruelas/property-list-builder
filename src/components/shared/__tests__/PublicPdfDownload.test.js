import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { resolvePublicAssetUrl } from '../PublicPdfDownload'

vi.mock('@/utils/apiBase', () => ({
  resolveApiUrl: (url) => `https://api.test${url.startsWith('/api') ? url.slice(4) : url}`,
}))

describe('resolvePublicAssetUrl', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it('delegates to resolveApiUrl for server paths', () => {
    expect(resolvePublicAssetUrl('/api/public-report?download=1'))
      .toBe('https://api.test/public-report?download=1')
  })
})
