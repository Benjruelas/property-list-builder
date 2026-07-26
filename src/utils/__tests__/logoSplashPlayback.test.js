import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  SOUND_SYNC_RESTART_SEC,
  syncLogoVideoAudio,
} from '../logoSplashPlayback'

describe('logoSplashPlayback', () => {
  /** @type {HTMLVideoElement} */
  let video

  beforeEach(() => {
    video = {
      muted: true,
      defaultMuted: true,
      volume: 1,
      paused: false,
      ended: false,
      currentTime: 0.5,
      play: vi.fn().mockResolvedValue(undefined),
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('restarts from 0 when unmuting after muted playback advanced', async () => {
    await syncLogoVideoAudio(video)
    expect(video.muted).toBe(false)
    expect(video.currentTime).toBe(0)
    expect(video.play).toHaveBeenCalled()
  })

  it('does not restart when still at the start of the clip', async () => {
    video.currentTime = SOUND_SYNC_RESTART_SEC / 2
    await syncLogoVideoAudio(video)
    expect(video.currentTime).toBe(SOUND_SYNC_RESTART_SEC / 2)
  })
})
