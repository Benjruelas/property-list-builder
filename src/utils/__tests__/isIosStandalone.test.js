import { describe, it, expect, afterEach, vi } from 'vitest'
import { isIosStandalone } from '../isIosStandalone.js'

describe('isIosStandalone', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns false when window is unavailable', () => {
    vi.stubGlobal('window', undefined)
    expect(isIosStandalone()).toBe(false)
  })

  it('returns true for iPhone standalone', () => {
    vi.stubGlobal('window', {
      navigator: {
        standalone: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      },
      matchMedia: () => ({ matches: false }),
    })
    expect(isIosStandalone()).toBe(true)
  })

  it('returns true for iPad with display-mode standalone', () => {
    vi.stubGlobal('window', {
      navigator: {
        standalone: false,
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)',
      },
      matchMedia: (q) => ({ matches: q === '(display-mode: standalone)' }),
    })
    expect(isIosStandalone()).toBe(true)
  })

  it('returns false for iPhone Safari tab (not standalone)', () => {
    vi.stubGlobal('window', {
      navigator: {
        standalone: false,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      },
      matchMedia: () => ({ matches: false }),
    })
    expect(isIosStandalone()).toBe(false)
  })

  it('returns false for desktop standalone PWA', () => {
    vi.stubGlobal('window', {
      navigator: {
        standalone: undefined,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      },
      matchMedia: () => ({ matches: true }),
    })
    expect(isIosStandalone()).toBe(false)
  })
})
