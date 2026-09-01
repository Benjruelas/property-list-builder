/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  scheduleLogoSplashComplete,
  LOGO_SPLASH_ANIM_MS,
  LOGO_SPLASH_WEBP_SRC,
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
  beforeEach(() => {
    clearBootLogoLayout()
    vi.useFakeTimers()
  })

  afterEach(() => {
    clearBootLogoLayout()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('exposes the WebP splash asset and duration', () => {
    expect(LOGO_SPLASH_WEBP_SRC).toContain('.webp')
    expect(LOGO_SPLASH_ANIM_MS).toBe(4150)
  })

  it('schedules splash completion after the animation duration', () => {
    const onDone = vi.fn()
    const cancel = scheduleLogoSplashComplete(onDone, 1000)
    expect(onDone).not.toHaveBeenCalled()
    vi.advanceTimersByTime(999)
    expect(onDone).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onDone).toHaveBeenCalledWith(true)
    cancel()
  })

  it('cancel prevents late completion', () => {
    const onDone = vi.fn()
    const cancel = scheduleLogoSplashComplete(onDone, 500)
    cancel()
    vi.advanceTimersByTime(1000)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('uses unit cover scale', () => {
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
})
