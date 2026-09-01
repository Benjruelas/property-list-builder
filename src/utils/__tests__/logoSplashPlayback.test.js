/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  beginLogoSplashPlayback,
  remountLogoSplashSource,
  watchLogoSplashProgress,
  getLogoSplashScale,
  getBootLogoLayout,
  setBootLogoLayout,
  clearBootLogoLayout,
  logoDrawRect,
  isLogoSplashGreyPlaceholder,
  isUsableLogoSplashPlateSample,
  isLogoSplashActivelyPlaying,
  prefersDirectLogoVideo,
  applyDirectLogoVideoLayout,
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
      ended: false,
      currentTime: 0.5,
      readyState: 2,
      currentSrc: '',
      src: '',
      style: { setProperty: vi.fn(), width: '', height: '' },
      classList: { add: vi.fn() },
      pause: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      load: vi.fn(),
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
      getAttribute: vi.fn().mockReturnValue('/brand/knockscout-LogoMark-on-black.mp4'),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
  })

  afterEach(() => {
    clearBootLogoLayout()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('plays muted from the start when restart is requested', async () => {
    await beginLogoSplashPlayback(video, { restart: true })
    expect(video.pause).toHaveBeenCalled()
    expect(video.currentTime).toBe(0)
    expect(video.muted).toBe(true)
    expect(video.volume).toBe(0)
    expect(video.setAttribute).toHaveBeenCalledWith('muted', '')
    expect(video.play).toHaveBeenCalled()
  })

  it('does not seek to t=0 when already playing (HTML→React handoff)', async () => {
    video.paused = false
    video.currentTime = 1.25
    await beginLogoSplashPlayback(video, { restart: false })
    expect(video.pause).not.toHaveBeenCalled()
    expect(video.currentTime).toBe(1.25)
    expect(video.play).toHaveBeenCalled()
  })

  it('defaults to continue-without-restart for handoff safety', async () => {
    video.paused = false
    video.currentTime = 0.8
    await beginLogoSplashPlayback(video)
    expect(video.currentTime).toBe(0.8)
    expect(video.pause).not.toHaveBeenCalled()
  })

  it('detects active playback', () => {
    expect(isLogoSplashActivelyPlaying({ paused: false, ended: false, currentTime: 0.2 })).toBe(true)
    expect(isLogoSplashActivelyPlaying({ paused: true, ended: false, currentTime: 1 })).toBe(false)
    expect(isLogoSplashActivelyPlaying({ paused: false, ended: true, currentTime: 4 })).toBe(false)
    expect(isLogoSplashActivelyPlaying({ paused: false, ended: false, currentTime: 0 })).toBe(false)
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
      ended: false,
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
      ended: false,
      currentTime: 0.5,
      readyState: 2,
      pause: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
    }
    // Overlap calls the way HTML→React handoff / Strict remount can.
    const p1 = beginLogoSplashPlayback(first, { restart: true })
    const p2 = beginLogoSplashPlayback(second, { restart: true })
    await Promise.all([p1, p2])
    expect(first.play).toHaveBeenCalled()
    expect(second.play).toHaveBeenCalled()
  })

  it('prefers direct video on iPhone / Capacitor iOS', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)',
      platform: 'iPhone',
      maxTouchPoints: 5,
    })
    expect(prefersDirectLogoVideo()).toBe(true)

    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    })
    vi.stubGlobal('Capacitor', { getPlatform: () => 'ios' })
    expect(prefersDirectLogoVideo()).toBe(true)
  })

  it('does not prefer direct video on desktop Chrome', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
      platform: 'Win32',
      maxTouchPoints: 0,
    })
    vi.stubGlobal('Capacitor', undefined)
    expect(prefersDirectLogoVideo()).toBe(false)
  })

  it('applies locked layout + scale CSS for direct video', () => {
    setBootLogoLayout(390, 700)
    matchMediaMock.mockReturnValue({ matches: false })
    applyDirectLogoVideoLayout(video)
    expect(video.classList.add).toHaveBeenCalledWith('is-direct')
    expect(video.style.setProperty).toHaveBeenCalledWith('--ks-logo-splash-scale', String(LOGO_SPLASH_SCALE_MOBILE))
    expect(video.style.setProperty).toHaveBeenCalledWith('--ks-boot-logo-w', '390px')
    expect(video.style.setProperty).toHaveBeenCalledWith('--ks-boot-logo-h', '700px')
  })

  it('remounts source with a cache-busting query for stall recovery', async () => {
    await remountLogoSplashSource(video, '/brand/knockscout-LogoMark-on-black.mp4')
    expect(video.removeAttribute).toHaveBeenCalledWith('src')
    expect(video.load).toHaveBeenCalled()
    expect(video.src).toMatch(/^\/brand\/knockscout-LogoMark-on-black\.mp4\?splash=\d+$/)
    expect(video.play).toHaveBeenCalled()
  })

  it('watchLogoSplashProgress fires onStalled when time does not advance', () => {
    const onStalled = vi.fn()
    let now = 1_000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const rafCbs = []
    vi.stubGlobal('requestAnimationFrame', (cb) => {
      rafCbs.push(cb)
      return rafCbs.length
    })

    const el = {
      paused: false,
      ended: false,
      currentTime: 0,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    const cancel = watchLogoSplashProgress(el, { timeoutMs: 50, onStalled })

    // First rAF: still within timeout
    expect(rafCbs.length).toBeGreaterThan(0)
    const first = rafCbs.shift()
    now = 1_020
    first(now)
    expect(onStalled).not.toHaveBeenCalled()

    // Second rAF: past timeout with frozen currentTime
    expect(rafCbs.length).toBeGreaterThan(0)
    const second = rafCbs.shift()
    now = 1_060
    second(now)
    expect(onStalled).toHaveBeenCalledTimes(1)
    cancel()
  })

  it('watchLogoSplashProgress does not stall when currentTime advances', () => {
    const onStalled = vi.fn()
    let now = 1_000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const rafCbs = []
    vi.stubGlobal('requestAnimationFrame', (cb) => {
      rafCbs.push(cb)
      return rafCbs.length
    })

    const el = {
      paused: false,
      ended: false,
      currentTime: 0,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    const cancel = watchLogoSplashProgress(el, { timeoutMs: 50, onStalled })
    const first = rafCbs.shift()
    el.currentTime = 0.2
    now = 1_060
    first(now)
    expect(onStalled).not.toHaveBeenCalled()
    expect(rafCbs.length).toBe(0)
    cancel()
  })
})
