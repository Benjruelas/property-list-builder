/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  beginLogoSplashPlayback,
  getLogoSplashScale,
  LOGO_SPLASH_SCALE_DESKTOP,
  LOGO_SPLASH_SCALE_MOBILE,
} from '../logoSplashPlayback'

describe('logoSplashPlayback', () => {
  let video
  let matchMediaMock

  beforeEach(() => {
    matchMediaMock = vi.fn().mockReturnValue({ matches: false })
    vi.stubGlobal('matchMedia', matchMediaMock)
    video = {
      muted: false,
      defaultMuted: false,
      volume: 1,
      paused: true,
      currentTime: 0.5,
      pause: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('plays muted from the start', async () => {
    await beginLogoSplashPlayback(video)
    expect(video.pause).toHaveBeenCalled()
    expect(video.currentTime).toBe(0)
    expect(video.muted).toBe(true)
    expect(video.volume).toBe(0)
    expect(video.setAttribute).toHaveBeenCalledWith('muted', '')
    expect(video.play).toHaveBeenCalled()
  })

  it('uses a smaller logo scale on desktop viewports', () => {
    matchMediaMock.mockReturnValue({ matches: false })
    expect(getLogoSplashScale()).toBe(LOGO_SPLASH_SCALE_MOBILE)

    matchMediaMock.mockReturnValue({ matches: true })
    expect(getLogoSplashScale()).toBe(LOGO_SPLASH_SCALE_DESKTOP)
    expect(matchMediaMock).toHaveBeenCalledWith('(min-width: 768px)')
  })
})
