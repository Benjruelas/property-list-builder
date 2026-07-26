import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { beginLogoSplashPlayback } from '../logoSplashPlayback'

describe('logoSplashPlayback', () => {
  /** @type {HTMLVideoElement} */
  let video

  beforeEach(() => {
    video = {
      muted: true,
      defaultMuted: true,
      volume: 1,
      paused: true,
      ended: false,
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

  it('always starts from 0 on one timeline', async () => {
    await beginLogoSplashPlayback(video)
    expect(video.pause).toHaveBeenCalled()
    expect(video.currentTime).toBe(0)
    expect(video.play).toHaveBeenCalled()
    expect(video.muted).toBe(false)
  })
})
