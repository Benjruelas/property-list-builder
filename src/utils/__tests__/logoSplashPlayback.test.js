/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  beginLogoSplashPlayback,
  getLogoSplashScale,
  getBootLogoLayout,
  setBootLogoLayout,
  clearBootLogoLayout,
  logoDrawRect,
  isLogoSplashGreyPlaceholder,
  isUsableLogoSplashPlateSample,
  BOOT_LOGO_LAYOUT_KEY,
  LOGO_SPLASH_SCALE_DESKTOP,
  LOGO_SPLASH_SCALE_MOBILE,
} from '../logoSplashPlayback'

describe('logoSplashPlayback', () => {
  let video
  let matchMediaMock

  beforeEach(() => {
    matchMediaMock = vi.fn().mockReturnValue({ matches: false })
    vi.stubGlobal('matchMedia', matchMediaMock)
    clearBootLogoLayout()
    video = {
      muted: false,
      defaultMuted: false,
      volume: 1,
      paused: true,
      currentTime: 0.5,
      readyState: 2,
      pause: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
    }
  })

  afterEach(() => {
    clearBootLogoLayout()
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

  it('locks boot logo layout once and clears it', () => {
    expect(getBootLogoLayout()).toBeNull()
    expect(setBootLogoLayout(390, 700)).toEqual({ w: 390, h: 700 })
    expect(window[BOOT_LOGO_LAYOUT_KEY]).toEqual({ w: 390, h: 700 })
    // Later taller viewport must not replace the lock.
    expect(setBootLogoLayout(390, 844)).toEqual({ w: 390, h: 700 })
    expect(getBootLogoLayout()).toEqual({ w: 390, h: 700 })
    clearBootLogoLayout()
    expect(getBootLogoLayout()).toBeNull()
  })

  it('keeps logo dy anchored to locked height when the viewport grows', () => {
    const locked = { lockedW: 390, lockedH: 700, videoW: 1000, videoH: 1000, scale: 1, dpr: 2 }
    const first = logoDrawRect(locked)
    const taller = logoDrawRect({ ...locked, lockedH: 844 })
    // If paint incorrectly used the live taller box, dy would increase.
    expect(first.dy).toBe((700 * 2 - first.dh) / 2)
    expect(taller.dy).toBeGreaterThan(first.dy)

    // Frozen paint path: keep using the original lock after growth.
    const frozenAfterGrowth = logoDrawRect(locked)
    expect(frozenAfterGrowth.dy).toBe(first.dy)
    expect(frozenAfterGrowth.dx).toBe(first.dx)
  })

  it('detects grey placeholder frames (including dark #111) without blocking real frames', () => {
    expect(isLogoSplashGreyPlaceholder(0, 0, 0)).toBe(false)
    expect(isLogoSplashGreyPlaceholder(8, 0, 10)).toBe(false)
    // Capacitor default splash / iOS dark-grey decoder plate
    expect(isLogoSplashGreyPlaceholder(17, 17, 17)).toBe(true)
    expect(isLogoSplashGreyPlaceholder(128, 128, 128)).toBe(true)
    expect(isLogoSplashGreyPlaceholder(180, 180, 182)).toBe(true)
    // Saturated brand / logo pixels must still draw
    expect(isLogoSplashGreyPlaceholder(200, 40, 40)).toBe(false)
    expect(isLogoSplashGreyPlaceholder(17, 81, 239)).toBe(false)
    // Compatibility wrapper: usable == not grey placeholder
    expect(isUsableLogoSplashPlateSample(0, 0, 0)).toBe(true)
    expect(isUsableLogoSplashPlateSample(17, 17, 17)).toBe(false)
    expect(isUsableLogoSplashPlateSample(128, 128, 128)).toBe(false)
    expect(isUsableLogoSplashPlateSample(200, 40, 40)).toBe(true)
  })

  it('still plays a second beginLogoSplashPlayback call (handoff must not be swallowed)', async () => {
    const first = {
      muted: false,
      defaultMuted: false,
      volume: 1,
      paused: true,
      currentTime: 0.5,
      readyState: 2,
      pause: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
    }
    const second = {
      muted: false,
      defaultMuted: false,
      volume: 1,
      paused: true,
      currentTime: 0.5,
      readyState: 2,
      pause: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
    }
    // Overlap calls the way HTML→React handoff / Strict remount can.
    const p1 = beginLogoSplashPlayback(first)
    const p2 = beginLogoSplashPlayback(second)
    await Promise.all([p1, p2])
    expect(first.play).toHaveBeenCalled()
    expect(second.play).toHaveBeenCalled()
  })
})
