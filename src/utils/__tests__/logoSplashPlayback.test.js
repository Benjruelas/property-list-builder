/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  beginLogoSplashPlayback,
  remountLogoSplashSource,
  playLogoSplashFromBlob,
  fetchLogoSplashBlobUrl,
  attachLogoSplashBlobSource,
  clearLogoSplashBlobCache,
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

  beforeEach(() => {
    clearBootLogoLayout()
    clearLogoSplashBlobCache()
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
      firstChild: null,
      autoplay: false,
      style: { setProperty: vi.fn(), removeProperty: vi.fn(), width: '', height: '' },
      classList: { add: vi.fn() },
      pause: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      load: vi.fn(),
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
      getAttribute: vi.fn().mockReturnValue(null),
      appendChild: vi.fn(function append(node) {
        this.firstChild = node
        return node
      }),
      removeChild: vi.fn(function remove() {
        this.firstChild = null
      }),
      querySelector: vi.fn().mockReturnValue(null),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/logo-splash')
    globalThis.URL.revokeObjectURL = vi.fn()
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob([new Uint8Array([0, 0, 0, 1])], { type: 'video/mp4' }),
    })
  })

  afterEach(() => {
    clearBootLogoLayout()
    clearLogoSplashBlobCache()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('plays muted without seeking (seek+play freezes iOS 26 PWA media)', async () => {
    const before = video.currentTime
    await beginLogoSplashPlayback(video, { restart: true })
    expect(video.pause).not.toHaveBeenCalled()
    expect(video.currentTime).toBe(before)
    expect(video.muted).toBe(true)
    expect(video.volume).toBe(0)
    expect(video.setAttribute).toHaveBeenCalledWith('muted', '')
    expect(video.setAttribute).toHaveBeenCalledWith('autoplay', '')
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

  it('uses unit cover scale (no mobile zoom hack)', () => {
    expect(getLogoSplashScale()).toBe(1)
    expect(LOGO_SPLASH_SCALE_MOBILE).toBe(1)
    expect(LOGO_SPLASH_SCALE_DESKTOP).toBe(1)
  })

  it('locks boot logo layout once and clears it', () => {
    expect(getBootLogoLayout()).toBeNull()
    expect(setBootLogoLayout(390, 700)).toEqual({ w: 390, h: 700 })
    expect(window[BOOT_LOGO_LAYOUT_KEY]).toEqual({ w: 390, h: 700 })
    expect(setBootLogoLayout(390, 844)).toEqual({ w: 390, h: 700 })
    clearBootLogoLayout()
    expect(getBootLogoLayout()).toBeNull()
  })

  it('keeps logo dy anchored to locked height when the viewport grows', () => {
    const locked = { lockedW: 390, lockedH: 700, videoW: 1000, videoH: 1000, scale: 1, dpr: 2 }
    const first = logoDrawRect(locked)
    const taller = logoDrawRect({ ...locked, lockedH: 844 })
    expect(first.dy).toBe((700 * 2 - first.dh) / 2)
    expect(taller.dy).toBeGreaterThan(first.dy)
  })

  it('detects grey placeholder frames without blocking real frames', () => {
    expect(isLogoSplashGreyPlaceholder(0, 0, 0)).toBe(false)
    expect(isLogoSplashGreyPlaceholder(17, 17, 17)).toBe(true)
    expect(isLogoSplashGreyPlaceholder(17, 81, 239)).toBe(false)
    expect(isUsableLogoSplashPlateSample(0, 0, 0)).toBe(true)
    expect(isUsableLogoSplashPlateSample(17, 17, 17)).toBe(false)
  })

  it('still plays a second beginLogoSplashPlayback call', async () => {
    const first = { ...video, play: vi.fn().mockResolvedValue(undefined), pause: vi.fn(), setAttribute: vi.fn() }
    const second = { ...video, play: vi.fn().mockResolvedValue(undefined), pause: vi.fn(), setAttribute: vi.fn() }
    await Promise.all([
      beginLogoSplashPlayback(first, { restart: true }),
      beginLogoSplashPlayback(second, { restart: true }),
    ])
    expect(first.play).toHaveBeenCalled()
    expect(second.play).toHaveBeenCalled()
  })

  it('always prefers direct cover video', () => {
    expect(prefersDirectLogoVideo()).toBe(true)
  })

  it('applies cover class for direct video', () => {
    applyDirectLogoVideoLayout(video)
    expect(video.classList.add).toHaveBeenCalledWith('is-cover')
  })

  it('fetches a blob URL and attaches via <source>', async () => {
    const objectUrl = await fetchLogoSplashBlobUrl('/brand/knockscout-LogoMark-on-black.mp4')
    expect(objectUrl).toBe('blob:http://localhost/logo-splash')
    expect(fetch).toHaveBeenCalled()
    attachLogoSplashBlobSource(video, objectUrl)
    expect(video.removeAttribute).toHaveBeenCalledWith('src')
    expect(video.appendChild).toHaveBeenCalled()
    const source = video.appendChild.mock.calls[0][0]
    expect(source.type).toBe('video/mp4')
    expect(source.src).toBe(objectUrl)
    expect(video.load).toHaveBeenCalled()
  })

  it('playLogoSplashFromBlob loads blob then plays', async () => {
    await playLogoSplashFromBlob(video, '/brand/knockscout-LogoMark-on-black.mp4')
    expect(fetch).toHaveBeenCalled()
    expect(video.appendChild).toHaveBeenCalled()
    expect(video.play).toHaveBeenCalled()
  })

  it('remounts via a cache-busted blob source for stall recovery', async () => {
    await remountLogoSplashSource(video, '/brand/knockscout-LogoMark-on-black.mp4')
    expect(fetch).toHaveBeenCalled()
    const fetchUrl = fetch.mock.calls.at(-1)[0]
    expect(String(fetchUrl)).toMatch(/splash=\d+/)
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
    vi.spyOn(window, 'setTimeout').mockImplementation(() => 1)
    vi.spyOn(window, 'clearTimeout').mockImplementation(() => {})

    const el = {
      paused: false,
      ended: false,
      currentTime: 0,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    const cancel = watchLogoSplashProgress(el, { timeoutMs: 50, onStalled })
    const first = rafCbs.shift()
    now = 1_020
    first(now)
    expect(onStalled).not.toHaveBeenCalled()
    const second = rafCbs.shift()
    now = 1_060
    second(now)
    expect(onStalled).toHaveBeenCalledTimes(1)
    cancel()
  })
})
