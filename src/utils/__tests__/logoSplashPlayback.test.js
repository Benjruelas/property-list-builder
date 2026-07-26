import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { beginLogoSplashPlayback } from '../logoSplashPlayback'

describe('logoSplashPlayback', () => {
  let video

  beforeEach(() => {
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
})
